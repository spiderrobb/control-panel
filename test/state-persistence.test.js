/**
 * State Persistence Tests
 *
 * Verifies that running and failed task state is correctly restored when:
 *   1. The webview sends a 'ready' message (JS context was disposed and recreated)
 *   2. The webview becomes visible again (onDidChangeVisibility)
 *   3. Persisted failures survive full webview reconnection cycles
 *
 * These tests guard against the regression where error indicators disappeared
 * when switching away from the Control Panel sidebar tab and back.
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

suite('State Persistence Tests', () => {
  let provider, context, view, logger;
  let sandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    ({ provider, context, logger, view } = createProvider());
  });

  teardown(() => {
    sandbox.restore();
  });

  // -----------------------------------------------------------------------
  //  Helper: resolve the webview and return the view
  // -----------------------------------------------------------------------
  function resolveView(existingView) {
    const webviewView = existingView || new vscode.MockWebviewView();
    stubFs(sandbox, {}); // no on-disk webview.html
    provider.resolveWebviewView(webviewView, {}, {});
    return webviewView;
  }

  // -----------------------------------------------------------------------
  //  'ready' message restores failed task state
  // -----------------------------------------------------------------------
  suite('ready message restores state', () => {
    test('restores persisted failed tasks on ready', async () => {
      // Persist a failed task before resolving the webview
      await provider.saveFailedTask('Workspace|build', {
        exitCode: 1,
        reason: 'compile error',
        duration: 5000,
        subtasks: [],
      });

      const webviewView = resolveView();

      // Clear any messages from resolveWebviewView itself
      webviewView.webview._messages = [];

      // Simulate the webview's JS context sending 'ready' (as it does on mount)
      webviewView.webview._simulateMessage({ type: 'ready' });
      await new Promise(r => setTimeout(r, 50));

      const failedMsgs = webviewView.webview._messages.filter(
        m => m.type === 'taskFailed'
      );
      assert.ok(
        failedMsgs.length >= 1,
        `Expected at least 1 taskFailed message, got ${failedMsgs.length}`
      );
      const buildFailed = failedMsgs.find(m => m.taskLabel === 'Workspace|build');
      assert.ok(buildFailed, 'should include the persisted build failure');
      assert.strictEqual(buildFailed.exitCode, 1);
      assert.strictEqual(buildFailed.reason, 'compile error');
    });

    test('restores currently running tasks on ready', async () => {
      const webviewView = resolveView();

      // Start a task so it appears in _runningTasks
      provider.handleTaskStarted(createStartEvent('serve'));
      await new Promise(r => setTimeout(r, 10));

      // Clear messages and simulate a webview reconnect via 'ready'
      webviewView.webview._messages = [];
      webviewView.webview._simulateMessage({ type: 'ready' });
      await new Promise(r => setTimeout(r, 50));

      const startedMsgs = webviewView.webview._messages.filter(
        m => m.type === 'taskStarted' && m.taskLabel === 'Workspace|serve'
      );
      assert.ok(
        startedMsgs.length >= 1,
        `Expected taskStarted for serve, got ${startedMsgs.length}`
      );
    });

    test('restores in-memory failed running tasks on ready', async () => {
      const webviewView = resolveView();

      // Simulate a task that started and is still tracked as running but has a failure
      provider._runningTasks.set('Workspace|lint', { terminate() {} });
      provider._taskStartTimes.set('Workspace|lint', Date.now() - 3000);
      provider._taskStates.set('Workspace|lint', 'failed');
      provider._taskFailures.set('Workspace|lint', {
        exitCode: 2,
        reason: 'lint errors found',
      });

      webviewView.webview._messages = [];
      webviewView.webview._simulateMessage({ type: 'ready' });
      await new Promise(r => setTimeout(r, 50));

      const failedMsgs = webviewView.webview._messages.filter(
        m => m.type === 'taskFailed' && m.taskLabel === 'Workspace|lint'
      );
      assert.ok(failedMsgs.length >= 1, 'should restore in-memory failure');
      assert.strictEqual(failedMsgs[0].exitCode, 2);
    });

    test('ready also sends updateTasks alongside failure state', async () => {
      await provider.saveFailedTask('Workspace|build', {
        exitCode: 1,
        reason: 'error',
      });

      const webviewView = resolveView();
      webviewView.webview._messages = [];
      webviewView.webview._simulateMessage({ type: 'ready' });
      await new Promise(r => setTimeout(r, 50));

      const taskMsg = webviewView.webview._messages.find(m => m.type === 'updateTasks');
      assert.ok(taskMsg, 'should also send updateTasks');

      const failedMsg = webviewView.webview._messages.find(m => m.type === 'taskFailed');
      assert.ok(failedMsg, 'should also send taskFailed');
    });
  });

  // -----------------------------------------------------------------------
  //  onDidChangeVisibility restores state
  // -----------------------------------------------------------------------
  suite('visibility change restores state', () => {
    test('restores persisted failures when view becomes visible', async () => {
      await provider.saveFailedTask('Workspace|test', {
        exitCode: 1,
        reason: 'test suite failed',
        duration: 8000,
        subtasks: ['Workspace|test:unit'],
      });

      const webviewView = resolveView();

      // Simulate hiding (user switches to File Explorer)
      webviewView._simulateVisibilityChange(false);

      // Clear messages accumulated so far
      webviewView.webview._messages = [];

      // Simulate showing again (user switches back to Control Panel)
      webviewView._simulateVisibilityChange(true);
      await new Promise(r => setTimeout(r, 50));

      const failedMsgs = webviewView.webview._messages.filter(
        m => m.type === 'taskFailed'
      );
      assert.ok(failedMsgs.length >= 1, 'should send taskFailed on visibility restore');
      const testFailed = failedMsgs.find(m => m.taskLabel === 'Workspace|test');
      assert.ok(testFailed, 'should include the persisted test failure');
      assert.strictEqual(testFailed.exitCode, 1);
    });

    test('does not send state when view becomes hidden', async () => {
      await provider.saveFailedTask('Workspace|build', {
        exitCode: 1,
        reason: 'error',
      });

      const webviewView = resolveView();
      // Wait for the async restoreRunningTasksState triggered by resolveWebviewView
      await new Promise(r => setTimeout(r, 50));
      webviewView.webview._messages = [];

      // Simulate hiding
      webviewView._simulateVisibilityChange(false);
      await new Promise(r => setTimeout(r, 50));

      const failedMsgs = webviewView.webview._messages.filter(
        m => m.type === 'taskFailed'
      );
      assert.strictEqual(failedMsgs.length, 0, 'should not send failures when hiding');
    });

    test('restores running tasks when view becomes visible', async () => {
      const webviewView = resolveView();

      // Start a task
      provider.handleTaskStarted(createStartEvent('dev'));
      await new Promise(r => setTimeout(r, 10));

      // Hide then show
      webviewView._simulateVisibilityChange(false);
      webviewView.webview._messages = [];
      webviewView._simulateVisibilityChange(true);
      await new Promise(r => setTimeout(r, 50));

      const startedMsgs = webviewView.webview._messages.filter(
        m => m.type === 'taskStarted' && m.taskLabel === 'Workspace|dev'
      );
      assert.ok(startedMsgs.length >= 1, 'should restore running task on visibility');
    });
  });

  // -----------------------------------------------------------------------
  //  Full webview reconnect cycle (resolveWebviewView + ready)
  // -----------------------------------------------------------------------
  suite('full reconnect cycle', () => {
    test('failures that occurred while hidden survive reconnect', async () => {
      const webviewView = resolveView();

      // Task fails while user is looking at the Control Panel
      provider.handleTaskStarted(createStartEvent('deploy'));
      provider.handleTaskEnded(createEndEvent('deploy', 1));
      await new Promise(r => setTimeout(r, 10));

      // Verify failure was persisted
      const persisted = await provider.getPersistedFailedTasks();
      assert.ok(persisted['Workspace|deploy'], 'failure should be persisted');

      // Simulate full webview reconnect: clear messages (mimics webview disposal)
      webviewView.webview._messages = [];

      // Webview sends ready again (fresh JS context)
      webviewView.webview._simulateMessage({ type: 'ready' });
      await new Promise(r => setTimeout(r, 50));

      const failedMsgs = webviewView.webview._messages.filter(
        m => m.type === 'taskFailed' && m.taskLabel === 'Workspace|deploy'
      );
      assert.ok(failedMsgs.length >= 1, 'failure should survive full reconnect');
    });

    test('multiple failures are all restored', async () => {
      await provider.saveFailedTask('Workspace|build', {
        exitCode: 1,
        reason: 'compile error',
      });
      await provider.saveFailedTask('Workspace|lint', {
        exitCode: 2,
        reason: 'lint errors',
      });
      await provider.saveFailedTask('Workspace|test', {
        exitCode: 1,
        reason: 'test failures',
      });

      const webviewView = resolveView();
      webviewView.webview._messages = [];
      webviewView.webview._simulateMessage({ type: 'ready' });
      await new Promise(r => setTimeout(r, 50));

      const failedMsgs = webviewView.webview._messages.filter(
        m => m.type === 'taskFailed'
      );
      const labels = failedMsgs.map(m => m.taskLabel).sort();
      assert.ok(labels.includes('Workspace|build'), 'should restore build failure');
      assert.ok(labels.includes('Workspace|lint'), 'should restore lint failure');
      assert.ok(labels.includes('Workspace|test'), 'should restore test failure');
    });

    test('cleared failure is not restored after reconnect', async () => {
      await provider.saveFailedTask('Workspace|build', {
        exitCode: 1,
        reason: 'compile error',
      });
      // User dismisses the failure
      await provider.clearFailedTask('Workspace|build');

      const webviewView = resolveView();
      webviewView.webview._messages = [];
      webviewView.webview._simulateMessage({ type: 'ready' });
      await new Promise(r => setTimeout(r, 50));

      const failedMsgs = webviewView.webview._messages.filter(
        m => m.type === 'taskFailed' && m.taskLabel === 'Workspace|build'
      );
      assert.strictEqual(failedMsgs.length, 0, 'cleared failure should not reappear');
    });

    test('restarted task clears old failure before restore', async () => {
      // A task previously failed and was persisted
      await provider.saveFailedTask('Workspace|build', {
        exitCode: 1,
        reason: 'old error',
      });

      const webviewView = resolveView();

      // Task is re-run (handleTaskStarted clears persisted failure)
      provider.handleTaskStarted(createStartEvent('build'));
      await new Promise(r => setTimeout(r, 10));

      // Simulate reconnect
      webviewView.webview._messages = [];
      webviewView.webview._simulateMessage({ type: 'ready' });
      await new Promise(r => setTimeout(r, 50));

      // Should get taskStarted (running), not taskFailed
      const failedMsgs = webviewView.webview._messages.filter(
        m => m.type === 'taskFailed' && m.taskLabel === 'Workspace|build'
      );
      assert.strictEqual(failedMsgs.length, 0, 'old failure should not appear for restarted task');

      const startedMsgs = webviewView.webview._messages.filter(
        m => m.type === 'taskStarted' && m.taskLabel === 'Workspace|build'
      );
      assert.ok(startedMsgs.length >= 1, 'should show task as running');
    });

    test('dependency failure persisted on parent is restored', async () => {
      await provider.saveFailedTask('Workspace|deploy', {
        exitCode: -1,
        reason: 'Dependency failed: Workspace|build (exit code 1)',
        failedDependency: 'Workspace|build',
        duration: 2000,
        subtasks: ['Workspace|build'],
      });

      const webviewView = resolveView();
      webviewView.webview._messages = [];
      webviewView.webview._simulateMessage({ type: 'ready' });
      await new Promise(r => setTimeout(r, 50));

      const msg = webviewView.webview._messages.find(
        m => m.type === 'taskFailed' && m.taskLabel === 'Workspace|deploy'
      );
      assert.ok(msg, 'parent dependency failure should be restored');
      assert.strictEqual(msg.failedDependency, 'Workspace|build');
    });
  });

  // -----------------------------------------------------------------------
  //  resolveWebviewView itself restores state (initial load)
  // -----------------------------------------------------------------------
  suite('resolveWebviewView initial restore', () => {
    test('sends persisted failures on initial resolve', async () => {
      await provider.saveFailedTask('Workspace|build', {
        exitCode: 1,
        reason: 'error',
      });

      const webviewView = resolveView();
      await new Promise(r => setTimeout(r, 50));

      const failedMsgs = webviewView.webview._messages.filter(
        m => m.type === 'taskFailed'
      );
      assert.ok(failedMsgs.length >= 1, 'should send failures on initial resolve');
    });

    test('registers onDidChangeVisibility handler', () => {
      const webviewView = new vscode.MockWebviewView();
      stubFs(sandbox, {});

      const spy = sandbox.spy(webviewView, 'onDidChangeVisibility');
      provider.resolveWebviewView(webviewView, {}, {});

      assert.ok(spy.calledOnce, 'should register visibility handler');
    });
  });
});
