/**
 * Extension Activation Tests
 *
 * Tests that activate() and deactivate() work correctly,
 * registering the expected commands and providers.
 */

const assert = require('assert');
const sinon = require('sinon');
const path = require('path');
const {
  createMockContext,
  stubFs,
  vscode,
} = require('./helpers/provider-factory');

// We need to require extension.js AFTER the vscode mock is patched (done by provider-factory)
const extension = require('../extension');

suite('Extension Tests', () => {
  let sandbox;
  let testContexts = [];

  // Helper to create and track contexts for cleanup
  function createTrackedContext(overrides) {
    const context = createMockContext(overrides);
    testContexts.push(context);
    return context;
  }

  setup(() => {
    sandbox = sinon.createSandbox();
    vscode._reset();
    testContexts = [];
  });

  teardown(() => {
    // Dispose all subscriptions from all test contexts to clean up registrations
    testContexts.forEach(context => {
      if (context && context.subscriptions) {
        context.subscriptions.forEach(sub => {
          if (sub && typeof sub.dispose === 'function') {
            sub.dispose();
          }
        });
        context.subscriptions = [];
      }
    });
    testContexts = [];
    sandbox.restore();
    vscode._reset();
  });

  suite('activate', () => {
    test('pushes disposables to context.subscriptions', () => {
      const context = createTrackedContext();
      stubFs(sandbox, {});

      extension.activate(context);

      // Should have: logger, webview provider, openMdx cmd, refreshView cmd, plus editor listener
      assert.ok(context.subscriptions.length >= 4, `Expected >=4 subscriptions, got ${context.subscriptions.length}`);
    });

    test('registers controlpanel.openMdx command', () => {
      const context = createTrackedContext();
      stubFs(sandbox, {});

      const regSpy = sandbox.spy(vscode.commands, 'registerCommand');
      extension.activate(context);

      const openMdxCall = regSpy.getCalls().find(c => c.args[0] === 'controlpanel.openMdx');
      assert.ok(openMdxCall, 'should register controlpanel.openMdx');
    });

    test('registers controlpanel.refreshView command', () => {
      const context = createTrackedContext();
      stubFs(sandbox, {});

      const regSpy = sandbox.spy(vscode.commands, 'registerCommand');
      extension.activate(context);

      const refreshCall = regSpy.getCalls().find(c => c.args[0] === 'controlpanel.refreshView');
      assert.ok(refreshCall, 'should register controlpanel.refreshView');
    });

    test('registers webview view provider', () => {
      const context = createTrackedContext();
      stubFs(sandbox, {});

      const regSpy = sandbox.spy(vscode.window, 'registerWebviewViewProvider');
      extension.activate(context);

      assert.ok(regSpy.calledOnce);
      assert.strictEqual(regSpy.firstCall.args[0], 'controlpanel.mdxView');
    });

    test('registers FileSystemWatcher when .cpdox exists', () => {
      const context = createTrackedContext();
      const cpdoxPath = path.join('/workspaces/ControlPanel', '.cpdox');
      stubFs(sandbox, { [cpdoxPath]: true });

      const watcherSpy = sandbox.spy(vscode.workspace, 'createFileSystemWatcher');
      extension.activate(context);

      assert.ok(watcherSpy.calledOnce, 'should create file watcher');
      // Watcher should be pushed to subscriptions
      const watcherSubscription = context.subscriptions.find(sub => sub.dispose);
      assert.ok(watcherSubscription);
    });

    test('does not create FileSystemWatcher when .cpdox does not exist', () => {
      const context = createTrackedContext();
      stubFs(sandbox, {}); // No .cpdox

      const watcherSpy = sandbox.spy(vscode.workspace, 'createFileSystemWatcher');
      extension.activate(context);

      assert.ok(watcherSpy.notCalled, 'should not create file watcher');
    });

    test('does not create FileSystemWatcher when no workspace folders', () => {
      const context = createTrackedContext();
      stubFs(sandbox, {});
      
      const originalFolders = vscode.workspace.workspaceFolders;
      vscode.workspace.workspaceFolders = undefined;

      const watcherSpy = sandbox.spy(vscode.workspace, 'createFileSystemWatcher');
      extension.activate(context);

      assert.ok(watcherSpy.notCalled, 'should not create file watcher without workspace');
      
      vscode.workspace.workspaceFolders = originalFolders;
    });

    test('registers onDidChangeActiveTextEditor listener', () => {
      const context = createTrackedContext();
      stubFs(sandbox, {});

      const listenerSpy = sandbox.spy(vscode.window, 'onDidChangeActiveTextEditor');
      extension.activate(context);

      assert.ok(listenerSpy.calledOnce, 'should register active editor listener');
    });
  });

  suite('openMdx command', () => {
    test('shows error when no workspace folder open', async () => {
      const context = createTrackedContext();
      stubFs(sandbox, {});

      const errorSpy = sandbox.spy(vscode.window, 'showErrorMessage');
      const originalFolders = vscode.workspace.workspaceFolders;
      vscode.workspace.workspaceFolders = undefined;

      extension.activate(context);
      const openMdxCmd = vscode.commands._registeredCommands['controlpanel.openMdx'];
      await openMdxCmd();

      assert.ok(errorSpy.calledOnce);
      assert.ok(errorSpy.calledWith('No workspace folder open'));

      vscode.workspace.workspaceFolders = originalFolders;
    });

    test('focuses view when .cpdox exists', async () => {
      const context = createTrackedContext();
      const cpdoxPath = path.join('/workspaces/ControlPanel', '.cpdox');
      stubFs(sandbox, { [cpdoxPath]: true });

      const executeSpy = sandbox.spy(vscode.commands, 'executeCommand');
      extension.activate(context);

      const openMdxCmd = vscode.commands._registeredCommands['controlpanel.openMdx'];
      await openMdxCmd();

      const focusCall = executeSpy.getCalls().find(c => c.args[0] === 'controlpanel.mdxView.focus');
      assert.ok(focusCall, 'should execute focus command');
    });

    test('prompts to create .cpdox when it does not exist', async () => {
      const context = createTrackedContext();
      stubFs(sandbox, {}); // No .cpdox

      const infoSpy = sandbox.spy(vscode.window, 'showInformationMessage');
      extension.activate(context);

      const openMdxCmd = vscode.commands._registeredCommands['controlpanel.openMdx'];
      await openMdxCmd();

      assert.ok(infoSpy.calledWith('No .cpdox directory found. Create one?', 'Yes', 'No'));
    });

    test('creates .cpdox directory when user selects Yes', async () => {
      const context = createTrackedContext();
      const fs = stubFs(sandbox, {}); // No .cpdox initially

      // Mock returns 'Yes' by default (first option)
      extension.activate(context);

      const openMdxCmd = vscode.commands._registeredCommands['controlpanel.openMdx'];
      await openMdxCmd();

      const cpdoxPath = path.join('/workspaces/ControlPanel', '.cpdox');
      assert.ok(fs.mkdirSync.calledWith(cpdoxPath, { recursive: true }));
      assert.strictEqual(fs.writeFileSync.callCount, 3, 'should write 3 example files');
    });

    test('writes getting-started.mdx when creating examples', async () => {
      const context = createTrackedContext();
      const fs = stubFs(sandbox, {});

      extension.activate(context);
      const openMdxCmd = vscode.commands._registeredCommands['controlpanel.openMdx'];
      await openMdxCmd();

      const cpdoxPath = path.join('/workspaces/ControlPanel', '.cpdox');
      const gettingStartedPath = path.join(cpdoxPath, 'getting-started.mdx');
      
      const writeCall = fs.writeFileSync.getCalls().find(c => c.args[0] === gettingStartedPath);
      assert.ok(writeCall, 'should write getting-started.mdx');
      assert.ok(writeCall.args[1].includes('Welcome to the **Control Panel**'));
    });

    test('writes development.mdx when creating examples', async () => {
      const context = createTrackedContext();
      const fs = stubFs(sandbox, {});

      extension.activate(context);
      const openMdxCmd = vscode.commands._registeredCommands['controlpanel.openMdx'];
      await openMdxCmd();

      const cpdoxPath = path.join('/workspaces/ControlPanel', '.cpdox');
      const devPath = path.join(cpdoxPath, 'development.mdx');
      
      const writeCall = fs.writeFileSync.getCalls().find(c => c.args[0] === devPath);
      assert.ok(writeCall, 'should write development.mdx');
      assert.ok(writeCall.args[1].includes('Development Guide'));
    });

    test('writes deployment.mdx when creating examples', async () => {
      const context = createTrackedContext();
      const fs = stubFs(sandbox, {});

      extension.activate(context);
      const openMdxCmd = vscode.commands._registeredCommands['controlpanel.openMdx'];
      await openMdxCmd();

      const cpdoxPath = path.join('/workspaces/ControlPanel', '.cpdox');
      const deployPath = path.join(cpdoxPath, 'deployment.mdx');
      
      const writeCall = fs.writeFileSync.getCalls().find(c => c.args[0] === deployPath);
      assert.ok(writeCall, 'should write deployment.mdx');
      assert.ok(writeCall.args[1].includes('Deployment Guide'));
    });

    test('shows success message after creating .cpdox', async () => {
      const context = createTrackedContext();
      stubFs(sandbox, {});

      const infoSpy = sandbox.spy(vscode.window, 'showInformationMessage');
      extension.activate(context);

      const openMdxCmd = vscode.commands._registeredCommands['controlpanel.openMdx'];
      await openMdxCmd();

      const successCall = infoSpy.getCalls().find(c => 
        c.args[0] === '.cpdox directory created with example files!'
      );
      assert.ok(successCall, 'should show success message');
    });

    test('does not create directory when user selects No', async () => {
      const context = createTrackedContext();
      const fs = stubFs(sandbox, {});

      // Override mock to return 'No'
      sandbox.stub(vscode.window, 'showInformationMessage').resolves('No');
      extension.activate(context);

      const openMdxCmd = vscode.commands._registeredCommands['controlpanel.openMdx'];
      await openMdxCmd();

      assert.ok(fs.mkdirSync.notCalled, 'should not create directory');
      assert.ok(fs.writeFileSync.notCalled, 'should not write files');
    });
  });

  suite('refreshView command', () => {
    test('calls loadDefaultMdx and sendTasksToWebview', async () => {
      const context = createTrackedContext();
      stubFs(sandbox, {});

      // Stub the MdxWebviewProvider methods before activation
      const MdxWebviewProvider = require('../src/providers/MdxWebviewProvider');
      const loadStub = sandbox.stub(MdxWebviewProvider.prototype, 'loadDefaultMdx').resolves();
      const sendStub = sandbox.stub(MdxWebviewProvider.prototype, 'sendTasksToWebview').resolves();

      extension.activate(context);

      const refreshCmd = vscode.commands._registeredCommands['controlpanel.refreshView'];
      await refreshCmd();
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.ok(loadStub.calledOnce, 'should call loadDefaultMdx');
      assert.ok(sendStub.calledOnce, 'should call sendTasksToWebview');
    });
  });

  suite('FileSystemWatcher', () => {
    test('reloads MDX on file change', async () => {
      const context = createTrackedContext();
      const cpdoxPath = path.join('/workspaces/ControlPanel', '.cpdox');
      stubFs(sandbox, { [cpdoxPath]: true });

      const MdxWebviewProvider = require('../src/providers/MdxWebviewProvider');
      const loadStub = sandbox.stub(MdxWebviewProvider.prototype, 'loadDefaultMdx').resolves();

      extension.activate(context);

      // Get the watcher from subscriptions
      const watcher = context.subscriptions.find(sub => sub._emitter && sub._emitter.change);
      
      // Emit change event
      watcher._emitter.change.emit('event', { fsPath: path.join(cpdoxPath, 'test.mdx') });
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.ok(loadStub.calledOnce, 'should reload on change');
    });

    test('reloads MDX on file create', async () => {
      const context = createTrackedContext();
      const cpdoxPath = path.join('/workspaces/ControlPanel', '.cpdox');
      stubFs(sandbox, { [cpdoxPath]: true });

      const MdxWebviewProvider = require('../src/providers/MdxWebviewProvider');
      const loadStub = sandbox.stub(MdxWebviewProvider.prototype, 'loadDefaultMdx').resolves();

      extension.activate(context);

      const watcher = context.subscriptions.find(sub => sub._emitter && sub._emitter.create);
      watcher._emitter.create.emit('event', { fsPath: path.join(cpdoxPath, 'new.mdx') });
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.ok(loadStub.calledOnce, 'should reload on create');
    });

    test('reloads MDX on file delete', async () => {
      const context = createTrackedContext();
      const cpdoxPath = path.join('/workspaces/ControlPanel', '.cpdox');
      stubFs(sandbox, { [cpdoxPath]: true });

      const MdxWebviewProvider = require('../src/providers/MdxWebviewProvider');
      const loadStub = sandbox.stub(MdxWebviewProvider.prototype, 'loadDefaultMdx').resolves();

      extension.activate(context);

      const watcher = context.subscriptions.find(sub => sub._emitter && sub._emitter.delete);
      watcher._emitter.delete.emit('event', { fsPath: path.join(cpdoxPath, 'old.mdx') });
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.ok(loadStub.calledOnce, 'should reload on delete');
    });
  });

  suite('onDidChangeActiveTextEditor', () => {
    test('loads MDX file when .cpdox file is opened', async () => {
      const context = createTrackedContext();
      stubFs(sandbox, {});

      const MdxWebviewProvider = require('../src/providers/MdxWebviewProvider');
      const loadStub = sandbox.stub(MdxWebviewProvider.prototype, 'loadMdxFile').resolves();

      extension.activate(context);

      const mockEditor = {
        document: {
          uri: {
            fsPath: '/workspaces/ControlPanel/.cpdox/test.mdx'
          }
        }
      };

      vscode.window._emitActiveTextEditorChange(mockEditor);
      await new Promise(resolve => setTimeout(resolve, 10));

      // Check that it was called at all (could be multiple if other events fired)
      assert.ok(loadStub.called, 'loadMdxFile should have been called');
      // Check the most recent call has the right argument
      assert.strictEqual(loadStub.lastCall.args[0], 'test.mdx');
    });

    test('does not load when non-MDX file is opened', async () => {
      const context = createTrackedContext();
      stubFs(sandbox, {});

      const MdxWebviewProvider = require('../src/providers/MdxWebviewProvider');
      const loadStub = sandbox.stub(MdxWebviewProvider.prototype, 'loadMdxFile').resolves();

      extension.activate(context);
      loadStub.resetHistory(); // Clear any activation calls

      const mockEditor = {
        document: {
          uri: {
            fsPath: '/workspaces/ControlPanel/src/test.js'
          }
        }
      };

      vscode.window._emitActiveTextEditorChange(mockEditor);
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.ok(loadStub.notCalled);
    });

    test('does not load when non-.cpdox file is opened', async () => {
      const context = createTrackedContext();
      stubFs(sandbox, {});

      const MdxWebviewProvider = require('../src/providers/MdxWebviewProvider');
      const loadStub = sandbox.stub(MdxWebviewProvider.prototype, 'loadMdxFile').resolves();

      extension.activate(context);
      loadStub.resetHistory(); // Clear any activation calls

      const mockEditor = {
        document: {
          uri: {
            fsPath: '/workspaces/ControlPanel/README.mdx'
          }
        }
      };

      vscode.window._emitActiveTextEditorChange(mockEditor);
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.ok(loadStub.notCalled);
    });

    test('handles null editor gracefully', async () => {
      const context = createTrackedContext();
      stubFs(sandbox, {});

      const MdxWebviewProvider = require('../src/providers/MdxWebviewProvider');
      const loadStub = sandbox.stub(MdxWebviewProvider.prototype, 'loadMdxFile').resolves();

      extension.activate(context);
      loadStub.resetHistory(); // Clear any activation calls

      vscode.window._emitActiveTextEditorChange(null);
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.ok(loadStub.notCalled);
    });

    test('handles editor without document gracefully', async () => {
      const context = createTrackedContext();
      stubFs(sandbox, {});

      const MdxWebviewProvider = require('../src/providers/MdxWebviewProvider');
      const loadStub = sandbox.stub(MdxWebviewProvider.prototype, 'loadMdxFile').resolves();

      extension.activate(context);
      loadStub.resetHistory(); // Clear any activation calls

      const mockEditor = { document: null };
      vscode.window._emitActiveTextEditorChange(mockEditor);
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.ok(loadStub.notCalled);
    });

    test('handles missing workspace folders gracefully', async () => {
      const context = createTrackedContext();
      stubFs(sandbox, {});

      const MdxWebviewProvider = require('../src/providers/MdxWebviewProvider');
      const loadStub = sandbox.stub(MdxWebviewProvider.prototype, 'loadMdxFile').resolves();

      extension.activate(context);
      loadStub.resetHistory(); // Clear any activation calls

      const originalFolders = vscode.workspace.workspaceFolders;
      vscode.workspace.workspaceFolders = undefined;

      const mockEditor = {
        document: {
          uri: {
            fsPath: '/some/path/.cpdox/test.mdx'
          }
        }
      };

      vscode.window._emitActiveTextEditorChange(mockEditor);
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.ok(loadStub.notCalled);

      vscode.workspace.workspaceFolders = originalFolders;
    });
  });

  suite('deactivate', () => {
    test('deactivate returns without error', () => {
      assert.doesNotThrow(() => extension.deactivate());
    });
  });
});
