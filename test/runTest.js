const path = require('path');

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    const extensionDevelopmentPath = path.resolve(__dirname, '../');

    // The path to test runner
    const extensionTestsPath = path.resolve(__dirname, './index');

    // Download VS Code, unzip it and run the integration test
    const { runTests } = require('@vscode/test-electron');
    
    await runTests({ 
      extensionDevelopmentPath, 
      extensionTestsPath,
      extensionTestsEnv: {
        DISPLAY: process.env.DISPLAY || ':99'
      },
      launchArgs: [
        '--disable-extensions',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };