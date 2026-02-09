/**
 * Comprehensive mock of the VS Code API for unit testing.
 *
 * Covers every API surface used by MdxWebviewProvider, Logger, and extension.js
 * so that tests can instantiate real classes without hitting Electron.
 */

const EventEmitter = require('events');

// ---------------------------------------------------------------------------
//  Utility: create a disposable
// ---------------------------------------------------------------------------
function disposable(fn) {
  return { dispose: fn || (() => {}) };
}

// ---------------------------------------------------------------------------
//  Mock Terminal
// ---------------------------------------------------------------------------
class MockTerminal {
  constructor(name) {
    this.name = name;
    this.exitStatus = undefined;
    this.creationOptions = {};
    this.processId = Promise.resolve(Math.floor(Math.random() * 10000));
    this._text = [];
    this._disposed = false;
  }
  sendText(text) { this._text.push(text); }
  show() {}
  hide() {}
  dispose() { this._disposed = true; }
}

// ---------------------------------------------------------------------------
//  Mock OutputChannel
// ---------------------------------------------------------------------------
class MockOutputChannel {
  constructor(name) {
    this.name = name;
    this._lines = [];
    this._shown = false;
    this._disposed = false;
  }
  appendLine(line) { this._lines.push(line); }
  append(text) { this._lines.push(text); }
  clear() { this._lines = []; }
  show(preserveFocus) { this._shown = true; this._preserveFocus = preserveFocus; }
  hide() { this._shown = false; }
  dispose() { this._disposed = true; }
}

// ---------------------------------------------------------------------------
//  Mock Extension
// ---------------------------------------------------------------------------
class MockExtension {
  constructor(id) {
    this.id = id;
    this.isActive = false;
    this.packageJSON = {};
    this.extensionPath = '/mock/extension/path';
  }
  async activate() { this.isActive = true; return {}; }
}

// ---------------------------------------------------------------------------
//  Mock Webview & WebviewView
// ---------------------------------------------------------------------------
class MockWebview {
  constructor() {
    this._emitter = new EventEmitter();
    this._messages = [];
    this.options = {};
    this.html = '';
    this.cspSource = 'mock-csp';
  }
  postMessage(msg) {
    this._messages.push(msg);
    return Promise.resolve(true);
  }
  onDidReceiveMessage(listener) {
    this._emitter.on('message', listener);
    return disposable(() => this._emitter.removeListener('message', listener));
  }
  asWebviewUri(uri) {
    return `https://webview.mock/${uri.path || uri.fsPath || uri}`;
  }
  /** Helper: simulate the webview sending a message to the extension */
  _simulateMessage(msg) {
    this._emitter.emit('message', msg);
  }
}

class MockWebviewView {
  constructor() {
    this.webview = new MockWebview();
    this.visible = true;
    this.viewType = 'controlpanel.mdxView';
    this._visibilityEmitter = new EventEmitter();
  }
  onDidChangeVisibility(listener) {
    this._visibilityEmitter.on('event', listener);
    return disposable(() => this._visibilityEmitter.removeListener('event', listener));
  }
  /** Helper: simulate hiding then showing the view (tab switch) */
  _simulateVisibilityChange(visible) {
    this.visible = visible;
    this._visibilityEmitter.emit('event');
  }
}

// ---------------------------------------------------------------------------
//  Mock FileSystemWatcher
// ---------------------------------------------------------------------------
class MockFileSystemWatcher {
  constructor() {
    this._emitter = { change: new EventEmitter(), create: new EventEmitter(), delete: new EventEmitter() };
    this._disposed = false;
  }
  onDidChange(fn) {
    this._emitter.change.on('event', fn);
    return disposable(() => this._emitter.change.removeListener('event', fn));
  }
  onDidCreate(fn) {
    this._emitter.create.on('event', fn);
    return disposable(() => this._emitter.create.removeListener('event', fn));
  }
  onDidDelete(fn) {
    this._emitter.delete.on('event', fn);
    return disposable(() => this._emitter.delete.removeListener('event', fn));
  }
  dispose() { this._disposed = true; }
}

// ---------------------------------------------------------------------------
//  Mock Task / TaskExecution
// ---------------------------------------------------------------------------
class MockTask {
  constructor(name, source, definition) {
    this.name = name;
    this.source = source || 'Workspace';
    this.definition = definition || {};
    this.detail = '';
    this.scope = undefined;
  }
}

class MockTaskExecution {
  constructor(task) {
    this.task = task;
    this._terminated = false;
  }
  terminate() { this._terminated = true; }
}

// ---------------------------------------------------------------------------
//  tasks namespace — event emitters + task store
// ---------------------------------------------------------------------------
const _taskStartEmitter = new EventEmitter();
const _taskEndEmitter = new EventEmitter();
let _registeredTasks = [];

const tasks = {
  onDidStartTaskProcess(listener) {
    _taskStartEmitter.on('event', listener);
    return disposable(() => _taskStartEmitter.removeListener('event', listener));
  },
  onDidEndTaskProcess(listener) {
    _taskEndEmitter.on('event', listener);
    return disposable(() => _taskEndEmitter.removeListener('event', listener));
  },
  fetchTasks() {
    return Promise.resolve([..._registeredTasks]);
  },
  executeTask(task) {
    const execution = new MockTaskExecution(task);
    return Promise.resolve(execution);
  },

  // Test helpers (not part of real API)
  _registeredTasks,
  _registerTask(task) { _registeredTasks.push(task); },
  _clearTasks() { _registeredTasks.length = 0; },
  _emitStart(event) { _taskStartEmitter.emit('event', event); },
  _emitEnd(event) { _taskEndEmitter.emit('event', event); },
};

