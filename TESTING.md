# Testing the Vitest Azure DevOps Reporter

This guide shows you different ways to test the Vitest Azure DevOps reporter.

## Prerequisites

1. **Build the reporter first:**

   ```bash
   npm run build
   # or
   npx tsc --skipLibCheck
   ```

2. **Set up Azure DevOps:**
   - Create a Personal Access Token (PAT) with "Test Plans (read & write)" permissions
   - Note your organization URL, project name, and test plan ID

## Testing Methods

### 1. 🧪 Unit Tests (Validation Testing)

Test the reporter's validation logic without connecting to Azure DevOps:

```bash
cd test-project
npm install
npm run test:dry-run
```

This uses a mock reporter to verify the interface works correctly.

### 2. 🔧 Integration Testing (Real Azure DevOps)

**Step A: Configure Environment**

```bash
cd test-project
cp .env.example .env
# Edit .env with your actual Azure DevOps settings
```

**Step B: Run Tests**

```bash
npm run test
```

This will:

- Create a test run in Azure DevOps
- Report test results with case IDs from annotations
- Complete the test run

### 3. 🎯 Manual Testing with Different Scenarios

**Test different annotation patterns:**

```javascript
// In your test files, try these patterns:
describe('[123] Basic test', () => {
  it('[123] should work', () => {
    /* test */
  });
});

describe('Multiple IDs', () => {
  it('[456,789] should handle multiple IDs', () => {
    /* test */
  });
});

describe('No annotation test', () => {
  it('should be ignored by reporter', () => {
    /* test */
  });
});
```

### 4. 🐛 Debug Mode Testing

Enable detailed logging to see what's happening:

```typescript
// In vitest.config.ts
new AzureDevOpsReporter({
  // ... other options
  logging: true, // Enable detailed logging
});
```

### 5. 📊 Validation Testing

Test the configuration validation:

```bash
# Test with missing required fields
AZURE_TOKEN="" npm run test  # Should fail with validation error
AZURE_ORG_URL="" npm run test  # Should fail with validation error
```

## Expected Outputs

### ✅ Successful Test Run

```
✅ Mock: Test run created (ID: 150)
📝 Test [123] Sample test - passed
📝 Test [456] Multiple IDs test - passed
📝 Test [789] Failing test - failed
🚀 Publishing 3 test results...
✅ Test run completed
```

### ❌ Configuration Error

```
❌ 'token' is not set. Reporting is disabled.
❌ 'orgUrl' must be a valid URL. Reporting is disabled.
```

### 🔍 Debug Output

```
azure:log Created test run 150
azure:log Test [123] - passed (duration: 45ms)
azure:log Test [456,789] - failed (duration: 120ms)
azure:log Publishing 2 test results
azure:log Published test results successfully
azure:log Completed test run 150
```

## Troubleshooting

### Common Issues:

1. **"Failed to create test run"**

   - Check your PAT permissions
   - Verify organization URL and project name
   - Ensure plan ID exists

2. **"No test results to publish"**

   - Verify test names have annotations like [123]
   - Check the regex pattern matches your format

3. **TypeScript errors**
   - Run `npm run build` first
   - Check the dist/ folder was created

### Environment Variables Reference:

```bash
AZURE_ORG_URL=https://dev.azure.com/your-org
AZURE_PROJECT_NAME=YourProject
AZURE_PLAN_ID=123
AZURE_TOKEN=your-pat-token
AZURE_ENVIRONMENT=Development
```

## Next Steps

1. Start with the dry-run test to verify the setup
2. Configure your Azure DevOps settings
3. Run integration tests with real Azure DevOps
4. Integrate into your actual test suite
5. Set up CI/CD pipeline integration

## Advanced Testing

For comprehensive testing, you can also:

- Test with different test case ID formats
- Test error scenarios (network failures, invalid tokens)
- Test with large test suites
- Test concurrent test runs
- Verify test attachments (if you add that feature later)
