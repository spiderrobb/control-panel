/**
 * Test setup that conditionally loads vscode or mock
 */

let vscode;

try {
  // Try to load the real vscode module (when running in VS Code test environment)
  vscode = require('vscode');
} catch (error) {
  // If vscode module is not available, use our mock (when running in Node.js)
  vscode = require('./mocks/vscode');
}

module.exports = vscode;