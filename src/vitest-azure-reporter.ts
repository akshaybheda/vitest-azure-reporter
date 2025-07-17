import { WebApi } from 'azure-devops-node-api';
import * as azdev from 'azure-devops-node-api';
import type { IRequestOptions } from 'azure-devops-node-api/interfaces/common/VsoBaseInterfaces';
import type * as TestInterfaces from 'azure-devops-node-api/interfaces/TestInterfaces';
import type * as Test from 'azure-devops-node-api/TestApi';
import type { Reporter, TestCase } from 'vitest/node';

import Logger from './logger';

export interface AzureReporterOptions {
  token: string;
  planId: number;
  orgUrl: string;
  projectName: string;
  environment?: string;
  testRunTitle?: string;
  testRunConfig?: Omit<TestInterfaces.RunCreateModel, 'name' | 'automated' | 'plan' | 'pointIds'>;
  logging?: boolean;
  testPointMapper?: (
    // eslint-disable-next-line no-unused-vars
    testCase: TestCase,
    // eslint-disable-next-line no-unused-vars
    testPoints: TestInterfaces.TestPoint[]
  ) => Promise<TestInterfaces.TestPoint[] | undefined>;
}

interface TestResult {
  testCase: TestCase;
  caseIds: string[];
  outcome: string;
  duration: number;
  error?: string;
  stack?: string;
}

class AzureDevOpsReporter implements Reporter {
  private readonly logger: Logger;
  private testApi: Promise<Test.ITestApi>;
  private readonly azureConnection: WebApi;
  private readonly options: Required<AzureReporterOptions>;
  private readonly pendingResults: TestResult[] = [];
  private testRunId?: number;
  private readonly testPointMapper: (
    // eslint-disable-next-line no-unused-vars
    testCase: TestCase,
    // eslint-disable-next-line no-unused-vars
    testPoints: TestInterfaces.TestPoint[]
  ) => Promise<TestInterfaces.TestPoint[] | undefined>;

  constructor(options: AzureReporterOptions) {
    // Default test point mapper
    const defaultTestPointMapper = async (
      testCase: TestCase,
      testPoints: TestInterfaces.TestPoint[]
    ): Promise<TestInterfaces.TestPoint[] | undefined> => {
      if (testPoints.length > 1) {
        console.warn(
          `There are ${testPoints.length} testPoints found for the test case "${testCase.name}". ` +
          'You should set testRunConfig.configurationIds and/or use a testPointMapper!'
        );
      }
      return testPoints;
    };

    this.options = {
      environment: '',
      testRunTitle: 'Vitest Test Run',
      logging: false,
      testPointMapper: defaultTestPointMapper,
      ...options
    } as Required<AzureReporterOptions>;

    this.testPointMapper = options.testPointMapper || defaultTestPointMapper;
    this.logger = new Logger(this.options.logging);

    // Validate required configuration options
    this.validateConfig();

    // Initialize Azure DevOps connection
    this.azureConnection = new azdev.WebApi(
      this.options.orgUrl,
      azdev.getPersonalAccessTokenHandler(this.options.token),
      {
        allowRetries: true,
        maxRetries: 5
      } as IRequestOptions
    );

    // Initialize test API
    this.testApi = this.azureConnection.getTestApi();
  }

  private validateConfig(): void {
    const requiredFields: Array<keyof AzureReporterOptions> = ['orgUrl', 'projectName', 'planId', 'token'];

    for (const field of requiredFields) {
      if (!this.options[field]) {
        const errorMessage = `'${field}' is not set. Reporting is disabled.`;
        this.logger.warn(errorMessage);
        throw new Error(errorMessage);
      }
    }

    // Validate orgUrl format
    try {
      new URL(this.options.orgUrl);
    } catch {
      const errorMessage = `'orgUrl' must be a valid URL. Reporting is disabled.`;
      this.logger.warn(errorMessage);
      throw new Error(errorMessage);
    }

    // Validate planId is a positive number
    if (typeof this.options.planId !== 'number' || this.options.planId <= 0) {
      const errorMessage = `'planId' must be a positive number. Reporting is disabled.`;
      this.logger.warn(errorMessage);
      throw new Error(errorMessage);
    }
  }

