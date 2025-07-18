# Vitest Azure Reporter

![GitHub](https://img.shields.io/github/license/akshaybheda/vitest-azure-reporter) ![npm (scoped)](https://img.shields.io/npm/v/%40akshaybheda%2Fvitest-azure-reporter) ![npm](https://img.shields.io/npm/dw/%40akshaybheda%2Fvitest-azure-reporter) ![npm](https://img.shields.io/npm/dt/%40akshaybheda%2Fvitest-azure-reporter)

A Vitest reporter that integrates with Azure DevOps Test Plans to automatically publish test results.

## Features

- 🎯 **Smart Workflow**: Only runs Azure DevOps integration if tests have case ID annotations
- 🚀 **Modern ES Modules**: Full ES module support with Node.js 20+
- 🔧 **Flexible Configuration**: Supports multiple configuration IDs and custom test point mapping
- 📋 **Test Case IDs**: Extract test case IDs from test names with `[1234]` format
- 🔄 **Automatic Test Run Management**: Creates and completes test runs automatically
- ⚡ **Efficient Processing**: Uses `onTestModuleEnd` for batch processing of test results

## Requirements

- **Node.js 20.0.0 or higher**
- **ES Module support** (this package is published as ES modules)
- **Vitest** as your test runner

## Important Notes

**Optimized Workflow**: The reporter will only create Azure DevOps test runs and publish results if your tests contain test case ID annotations or test name IDs. Tests without either will run normally but won't trigger any Azure DevOps integration, making it efficient for mixed test suites.

**Configuration Requirements**: The reporter requires defining `testRunConfig.configurationIds` or a `testPointMapper` function in the reporter config to avoid publishing results for all configurations.

**Test Case ID Methods**: You can associate Azure DevOps test case IDs using test names that include `[1234]` format where `1234` is your Azure DevOps test case ID.

## Installation

Install the package:

```bash
npm install @akshaybheda/vitest-azure-reporter
```

or

```bash
yarn add @akshaybheda/vitest-azure-reporter
```

## Usage

### Basic Setup

You must register an ID of already existing test cases from Azure DevOps before running tests. The reporter extracts test case IDs from test names that include IDs wrapped in square brackets.

### Test Case ID Formats

The vitest-azure-reporter supports two methods for defining Azure DevOps test case IDs:

#### Method 1: Using Vitest Annotations (Recommended)

Use Vitest's built-in `annotate()` function to attach test case IDs:

```typescript
import { describe, expect, it } from 'vitest';

describe('[1698831] Sample test suite', () => {
  it('test 1 - annotation only', async ({ annotate }) => {
    await annotate('[1698818]');
    expect(1 + 1).toBe(2);
  });

  it('test 3 - both methods', async ({ annotate }) => {
    await annotate('[1698834,1698835]');
    // This test will be reported for IDs: 1698833, 1698834, 1698835
    expect(3 + 3).toBe(6);
  });
});
```

#### Method 2: Test Name-Based IDs

You can also define test case IDs directly in test names using square brackets:

```typescript
import { describe, expect, it } from 'vitest';

describe('[1698831] Sample test suite', () => {
  it('[1698832] test 2 - name only', () => {
    expect(2 + 2).toBe(4);
  });

  it('[1001,1002,1003] should handle multiple test cases', () => {
    expect(true).toBe(true);
  });

  it('should test user authentication [2001]', () => {
    // Your test logic here
    expect('user').toBe('user');
  });

  it.skip('[3001] skipped test example', () => {
    expect(true).toBe(true);
  });

  it('[4001] failing test example', () => {
    expect(true).toBe(false); // This will fail and be reported
  });
});
```

#### Method 3: Combining Both Methods

You can use both methods in the same test - the reporter will extract IDs from both sources:

```typescript
describe('[1698831] Sample test suite', () => {
  it('[1698833] test 3 - both methods', async ({ annotate }) => {
    await annotate('[1698834,1698835]');
    // This test will be reported for IDs: 1698833, 1698834, 1698835
    expect(3 + 3).toBe(6);
  });
});
```

#### Tests Without Test Case IDs

Tests without test case IDs (no annotations and no IDs in test names) will be ignored by the reporter:

```typescript
describe('[1698831] Sample test suite', () => {
  it('test 4 - no IDs (will be skipped)', () => {
    expect(4 + 4).toBe(8);
  });
});

// Example of tests without test case IDs - these won't be reported to Azure DevOps
describe('Tests without test case IDs', () => {
  it('should pass but not be reported to Azure DevOps', () => {
    expect(2 + 2).toBe(4);
  });

  it('another test without Azure DevOps integration', () => {
    expect('hello').toBe('hello');
  });
});
```

### Supported Test Case ID Formats

You can define multiple test cases for a single test:

- `[1001]` - single test case
- `[1001,1002,1003]` - multiple test cases (comma-separated)
- `[1001, 1002, 1003]` - multiple test cases with spaces
- `[1001] Test one [1002] Test two [1003][1004] Test three and four` - combined formats in test names

### Vitest Configuration

Configure the Vitest Azure Reporter in your `vitest.config.ts`:

#### Method 1: Using Import Path (Recommended)

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: [
      'default', // Keep the default reporter for console output
      [
        '@akshaybheda/vitest-azure-reporter',
        {
          orgUrl: process.env.AZURE_ORG_URL || 'https://dev.azure.com/your-organization',
          projectName: process.env.AZURE_PROJECT_NAME || 'your-project',
          planId: parseInt(process.env.AZURE_PLAN_ID || '123456'),
          token: process.env.AZURE_TOKEN,
          environment: process.env.AZURE_ENVIRONMENT || 'Development',
          testRunTitle: 'Vitest Test Run - Local Development',
          testRunConfig: {
            comment: 'Vitest Test Run',
            // Get configuration IDs from: https://dev.azure.com/{organization}/{project}/_apis/test/configurations
            configurationIds: [39, 42], // Your configuration IDs
          },
          logging: true, // Enable logging for debugging
        },
      ],
    ],
  },
});
```

#### Method 2: Using Constructor (Alternative)

```typescript
import { defineConfig } from 'vitest/config';
import { AzureDevOpsReporter } from '@akshaybheda/vitest-azure-reporter';

