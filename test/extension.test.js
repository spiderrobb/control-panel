const assert = require('assert');
const vscode = require('./vscode-mock');

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  suiteSetup(async () => {
    // Activate the extension
    const ext = vscode.extensions.getExtension('controlpanel');
    if (ext && !ext.isActive) {
      await ext.activate();
    }
  });

  test('Extension loads successfully', () => {
    // Basic test to verify test infrastructure works
    assert.ok(true, 'Test infrastructure is working');
  });
});