  private getCaseIdsFromAnnotations(testCase: TestCase): string[] {
    const caseIds: string[] = [];
    const annotations = testCase.annotations();

    this.logger.info(`Checking annotations for test: ${testCase.name}`);
    this.logger.info(`Found ${annotations.length} annotation(s)`);

    annotations.forEach((annotation, index) => {
      this.logger.info(`Annotation ${index + 1}: type="${annotation.type}", message="${annotation.message}"`);

      if (annotation.message) {
        // Regex to match [123] or [123,456,789] patterns
        const idRegex = /\[([0-9,\s]+)\]/g;
        let match;
        while ((match = idRegex.exec(annotation.message)) !== null) {
          const ids = match[1].split(',').map(id => id.trim()).filter(id => id.length > 0);
          this.logger.info(`Found case IDs in annotation: ${ids.join(', ')}`);
          caseIds.push(...ids);
        }
      }
    });

    // Also check the test name directly for case IDs
    const testNameRegex = /\[([0-9,\s]+)\]/g;
    let nameMatch;
    while ((nameMatch = testNameRegex.exec(testCase.name)) !== null) {
      const ids = nameMatch[1].split(',').map(id => id.trim()).filter(id => id.length > 0);
      this.logger.info(`Found case IDs in test name: ${ids.join(', ')}`);
      caseIds.push(...ids);
    }

    const uniqueIds = [...new Set(caseIds)];
    this.logger.info(`Final unique case IDs: ${uniqueIds.join(', ')}`);
    return uniqueIds;
  }

  private getAzureStatus(state: 'passed' | 'failed' | 'skipped' | 'pending'): string {
    switch (state) {
      case 'passed':
        return 'Passed';
      case 'failed':
        return 'Failed';
      case 'skipped':
        return 'NotApplicable';
      case 'pending':
        return 'Paused';
      default:
        return 'NotApplicable';
    }
  }

  private async getTestPointsForTestCases(testCases: string[]): Promise<Map<string, TestInterfaces.TestPoint[]>> {
    const result = new Map<string, TestInterfaces.TestPoint[]>();

    try {
      const testcaseIds = testCases.map(id => parseInt(id, 10));
      const pointsQuery: TestInterfaces.TestPointsQuery = {
        pointsFilter: { testcaseIds: testcaseIds },
      };

      const api = await this.testApi;
      const pointsQueryResult = await api.getPointsByQuery(pointsQuery, this.options.projectName);

      if (pointsQueryResult.points) {
        for (const point of pointsQueryResult.points) {
          if (point.testCase?.id) {
            const testCaseId = point.testCase.id;
            if (!result.has(testCaseId)) {
              result.set(testCaseId, []);
            }
            result.get(testCaseId)!.push(point);
          }
        }
      }

      this.logger.info(`Retrieved test points for ${result.size} test case(s)`);
    } catch (error: any) {
      this.logger.error(`Error retrieving test points: ${error.message}`);
    }

    return result;
  }

  private filterTestPoints(
    testPoints: TestInterfaces.TestPoint[],
    testCaseId: string
  ): TestInterfaces.TestPoint[] {
    return testPoints?.filter((testPoint) => {
      // Filter by plan ID
      if (!testPoint.testPlan?.id || parseInt(testPoint.testPlan.id, 10) !== this.options.planId) {
        this.logger.debug(`Filtered out test point: wrong plan ID (${testPoint.testPlan?.id} vs ${this.options.planId})`);
        return false;
      }

      // Filter by test case ID
      if (!testPoint.testCase?.id || testPoint.testCase.id !== testCaseId) {
        this.logger.debug(`Filtered out test point: wrong test case ID (${testPoint.testCase?.id} vs ${testCaseId})`);
        return false;
      }

      // Filter by configuration IDs if specified
      if (this.options.testRunConfig?.configurationIds?.length) {
        const configIds = this.options.testRunConfig.configurationIds;
        const pointConfigId = testPoint.configuration?.id ? parseInt(testPoint.configuration.id, 10) : null;
        if (pointConfigId && !configIds.includes(pointConfigId)) {
          this.logger.debug(`Filtered out test point: wrong configuration ID (${pointConfigId} not in [${configIds.join(', ')}])`);
          return false;
        }
      }

      return true;
    }) || [];
  }

  async onInit() {
    try {
      const runTitle = `${this.options.environment ? `[${this.options.environment}] ` : ''}${this.options.testRunTitle}`;

      // Create a new test run
      const api = await this.testApi;
      
      // Prepare run model similar to Playwright reporter
      const runModel: TestInterfaces.RunCreateModel = {
        name: runTitle,
        automated: true,
        plan: { id: String(this.options.planId) },
        ...(this.options.testRunConfig
          ? this.options.testRunConfig
          : {
              configurationIds: [1],
            }),
      };

      this.logger.info(`Creating test run with configuration: ${JSON.stringify(runModel, null, 2)}`);

      const run = await api.createTestRun(runModel, this.options.projectName);

      if (!run?.id) {
        throw new Error('Failed to create test run');
      }

      this.testRunId = run.id;
      this.logger.info(`Created test run ${run.id}`);
    } catch (error: any) {
      this.logger.error(`Error creating test run: ${error.message}`);
      throw error;
    }
  }

