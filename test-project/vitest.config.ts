import { defineConfig } from 'vitest/config'


export default defineConfig({
    test: {
        reporters: [
            'default', // Keep the default reporter for console output
            [
                '../dist/vitest-azure-reporter.js',
                {
                    orgUrl: process.env.AZURE_ORG_URL || 'https://dev.azure.com/your-org',
                    projectName: process.env.AZURE_PROJECT_NAME || 'your-project',
                    planId: parseInt(process.env.AZURE_PLAN_ID || '123'),
                    token: process.env.AZURE_TOKEN || 'your-token',
                    environment: process.env.AZURE_ENVIRONMENT || 'Development',
                    testRunTitle: 'Vitest Test Run - Local Development',
                    testRunConfig: {
                        comment: "Vitest Test Run",
                        //Configurations are found here https://dev.azure.com/bentleycs/beconnect/_apis/test/configurations
                        configurationIds: [39, 42], // Default configuration
                    },
                    logging: true, // Enable logging for debugging
                }
            ]
        ],
    },
})