export default defineConfig({
  test: {
    reporters: [
      'default',
      new AzureDevOpsReporter({
        orgUrl: process.env.AZURE_ORG_URL || 'https://dev.azure.com/your-organization',
        projectName: process.env.AZURE_PROJECT_NAME || 'your-project',
        planId: parseInt(process.env.AZURE_PLAN_ID || '123456'),
        token: process.env.AZURE_TOKEN,
        environment: process.env.AZURE_ENVIRONMENT || 'Development',
        testRunTitle: 'Vitest Test Run',
        testRunConfig: {
          comment: 'Vitest Test Run',
          configurationIds: [39, 42],
        },
        logging: true,
      }),
    ],
  },
});
```

## Configuration Options

Reporter options (\* - required):

### Required Options

- \*`token` [string] - Azure DevOps Personal Access Token. You can find more information [here](https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops&tabs=Windows)
- \*`orgUrl` [string] - Full URL for your organization space. Example: `https://dev.azure.com/your-organization-name`

  > **Note:** Some APIs (e.g. ProfileApi) can't be hit at the org level and need to be hit at the deployment level, so URL should be structured like `https://vssps.dev.azure.com/{yourorgname}`

- \*`projectName` [string] - Name of your project (can be found in the Azure DevOps URL). Example: `https://dev.azure.com/alex-neo/SampleProject/` - **SampleProject**
- \*`planId` [number] - ID of test plan. You can find it in the test plan URL. Example: `https://dev.azure.com/alex-neo/SampleProject/_testPlans/execute?planId=4&suiteId=6` - **planId=4**

### Optional Configuration