  async onTestRunEnd() {
    this.logger.info('🚀 Starting onTestRunEnd...');

    try {
      if (this.pendingResults.length === 0) {
        this.logger.info('No test results to publish');
        return;
      }

      this.logger.info(`Processing ${this.pendingResults.length} pending test result(s)`);

      const api = await this.testApi;
      if (!this.testRunId) {
        throw new Error('No test run ID available');
      }

      // Group results by case ID
      const resultsByCase = new Map<string, TestResult[]>();
      for (const result of this.pendingResults) {
        this.logger.info(`Processing result for test "${result.testCase.name}" with case IDs: ${result.caseIds.join(', ')}`);

        for (const caseId of result.caseIds) {
          const results = resultsByCase.get(caseId) || [];
          results.push(result);
          resultsByCase.set(caseId, results);
        }
      }

      this.logger.info(`Grouped results into ${resultsByCase.size} unique case ID(s)`);

      // Get all test case IDs for fetching test points
      const allCaseIds = Array.from(resultsByCase.keys());
      const testPointsMap = await this.getTestPointsForTestCases(allCaseIds);

      // Create test results
      const testResults: TestInterfaces.TestCaseResult[] = [];
      for (const [caseId, results] of resultsByCase) {
        // Use latest result for this case ID
        const result = results[results.length - 1];

        this.logger.info(`Creating result for case ID ${caseId}: ${result.outcome} (${result.duration}ms)`);

        // Get and filter test points for this test case
        const allTestPoints = testPointsMap.get(caseId) || [];
        const filteredTestPoints = this.filterTestPoints(allTestPoints, caseId);

        // Use test point mapper to resolve which test points to use
        const selectedTestPoints = await this.testPointMapper(result.testCase, filteredTestPoints);

        if (!selectedTestPoints || selectedTestPoints.length === 0) {
          this.logger.warn(`No test points found for test case ${caseId}. Creating result without test point.`);

          // Create result without test point (for unplanned tests)
          const testCaseResult: TestInterfaces.TestCaseResult = {
            testCase: { id: caseId },
            testCaseTitle: result.testCase.name,
            testCaseRevision: 1,
            outcome: result.outcome,
            state: 'Completed',
            durationInMs: result.duration,
            errorMessage: result.error,
            stackTrace: result.stack,
          };

          testResults.push(testCaseResult);
        } else {
          // Create results for each selected test point
          for (const testPoint of selectedTestPoints) {
            this.logger.info(`Creating result for test point ${testPoint.id} (case ${caseId})`);

            const testCaseResult: TestInterfaces.TestCaseResult = {
              testCase: { id: caseId },
              testCaseTitle: result.testCase.name,
              testCaseRevision: 1,
              testPoint: { id: String(testPoint.id) },
              outcome: result.outcome,
              state: 'Completed',
              durationInMs: result.duration,
              errorMessage: result.error,
              stackTrace: result.stack,
            };

            testResults.push(testCaseResult);
          }
        }
      }

      this.logger.info(`Publishing ${testResults.length} test result(s) to Azure DevOps...`);

      // Publish results
      await api.addTestResultsToTestRun(testResults, this.options.projectName, this.testRunId);
      this.logger.info(`Published ${testResults.length} test results`);

      // Complete the test run
      this.logger.info(`Completing test run ${this.testRunId}...`);
      await api.updateTestRun(
        { state: 'Completed' },
        this.options.projectName,
        this.testRunId
      );
      this.logger.info(`Completed test run ${this.testRunId}`);
    } catch (error: any) {
      this.logger.error(`Error publishing test results: ${error.message}`);
      this.logger.error(`Stack trace: ${error.stack}`);
      throw error;
    }
  }

  onTestCaseResult(test: TestCase) {
    this.logger.info(`Processing test: ${test.name} (state: ${test.result().state})`);

    const caseIds = this.getCaseIdsFromAnnotations(test);
    this.logger.info(`Extracted case IDs: ${caseIds.length > 0 ? caseIds.join(', ') : 'none'}`);

    if (caseIds.length === 0) {
      this.logger.info(`Skipping test "${test.name}" - no case IDs found`);
      return;
    }

    const result = test.result();
    const diagnostic = test.diagnostic();
    const testResult: TestResult = {
      testCase: test,
      caseIds,
      outcome: this.getAzureStatus(result.state),
      duration: diagnostic?.duration || (test as any).task.result?.duration || 0,
    };

    this.logger.info(`Mapped ${result.state} -> ${testResult.outcome} for test "${test.name}"`);

    // Check the test result state for errors
    if (result.state === 'failed' && result.errors && result.errors.length > 0) {
      this.logger.info(`Capturing ${result.errors.length} error(s) for failed test`);
      testResult.error = result.errors
        .map((error: any, idx: number) => `ERROR #${idx + 1}:\n${error.message?.replace(/\u001b\[.*?m/g, '')}`)
        .join('\n\n');
      testResult.stack = result.errors
        .map((error: any, idx: number) => `STACK #${idx + 1}:\n${error.stack?.replace(/\u001b\[.*?m/g, '')}`)
        .join('\n\n');
    }

    this.pendingResults.push(testResult);
    this.logger.info(`Added test result. Total pending: ${this.pendingResults.length}`);
  }
}

export default AzureDevOpsReporter;
