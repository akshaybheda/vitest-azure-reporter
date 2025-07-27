import { WebApi } from 'azure-devops-node-api';
import * as azdev from 'azure-devops-node-api';
import type { IRequestOptions } from 'azure-devops-node-api/interfaces/common/VsoBaseInterfaces';
import type * as TestInterfaces from 'azure-devops-node-api/interfaces/TestInterfaces';
import type * as Test from 'azure-devops-node-api/TestApi';
import type { Reporter, TestCase, TestCollection, TestModule } from 'vitest/node';
import Logger from './logger.js';

export interface AzureReporterOptions {
  token: string;
  planId: number;
  orgUrl: string;
  projectName: string;
  environment?: string;
  testRunTitle?: string;
  testRunConfig?: Omit<TestInterfaces.RunCreateModel, 'name' | 'automated' | 'plan' | 'pointIds'>;
  logging?: boolean;
  isDisabled?: boolean;
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
  private testApi!: Promise<Test.ITestApi>;
  private readonly azureConnection!: WebApi;
  private readonly azureOptions: Required<AzureReporterOptions>;
  private readonly pendingResults: TestResult[] = [];
  private testRunId?: number;
  private hasAnnotatedTests: boolean = false;
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

    this.azureOptions = {
      environment: '',
      testRunTitle: 'Vitest Test Run',
      logging: false,
      testPointMapper: defaultTestPointMapper,
      isDisabled: false,
      ...options
    } as Required<AzureReporterOptions>;

    this.testPointMapper = options.testPointMapper || defaultTestPointMapper;
    this.logger = new Logger(this.azureOptions.logging);

    // Skip validation and Azure connection if disabled
    if (this.azureOptions.isDisabled) {
      this.logger.info('Azure DevOps Reporter is disabled. Skipping validation and connection setup.');
      return;
    }

    // Validate required configuration options
    this.validateConfig();

    // Initialize Azure DevOps connection
    this.azureConnection = new azdev.WebApi(
      this.azureOptions.orgUrl,
      azdev.getPersonalAccessTokenHandler(this.azureOptions.token),
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
      if (!this.azureOptions[field]) {
        const errorMessage = `'${field}' is not set. Reporting is disabled.`;
        this.logger.warn(errorMessage);
        throw new Error(errorMessage);
      }
    }

    // Validate orgUrl format
    try {
      new URL(this.azureOptions.orgUrl);
    } catch {
      const errorMessage = `'orgUrl' must be a valid URL. Reporting is disabled.`;
      this.logger.warn(errorMessage);
      throw new Error(errorMessage);
    }

