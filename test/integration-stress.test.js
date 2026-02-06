/**
 * Integration / Stress Tests
 *
 * Tests bulk operations, file loading with fs stubs, navigation history
 * management, sendTasksToWebview, getTaskDependencies, resolveWebviewView,
 * and openTaskDefinition.
 */

const assert = require('assert');
const sinon = require('sinon');
const path = require('path');
const {
  createProvider,
  createStartEvent,
  createEndEvent,
  stubFs,
  vscode,
} = require('./helpers/provider-factory');
const {
  SIMPLE_MDX,
  TASKS_JSON_CONTENT,
} = require('./fixtures/sample-mdx');

suite('Integration Stress Tests', () => {
  let provider, view;
  let sandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    ({ provider, view } = createProvider());
  });

  teardown(() => {
    sandbox.restore();
    vscode.tasks._clearTasks();
  });

  // -----------------------------------------------------------------------
  //  Bulk History Operations
  // -----------------------------------------------------------------------
  suite('High-Volume History Operations', () => {
    test('rapid addExecutionRecord maintains 20-record cap', async () => {
      for (let i = 0; i < 50; i++) {
        await provider.addExecutionRecord({ id: `${i}`, taskLabel: `t-${i}` });
      }
      const h = await provider.getExecutionHistory();
      assert.strictEqual(h.length, 20);
      // Most recent should be first
      assert.strictEqual(h[0].id, '49');
    });

    test('rapid toggleStarTask maintains 20-star cap', async () => {
      for (let i = 0; i < 30; i++) {
        await provider.toggleStarTask(`task-${i}`);
      }
      const starred = await provider.getStarredTasks();
      assert.strictEqual(starred.length, 20);
    });

    test('updateTaskHistory under load maintains rolling window', async () => {
      for (let i = 0; i < 100; i++) {
        await provider.updateTaskHistory('build', i);
      }
      const h = await provider.getTaskHistory('build');
      assert.strictEqual(h.durations.length, 10);
      assert.strictEqual(h.count, 100);
    });

    test('rapid addRecentlyUsedTask with deduplication', async () => {
      // Alternate between two tasks rapidly
      for (let i = 0; i < 20; i++) {
        await provider.addRecentlyUsedTask(i % 2 === 0 ? 'build' : 'test');
      }
      const recent = await provider.getRecentlyUsedTasks();
      assert.ok(recent.length <= 5);
      // No duplicates
      const unique = new Set(recent);
      assert.strictEqual(unique.size, recent.length);
    });
  });

  // -----------------------------------------------------------------------
  //  File Loading (with fs stubs)
  // -----------------------------------------------------------------------
  suite('File Loading', () => {
    test('loadMdxFile posts content to webview', async () => {
      const cpdoxPath = path.join('/workspaces/ControlPanel', '.cpdox', 'test.mdx');
      stubFs(sandbox, { [cpdoxPath]: SIMPLE_MDX });

      await provider.loadMdxFile('test.mdx');

      const msg = view.webview._messages.find(m => m.type === 'loadMdx');
      assert.ok(msg);
      assert.strictEqual(msg.content, SIMPLE_MDX);
      assert.strictEqual(msg.file, 'test.mdx');
    });

    test('loadMdxFile updates navigation history', async () => {
      const cpdoxPath = path.join('/workspaces/ControlPanel', '.cpdox', 'a.mdx');
      stubFs(sandbox, { [cpdoxPath]: SIMPLE_MDX });

      await provider.loadMdxFile('a.mdx');
      const history = await provider.getNavigationHistory();
      assert.ok(history.includes('a.mdx'));
    });

    test('loadMdxFile skips history when skipHistory=true', async () => {
      const cpdoxPath = path.join('/workspaces/ControlPanel', '.cpdox', 'a.mdx');
      stubFs(sandbox, { [cpdoxPath]: SIMPLE_MDX });

      await provider.loadMdxFile('a.mdx', true);
      const history = await provider.getNavigationHistory();
      assert.deepStrictEqual(history, []);
    });

    test('loadMdxFile shows error for missing file', async () => {
      stubFs(sandbox, {}); // no files exist
      const spy = sandbox.spy(vscode.window, 'showErrorMessage');
      await provider.loadMdxFile('missing.mdx');
      assert.ok(spy.calledOnce);
    });

    test('loadMdxFile deduplicates navigation (same file twice)', async () => {
      const cpdoxPath = path.join('/workspaces/ControlPanel', '.cpdox', 'a.mdx');
      stubFs(sandbox, { [cpdoxPath]: SIMPLE_MDX });

      await provider.loadMdxFile('a.mdx');
      await provider.loadMdxFile('a.mdx');
      const history = await provider.getNavigationHistory();
      // Should not have duplicate
      assert.strictEqual(history.filter(h => h === 'a.mdx').length, 1);
    });

    test('navigation history caps at 10 entries', async () => {
      const files = {};
      for (let i = 0; i < 15; i++) {
        const fp = path.join('/workspaces/ControlPanel', '.cpdox', `f${i}.mdx`);
        files[fp] = `# File ${i}`;
      }
      stubFs(sandbox, files);

      for (let i = 0; i < 15; i++) {
        await provider.loadMdxFile(`f${i}.mdx`);
      }
      const history = await provider.getNavigationHistory();
      assert.ok(history.length <= 10);
    });
  });

  // -----------------------------------------------------------------------
  //  Navigation (back / forward / toItem)
  // -----------------------------------------------------------------------
  suite('Navigation', () => {
    test('navigateBack moves index backward', async () => {
      const files = {};
      for (const name of ['a.mdx', 'b.mdx']) {
        files[path.join('/workspaces/ControlPanel', '.cpdox', name)] = '# File';
      }
      stubFs(sandbox, files);

      await provider.loadMdxFile('a.mdx');
      await provider.loadMdxFile('b.mdx');
      await provider.navigateBack();
      const idx = await provider.getNavigationIndex();
      assert.strictEqual(idx, 0);
    });

    test('navigateForward moves index forward', async () => {
      const files = {};
      for (const name of ['a.mdx', 'b.mdx']) {
        files[path.join('/workspaces/ControlPanel', '.cpdox', name)] = '# File';
      }
      stubFs(sandbox, files);

      await provider.loadMdxFile('a.mdx');
      await provider.loadMdxFile('b.mdx');
      await provider.navigateBack();
      await provider.navigateForward();
      const idx = await provider.getNavigationIndex();
      assert.strictEqual(idx, 1);
    });

    test('navigateBack at start is a no-op', async () => {
      const fp = path.join('/workspaces/ControlPanel', '.cpdox', 'a.mdx');
      stubFs(sandbox, { [fp]: '# A' });

      await provider.loadMdxFile('a.mdx');
      const idxBefore = await provider.getNavigationIndex();
      await provider.navigateBack();
      assert.strictEqual(await provider.getNavigationIndex(), idxBefore);
    });

    test('navigateForward at end is a no-op', async () => {
      const fp = path.join('/workspaces/ControlPanel', '.cpdox', 'a.mdx');
      stubFs(sandbox, { [fp]: '# A' });

      await provider.loadMdxFile('a.mdx');
      const idxBefore = await provider.getNavigationIndex();
      await provider.navigateForward();
      assert.strictEqual(await provider.getNavigationIndex(), idxBefore);
    });

    test('navigateToHistoryItem truncates forward history', async () => {
      const files = {};
      for (const n of ['a.mdx', 'b.mdx', 'c.mdx']) {
        files[path.join('/workspaces/ControlPanel', '.cpdox', n)] = '# F';
      }
      stubFs(sandbox, files);

      await provider.loadMdxFile('a.mdx');
      await provider.loadMdxFile('b.mdx');
      await provider.loadMdxFile('c.mdx');

      await provider.navigateToHistoryItem(0); // go to 'a.mdx'
      const history = await provider.getNavigationHistory();
      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0], 'a.mdx');
    });
  });

  // -----------------------------------------------------------------------
  //  sendTasksToWebview
  // -----------------------------------------------------------------------
  suite('sendTasksToWebview', () => {
    test('posts updateTasks with task list', async () => {
      vscode.tasks._registerTask(new vscode.MockTask('build'));
      vscode.tasks._registerTask(new vscode.MockTask('test'));

      await provider.sendTasksToWebview();

      const msg = view.webview._messages.find(m => m.type === 'updateTasks');
      assert.ok(msg);
      assert.strictEqual(msg.tasks.length, 2);
      assert.ok(msg.tasks.find(t => t.label === 'build'));
    });

    test('handles empty task list', async () => {
      await provider.sendTasksToWebview();
      const msg = view.webview._messages.find(m => m.type === 'updateTasks');
      assert.ok(msg);
      assert.strictEqual(msg.tasks.length, 0);
    });
  });

  // -----------------------------------------------------------------------
  //  getTaskDependencies
  // -----------------------------------------------------------------------
  suite('getTaskDependencies', () => {
    test('returns empty array when no dependencies', async () => {
      const task = new vscode.MockTask('build', 'Workspace', {});
      const deps = await provider.getTaskDependencies(task);
      assert.deepStrictEqual(deps, []);
    });

    test('returns dependencies from task.definition.dependsOn', async () => {
      const task = new vscode.MockTask('test', 'Workspace', { dependsOn: ['build', 'lint'] });
      const deps = await provider.getTaskDependencies(task);
      assert.deepStrictEqual(deps, ['build', 'lint']);
    });

    test('wraps single dependsOn string in array', async () => {
      const task = new vscode.MockTask('test', 'Workspace', { dependsOn: 'build' });
      const deps = await provider.getTaskDependencies(task);
      assert.deepStrictEqual(deps, ['build']);
    });

    test('reads dependencies from tasks.json if not on definition', async () => {
      const tasksJsonPath = path.join('/workspaces/ControlPanel', '.vscode', 'tasks.json');
      stubFs(sandbox, { [tasksJsonPath]: TASKS_JSON_CONTENT });

      const task = new vscode.MockTask('test', 'Workspace', {});
      // task.scope not set, so it'll use workspace.workspaceFolders
      const deps = await provider.getTaskDependencies(task);
      assert.deepStrictEqual(deps, ['build']);
    });
  });

  // -----------------------------------------------------------------------
  //  resolveWebviewView
  // -----------------------------------------------------------------------
  suite('resolveWebviewView', () => {
    test('sets webview HTML and options', () => {
      const webviewView = new vscode.MockWebviewView();
      stubFs(sandbox, {}); // no webview.html file

      provider.resolveWebviewView(webviewView, {}, {});

      assert.ok(webviewView.webview.html.includes('<!DOCTYPE html'));
      assert.strictEqual(webviewView.webview.options.enableScripts, true);
    });

    test('sets _view on the provider', () => {
      const webviewView = new vscode.MockWebviewView();
      stubFs(sandbox, {});

      provider.resolveWebviewView(webviewView, {}, {});
      assert.strictEqual(provider._view, webviewView);
    });

    test('handles "ready" message from webview', async () => {
      const webviewView = new vscode.MockWebviewView();
      stubFs(sandbox, {});

      provider.resolveWebviewView(webviewView, {}, {});

      // Simulate webview sending 'ready'
      webviewView.webview._simulateMessage({ type: 'ready' });

      // Give async handlers a tick
      await new Promise(r => setTimeout(r, 20));

      // sendTasksToWebview should have been called (posting updateTasks)
      const msg = webviewView.webview._messages.find(m => m.type === 'updateTasks');
      assert.ok(msg);
    });
  });

  // -----------------------------------------------------------------------
  //  openTaskDefinition
  // -----------------------------------------------------------------------
  suite('openTaskDefinition', () => {
    test('opens tasks.json and navigates to label line', async () => {
      const tasksJsonPath = path.join('/workspaces/ControlPanel', '.vscode', 'tasks.json');
      stubFs(sandbox, { [tasksJsonPath]: TASKS_JSON_CONTENT });

      const openSpy = sandbox.spy(vscode.workspace, 'openTextDocument');
      await provider.openTaskDefinition('build');

      assert.ok(openSpy.calledOnce);
      assert.ok(openSpy.firstCall.args[0].includes('tasks.json'));
    });

    test('shows info message when tasks.json not found', async () => {
      stubFs(sandbox, {}); // no files
      const spy = sandbox.spy(vscode.window, 'showInformationMessage');
      await provider.openTaskDefinition('build');
      assert.ok(spy.calledOnce);
    });
  });

  // -----------------------------------------------------------------------
  //  Bulk start/end stress
  // -----------------------------------------------------------------------
  suite('System Stability Under Load', () => {
    test('100 rapid task start/end cycles', () => {
      for (let i = 0; i < 100; i++) {
        const label = `task-${i}`;
        provider.handleTaskStarted(createStartEvent(label));
        provider.handleTaskEnded(createEndEvent(label, i % 5 === 0 ? 1 : 0));
      }
      assert.strictEqual(provider._runningTasks.size, 0);
      assert.strictEqual(provider._taskStartTimes.size, 0);
    });

    test('webview receives messages for all task events', () => {
      for (let i = 0; i < 10; i++) {
        provider.handleTaskStarted(createStartEvent(`t-${i}`));
        provider.handleTaskEnded(createEndEvent(`t-${i}`, 0));
      }
      const endedMsgs = view.webview._messages.filter(m => m.type === 'taskEnded');
      assert.strictEqual(endedMsgs.length, 10);
    });
  });
});
