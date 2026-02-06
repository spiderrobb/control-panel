/**
 * Factory helpers for creating properly-mocked MdxWebviewProvider and Logger
 * instances in tests.  Every test file should use these instead of manually
 * constructing mocks.
 */

// Ensure the mock is loaded before requiring source modules
const vscode = require('../mocks/vscode');

// Patch require cache so `require('vscode')` returns our mock everywhere.
// We can't use require.resolve('vscode') because the real module isn't installed,
// so we register it manually in the cache by module name.
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) {
  if (request === 'vscode') {
    return 'vscode';  // Return a stable key for the cache
  }
  return originalResolveFilename.call(this, request, ...args);
};
require.cache['vscode'] = {
  id: 'vscode',
  filename: 'vscode',
  loaded: true,
  exports: vscode,
};

const MdxWebviewProvider = require('../../src/providers/MdxWebviewProvider');
const Logger = require('../../src/Logger');

/**
 * Create an in-memory mock of `ExtensionContext`.
 */
function createMockContext(overrides = {}) {
  const globalStore = new Map();
  const workspaceStore = new Map();

  return {
    subscriptions: [],
    extensionPath: overrides.extensionPath || '/mock/extension/path',

    globalState: {
      get(key, defaultValue) {
        return globalStore.has(key) ? globalStore.get(key) : defaultValue;
      },
      update(key, value) {
        globalStore.set(key, value);
        return Promise.resolve();
      },
      _store: globalStore,               // test helper
    },

    workspaceState: {
      get(key, defaultValue) {
        return workspaceStore.has(key) ? workspaceStore.get(key) : defaultValue;
      },
      update(key, value) {
        workspaceStore.set(key, value);
        return Promise.resolve();
      },
      _store: workspaceStore,             // test helper
    },

    ...overrides,
  };
}

/**
 * Create a Logger backed by the mock OutputChannel.
 */
function createLogger(channelName = 'Test', bufferSize = 200) {
  return new Logger(channelName, bufferSize);
}

/**
 * Create a fully-wired MdxWebviewProvider.
 * Returns `{ provider, context, logger, view }`.
 *
 * `view` is a MockWebviewView already attached to `provider._view`
 * so that postMessage calls can be inspected.
 */
function createProvider(opts = {}) {
  const context = opts.context || createMockContext();
  const logger = opts.logger || createLogger();
  const provider = new MdxWebviewProvider(context, logger);

  // Optionally attach a mock webview view so postMessage works
  const view = new vscode.MockWebviewView();
  provider._view = view;

  return { provider, context, logger, view };
}

/**
 * Create a mock task-start event as fired by vscode.tasks.onDidStartTaskProcess.
 */
function createStartEvent(taskName) {
  const task = new vscode.MockTask(taskName);
  const execution = new vscode.MockTaskExecution(task);
  return { execution };
}

/**
 * Create a mock task-end event as fired by vscode.tasks.onDidEndTaskProcess.
 */
function createEndEvent(taskName, exitCode = 0) {
  const task = new vscode.MockTask(taskName);
  const execution = new vscode.MockTaskExecution(task);
  return { execution, exitCode };
}

/**
 * Stub `fs` methods commonly used by MdxWebviewProvider for file-loading.
 * Returns the sinon sandbox so tests can restore in teardown.
 */
function stubFs(sandbox, fileMap = {}) {
  const fs = require('fs');

  sandbox.stub(fs, 'existsSync').callsFake((p) => {
    return Object.prototype.hasOwnProperty.call(fileMap, p);
  });

  sandbox.stub(fs, 'readFileSync').callsFake((p, _encoding) => {
    if (Object.prototype.hasOwnProperty.call(fileMap, p)) {
      return fileMap[p];
    }
    throw new Error(`ENOENT: no such file or directory, open '${p}'`);
  });

  sandbox.stub(fs, 'writeFileSync').callsFake(() => {});
  sandbox.stub(fs, 'mkdirSync').callsFake(() => {});

  return fs;
}

module.exports = {
  createMockContext,
  createLogger,
  createProvider,
  createStartEvent,
  createEndEvent,
  stubFs,
  vscode,
};