    // Validate planId is a positive number
    if (typeof this.azureOptions.planId !== 'number' || this.azureOptions.planId <= 0) {
      const errorMessage = `'planId' must be a positive number. Reporting is disabled.`;
      this.logger.warn(errorMessage);
      throw new Error(errorMessage);
    }
  }

  private getCaseIdsFromAnnotations(testCase: TestCase): string[] {
    const caseIds: string[] = [];

    // Get annotations from the test case (includes await annotate() calls)
    const annotations = testCase.annotations() || [];

    if (Array.isArray(annotations)) {
      annotations.forEach((annotation: any) => {
        if (annotation.message) {
          // Regex to match [123] or [123,456,789] patterns
          const idRegex = /\[([0-9,\s]+)\]/g;
          let match;
          while ((match = idRegex.exec(annotation.message)) !== null) {
            const ids = match[1].split(',').map(id => id.trim()).filter(id => id.length > 0);
            caseIds.push(...ids);
          }
        }
      });
    }

    // Also check the test name directly for case IDs
    const testNameRegex = /\[([0-9,\s]+)\]/g;
    let nameMatch;
    while ((nameMatch = testNameRegex.exec(testCase.name)) !== null) {
      const ids = nameMatch[1].split(',').map(id => id.trim()).filter(id => id.length > 0);
      caseIds.push(...ids);
    }

    const uniqueIds = [...new Set(caseIds)];
    return uniqueIds;
  }

  private getAzureStatus(state: string): string {
    switch (state) {
      case 'passed':
        return 'Passed';
      case 'failed':
        return 'Failed';
      case 'skipped':
        return 'NotApplicable';
      case 'pending':
        return 'Paused';
      case 'unknown':
      default:
        return 'Passed'; // Default to passed if we can't determine the state
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
      const pointsQueryResult = await api.getPointsByQuery(pointsQuery, this.azureOptions.projectName);

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
      if (!testPoint.testPlan?.id || parseInt(testPoint.testPlan.id, 10) !== this.azureOptions.planId) {
        return false;
      }

      // Filter by test case ID
      if (!testPoint.testCase?.id || testPoint.testCase.id !== testCaseId) {
        return false;
      }

      // Filter by configuration IDs if specified
      if (this.azureOptions.testRunConfig?.configurationIds?.length) {
        const configIds = this.azureOptions.testRunConfig.configurationIds;
        const pointConfigId = testPoint.configuration?.id ? parseInt(testPoint.configuration.id, 10) : null;
        if (pointConfigId && !configIds.includes(pointConfigId)) {
          return false;
        }
      }

      return true;
    }) || [];
  }

  async onInit() {
    if (this.azureOptions.isDisabled) {
      this.logger.info('Azure DevOps Reporter is disabled. No Azure DevOps integration will be performed.');
      return;
    }
    // We'll defer initialization until we know there are annotated tests
    this.logger.info('Azure DevOps Reporter initialized. Will create test run only if annotated tests are found.');
  }

  private async ensureTestRunCreated() {
    if (this.azureOptions.isDisabled) {
      return; // Skip if disabled
    }

    if (this.testRunId || !this.hasAnnotatedTests) {
      return; // Already created or no annotated tests
    }

    try {
      const runTitle = `${this.azureOptions.environment ? `[${this.azureOptions.environment}] ` : ''}${this.azureOptions.testRunTitle}`;

      // Create a new test run
      const api = await this.testApi;

      // Prepare run model similar to Playwright reporter
      const runModel: TestInterfaces.RunCreateModel = {
        name: runTitle,
        automated: true,
        plan: { id: String(this.azureOptions.planId) },
        ...(this.azureOptions.testRunConfig
          ? this.azureOptions.testRunConfig
          : {
            configurationIds: [1],
          }),
      };

      const run = await api.createTestRun(runModel, this.azureOptions.projectName);

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
    if (this.azureOptions.isDisabled) {
      this.logger.info('Azure DevOps Reporter is disabled. Skipping test result publishing.');
      return;
    }

    try {
      if (!this.hasAnnotatedTests) {
        this.logger.info('No annotated tests found, skipping Azure DevOps workflow');
        return;
      }

      if (this.pendingResults.length === 0) {
        this.logger.info('No test results to publish');
        return;
      }

      const api = await this.testApi;
      if (!this.testRunId) {
        throw new Error('No test run ID available');
      }

      // Group results by case ID
      const resultsByCase = new Map<string, TestResult[]>();
      for (const result of this.pendingResults) {
        for (const caseId of result.caseIds) {
          const results = resultsByCase.get(caseId) || [];
          results.push(result);
          resultsByCase.set(caseId, results);
        }
      }

      // Get all test case IDs for fetching test points
      const allCaseIds = Array.from(resultsByCase.keys());
      const testPointsMap = await this.getTestPointsForTestCases(allCaseIds);

      // Create test results
      const testResults: TestInterfaces.TestCaseResult[] = [];
      for (const [caseId, results] of resultsByCase) {
        // Use latest result for this case ID
        const result = results[results.length - 1];

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

      // Publish results
      await api.addTestResultsToTestRun(testResults, this.azureOptions.projectName, this.testRunId);
      this.logger.info(`Published ${testResults.length} test results`);

      // Complete the test run
      await api.updateTestRun(
        { state: 'Completed' },
        this.azureOptions.projectName,
        this.testRunId
      );
      this.logger.info(`Completed test run ${this.testRunId}`);
    } catch (error: any) {
      this.logger.error(`Error publishing test results: ${error.message}`);
      this.logger.error(`Stack trace: ${error.stack}`);
      throw error;
    }
  }

  async onTestModuleEnd(testModule: TestModule): Promise<void> {
    if (this.azureOptions.isDisabled) {
      return; // Skip processing if disabled
    }

    // Process all test cases in the module
    const testCases = this.getAllTestCases(testModule);

    for (const testCase of testCases) {
      const result = testCase.result();
      const state = result?.state || 'unknown';

      const caseIds = this.getCaseIdsFromAnnotations(testCase);

      if (caseIds.length === 0) {
        continue;
      }

      // Mark that we found annotated tests
      this.hasAnnotatedTests = true;

      // Ensure test run is created now that we know we have annotated tests
      await this.ensureTestRunCreated();

      // Get duration from the test task if available
      const duration = (testCase as any).task?.result?.duration || 0;

      const testResult: TestResult = {
        testCase: testCase,
        caseIds,
        outcome: this.getAzureStatus(state),
        duration: duration,
      };

      // Check the test result state for errors
      if (state === 'failed' && result?.errors && result.errors.length > 0) {
        testResult.error = result.errors
          .map((error: any, idx: number) => `ERROR #${idx + 1}:\n${error.message?.replace(/\u001b\[.*?m/g, '')}`)
          .join('\n\n');
        testResult.stack = result.errors
          .map((error: any, idx: number) => `STACK #${idx + 1}:\n${error.stack?.replace(/\u001b\[.*?m/g, '')}`)
          .join('\n\n');
      }

      this.pendingResults.push(testResult);
    }
  }

  private getAllTestCases(testModule: TestModule): TestCase[] {
    const testCases: TestCase[] = [];

    function collectTestCases(collection: TestCollection): void {
      // Handle TestCollection which is iterable
      for (const child of collection) {
        if (child.type === 'test') {
          testCases.push(child as TestCase);
        } else if (child.children) {
          collectTestCases(child.children);
        }
      }
    }

    if (testModule.children) {
      collectTestCases(testModule.children);
    }

    return testCases;
  }
}

export default AzureDevOpsReporter;