// ---------------------------------------------------------------------------
//  extensions namespace
// ---------------------------------------------------------------------------
const extensions = {
  getExtension(id) { return new MockExtension(id); },
  all: [],
};

// ---------------------------------------------------------------------------
//  window namespace
// ---------------------------------------------------------------------------
const _terminals = [];
const _activeTextEditorEmitter = new EventEmitter();
let _lastOutputChannel = null;

const window = {
  terminals: _terminals,

  showInformationMessage(message, ...items) { return Promise.resolve(items[0]); },
  showWarningMessage(message, ...items) { return Promise.resolve(items[0]); },
  showErrorMessage(message, ...items) { return Promise.resolve(items[0]); },

  createTerminal(nameOrOptions) {
    const terminal = new MockTerminal(
      typeof nameOrOptions === 'string' ? nameOrOptions : nameOrOptions?.name || 'Terminal'
    );
    _terminals.push(terminal);
    return terminal;
  },

  createOutputChannel(name) {
    _lastOutputChannel = new MockOutputChannel(name);
    return _lastOutputChannel;
  },

  showTextDocument(document) {
    const editor = {
      document,
      selection: null,
      revealRange() {},
    };
    return Promise.resolve(editor);
  },

  registerWebviewViewProvider(_viewId, _provider) {
    return disposable();
  },

  onDidChangeActiveTextEditor(listener) {
    _activeTextEditorEmitter.on('event', listener);
    return disposable(() => _activeTextEditorEmitter.removeListener('event', listener));
  },

  withProgress(_options, task) {
    const progress = { report() {} };
    return task(progress, { isCancellationRequested: false });
  },

  // test helpers
  _getLastOutputChannel() { return _lastOutputChannel; },
  _clearTerminals() { _terminals.length = 0; },
  _emitActiveTextEditorChange(editor) { _activeTextEditorEmitter.emit('event', editor); },
};

// ---------------------------------------------------------------------------
//  workspace namespace
// ---------------------------------------------------------------------------
const workspace = {
  workspaceFolders: [{
    uri: { fsPath: '/workspaces/ControlPanel' },
    name: 'ControlPanel',
    index: 0,
  }],

  getConfiguration(_section) {
    return {
      get: (_key, defaultValue) => defaultValue,
      has: (_key) => false,
      inspect: (_key) => ({ defaultValue: undefined }),
      update: (_key, _value) => Promise.resolve(),
    };
  },

  findFiles(_include, _exclude) { return Promise.resolve([]); },

  openTextDocument(pathOrUri) {
    return Promise.resolve({
      uri: typeof pathOrUri === 'string' ? Uri.file(pathOrUri) : pathOrUri,
      getText: () => '',
      lineCount: 0,
    });
  },

  createFileSystemWatcher(_pattern) {
    return new MockFileSystemWatcher();
  },

  onDidChangeTextDocument(_listener) {
    return disposable();
  },
};

// ---------------------------------------------------------------------------
//  commands namespace
// ---------------------------------------------------------------------------
const _registeredCommands = {};

const commands = {
  registerCommand(command, callback) {
    _registeredCommands[command] = callback;
    return disposable(() => { delete _registeredCommands[command]; });
  },
  executeCommand(command, ...args) {
    if (_registeredCommands[command]) {
      return Promise.resolve(_registeredCommands[command](...args));
    }
    return Promise.resolve();
  },
  _registeredCommands,
};

// ---------------------------------------------------------------------------
//  Core classes / enums
// ---------------------------------------------------------------------------
class Uri {
  constructor(scheme, authority, fsPath, query, fragment) {
    this.scheme = scheme;
    this.authority = authority;
    this.path = fsPath;
    this.fsPath = fsPath;
    this.query = query;
    this.fragment = fragment;
  }
  static file(p) { return new Uri('file', '', p, '', ''); }
  static parse(value) { return new Uri('file', '', value, '', ''); }
  toString() { return `${this.scheme}://${this.authority}${this.path}`; }
}

class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}

class Selection {
  constructor(anchor, active) {
    this.anchor = anchor;
    this.active = active;
    this.start = anchor;
    this.end = active;
  }
}

class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
}

class RelativePattern {
  constructor(base, pattern) {
    this.base = base;
    this.pattern = pattern;
  }
}

const TextEditorRevealType = {
  Default: 0,
  InCenter: 1,
  InCenterIfOutsideViewport: 2,
  AtTop: 3,
};

const ProgressLocation = {
  SourceControl: 1,
  Window: 10,
  Notification: 15,
};

// ---------------------------------------------------------------------------
//  Reset helper — call between tests to get a clean state
// ---------------------------------------------------------------------------
function _reset() {
  _terminals.length = 0;
  _registeredTasks.length = 0;
  Object.keys(_registeredCommands).forEach(k => delete _registeredCommands[k]);
  _lastOutputChannel = null;
}

// ---------------------------------------------------------------------------
//  Exports
// ---------------------------------------------------------------------------
module.exports = {
  // Namespaces
  extensions,
  window,
  workspace,
  commands,
  tasks,

  // Classes & enums
  Uri,
  Position,
  Selection,
  Range,
  RelativePattern,
  TextEditorRevealType,
  ProgressLocation,

  // Mock constructors (for test setup)
  MockTerminal,
  MockOutputChannel,
  MockTask,
  MockTaskExecution,
  MockWebview,
  MockWebviewView,
  MockFileSystemWatcher,

  // Test helper
  _reset,
};