- `environment` [string] - Environment name that will be used as prefix for all test runs. Default: `undefined`. Example: `'Development'`, `'QA'`, `'Production'`
- `logging` [boolean] - Enable debug logging from reporter. Default: `false`
- `isDisabled` [boolean] - Disable reporter entirely. Default: `false`
- `testRunTitle` [string] - Title of test run used to create new test run. Default: `'Vitest Test Run'`
- `testRunConfig` [object] - Extra data to pass when creating Test Run. See [Azure DevOps REST API documentation](https://learn.microsoft.com/en-us/rest/api/azure/devops/test/runs/create?view=azure-devops-rest-7.1&tabs=HTTP#request-body) for more information. Default: `{}`

  Example:

  ```typescript
  testRunConfig: {
    owner: {
      displayName: 'John Doe',
    },
    comment: 'Automated test run from CI/CD pipeline',
    configurationIds: [39, 42], // Configuration IDs for your test environment
  }
  ```

- `testPointMapper` [function] - A callback to map test runs to test configurations (e.g., by environment, browser, etc.)

  ```typescript
  import type { TestModule } from 'vitest';
  import type { TestPoint } from 'azure-devops-node-api/interfaces/TestInterfaces';

  testPointMapper: async (testModule: TestModule, testPoints: TestPoint[]) => {
    // Example: Map based on environment variable
    const environment = process.env.TEST_ENVIRONMENT;
    switch (environment) {
      case 'staging':
        return testPoints.filter((testPoint) => testPoint.configuration.id === '39');
      case 'production':
        return testPoints.filter((testPoint) => testPoint.configuration.id === '42');
      default:
        return testPoints.filter((testPoint) => testPoint.configuration.id === '39');
    }
  };
  ```

### Advanced Options

- `publishTestResultsMode` [string] - Mode of publishing test results. Default: `'testRun'`. Available options:

  - `'testResult'` - Publish results of tests at the end of each test, parallel to test run
  - `'testRun'` - Publish test results to test run at the end of test run (recommended)

    > **Note:** If you use `testRun` mode and have the same test cases in different tests, results will be overwritten with the last test result.

- `isExistingTestRun` [boolean] - Publish test results to an existing test run. In this mode, test results are only added to the existing test run without creation and completion. Default: `false`

  > **Note:** If you use `isExistingTestRun` mode, `testRunId` should be specified.

- `testRunId` [number] - ID of existing test run. Used only for `isExistingTestRun` mode. Can also be set by `AZURE_VITEST_TEST_RUN_ID` environment variable. Default: `undefined`

  > **Note:** If you set existing test run ID from both reporter options and environment variable, reporter options will take precedence.

  > **Note:** If you use `isExistingTestRun` mode, the test run doesn't complete automatically. You should complete it manually.

## Environment Variables

### Available Environment Variables

- **`AZURE_VITEST_TEST_RUN_ID`** - ID of current test run. Set automatically after test run creation. Can be accessed via `process.env.AZURE_VITEST_TEST_RUN_ID`

  > **Note:** This variable is available in your CI/CD pipeline and can be used for further automation or reporting.

  Example usage in Azure DevOps pipeline:

  ```yaml
  - script: npm test
    displayName: 'Run Vitest tests'
    name: 'vitest'
    env:
      CI: 'true'

  - script: echo $(vitest.AZURE_VITEST_TEST_RUN_ID)
    displayName: 'Print test run ID'
  ```

- **`AZURE_VITEST_DEBUG`** - Enable debug logging from reporter. Values: `'0'` (disabled), `'1'` (enabled). Default: `'0'`

  Example usage in Azure DevOps pipeline:

  ```yaml
  - script: npm test
    displayName: 'Run Vitest tests'
    name: 'vitest'
    env:
      CI: 'true'
      AZURE_VITEST_DEBUG: '1'
  ```

## Examples

### CI/CD Pipeline Example

```yaml
# Azure DevOps Pipeline
- task: NodeTool@0
  displayName: 'Use Node.js 20'
  inputs:
    versionSpec: '20.x'

- script: npm ci
  displayName: 'Install dependencies'

- script: npm test
  displayName: 'Run tests with Azure DevOps integration'
  env:
    AZURE_TOKEN: $(AZURE_TOKEN)
    AZURE_ORG_URL: 'https://dev.azure.com/your-organization'
    AZURE_PROJECT_NAME: 'your-project'
    AZURE_PLAN_ID: '123456'
    AZURE_ENVIRONMENT: 'CI'
    CI: 'true'
```

### Local Development Setup

Create a `.env` file in your project root:

```bash
AZURE_TOKEN=your-personal-access-token
AZURE_ORG_URL=https://dev.azure.com/your-organization
AZURE_PROJECT_NAME=your-project
AZURE_PLAN_ID=123456
AZURE_ENVIRONMENT=Development
```

Then use in your `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  test: {
    reporters: [
      'default',
      [
        '@akshaybheda/vitest-azure-reporter',
        {
          orgUrl: process.env.AZURE_ORG_URL,
          projectName: process.env.AZURE_PROJECT_NAME,
          planId: parseInt(process.env.AZURE_PLAN_ID || '0'),
          token: process.env.AZURE_TOKEN,
          environment: process.env.AZURE_ENVIRONMENT,
          testRunTitle: `Vitest Test Run - ${process.env.AZURE_ENVIRONMENT}`,
          testRunConfig: {
            comment: `Test run from ${process.env.USER || 'Unknown User'}`,
            configurationIds: [39], // Your default configuration
          },
          logging: process.env.NODE_ENV === 'development',
        },
      ],
    ],
  },
});
```

## Troubleshooting

### Common Issues

1. **No test results published**

   - Ensure your tests have test case IDs in the format `[1234]` in test names
   - Check that `configurationIds` are correctly set in `testRunConfig`
   - Verify your Azure DevOps token has sufficient permissions

2. **Authentication errors**

   - Verify your Azure DevOps Personal Access Token is valid
   - Ensure the token has "Test Plans (read & write)" permissions
   - Check that `orgUrl` and `projectName` are correct

3. **Test case IDs not recognized**
   - Verify test case IDs exist in your Azure DevOps Test Plan
   - Ensure test case IDs are wrapped in square brackets `[1234]` in test names
   - Make sure test case IDs are valid numbers and exist in your test plan
   - The reporter uses the pattern `/\[([0-9,\s]+)\]/g` to extract IDs from test names

### Debug Mode

Enable debug logging to troubleshoot issues:

```typescript
{
  // ... other options
  logging: true,
}
```

Or set the environment variable:

```bash
AZURE_VITEST_DEBUG=1 npm test
```
