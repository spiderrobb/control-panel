/**
 * Mock implementation of VS Code API for testing
 */

// Mock terminal
class MockTerminal {
  constructor(name) {
    this.name = name;
    this.exitStatus = undefined;
    this.creationOptions = {};
    this.processId = Math.floor(Math.random() * 10000);
  }

  sendText(_text) {
    // Mock sending text to terminal
  }

  show() {
    // Mock showing terminal
  }

  hide() {
    // Mock hiding terminal
  }

  dispose() {
    // Mock disposing terminal
  }
}

// Mock extension
class MockExtension {
  constructor(id) {
    this.id = id;
    this.isActive = false;
    this.packageJSON = {};
    this.extensionPath = '/mock/extension/path';
  }

  async activate() {
    this.isActive = true;
    return {};
  }
}

// Mock extensions namespace
const extensions = {
  getExtension: (id) => {
    return new MockExtension(id);
  },
  all: []
};

// Mock window namespace
const window = {
  terminals: [],
  
  showInformationMessage: (message, ...items) => {
    console.log(`[INFO] ${message}`);
    return Promise.resolve(items[0]);
  },
  
  showWarningMessage: (message, ...items) => {
    console.log(`[WARN] ${message}`);
    return Promise.resolve(items[0]);
  },
  
  showErrorMessage: (message, ...items) => {
    console.log(`[ERROR] ${message}`);
    return Promise.resolve(items[0]);
  },
  
  createTerminal: (nameOrOptions) => {
    const terminal = new MockTerminal(
      typeof nameOrOptions === 'string' ? nameOrOptions : nameOrOptions?.name || 'Terminal'
    );
    window.terminals.push(terminal);
    return terminal;
  }
};

// Mock workspace namespace
const workspace = {
  workspaceFolders: [{
    uri: { fsPath: '/workspaces/ControlPanel' },
    name: 'ControlPanel',
    index: 0
  }],
  
  getConfiguration: (_section) => {
    return {
      get: (_key, defaultValue) => defaultValue,
      has: (_key) => false,
      inspect: (_key) => ({ defaultValue: undefined }),
      update: (_key, _value) => Promise.resolve()
    };
  },
  
  findFiles: (_include, _exclude) => {
    return Promise.resolve([]);
  }
};

// Mock commands namespace
const commands = {
  registerCommand: (_command, _callback) => {
    return { dispose: () => {} };
  },
  
  executeCommand: (_command, ..._args) => {
    return Promise.resolve();
  }
};

// Mock Uri class
class Uri {
  constructor(scheme, authority, path, query, fragment) {
    this.scheme = scheme;
    this.authority = authority;
    this.path = path;
    this.query = query;
    this.fragment = fragment;
  }

  static file(path) {
    return new Uri('file', '', path, '', '');
  }

  static parse(value) {
    // Simple implementation for testing
    return new Uri('file', '', value, '', '');
  }

  get fsPath() {
    return this.path;
  }

  toString() {
    return `${this.scheme}://${this.authority}${this.path}`;
  }
}

// Mock progress API
const ProgressLocation = {
  SourceControl: 1,
  Window: 10,
  Notification: 15
};

const window_progress = {
  withProgress: (options, task) => {
    const progress = {
      report: (value) => {
        if (value.message) {
          console.log(`[PROGRESS] ${value.message}`);
        }
      }
    };
    return task(progress, { isCancellationRequested: false });
  }
};

// Export the mock VS Code API
module.exports = {
  extensions,
  window: { ...window, withProgress: window_progress.withProgress },
  workspace,
  commands,
  Uri,
  ProgressLocation
};