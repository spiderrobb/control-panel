/**
 * Concurrency and Race Condition Tests
 *
 * Tests concurrent task operations, stopping guards, hierarchy
 * modifications under concurrency, and webview reconnection.
 */

const assert = require('assert');
const sinon = require('sinon');
const {
  createProvider,
  createStartEvent,
  createEndEvent,
  vscode,
} = require('./helpers/provider-factory');

suite('Concurrency and Race Condition Tests', () => {
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
  //  Concurrent Task Starts
  // -----------------------------------------------------------------------
  suite('Concurrent Task Execution', () => {
    test('multiple simultaneous handleTaskStarted for different tasks', async () => {
      provider.handleTaskStarted(createStartEvent('build'));
      provider.handleTaskStarted(createStartEvent('test'));
      provider.handleTaskStarted(createStartEvent('lint'));
      await provider._taskStartQueue;

      assert.strictEqual(provider._runningTasks.size, 3);
      assert.strictEqual(provider._taskStates.get('Workspace|build'), 'running');
      assert.strictEqual(provider._taskStates.get('Workspace|test'), 'running');
      assert.strictEqual(provider._taskStates.get('Workspace|lint'), 'running');
    });

    test('rapid start/stop on the same task label', async () => {
      // Start
      provider.handleTaskStarted(createStartEvent('build'));
      await provider._taskStartQueue;
      assert.strictEqual(provider._taskStates.get('Workspace|build'), 'running');

      // End
      provider.handleTaskEnded(createEndEvent('build', 0));
      assert.strictEqual(provider._taskStates.has('Workspace|build'), false);

      // Start again
      provider.handleTaskStarted(createStartEvent('build'));
      await provider._taskStartQueue;
      assert.strictEqual(provider._taskStates.get('Workspace|build'), 'running');
      assert.ok(provider._runningTasks.has('Workspace|build'));
    });

    test('concurrent runTask calls for different tasks', async () => {
      vscode.tasks._registerTask(new vscode.MockTask('build'));
      vscode.tasks._registerTask(new vscode.MockTask('test'));
      vscode.tasks._registerTask(new vscode.MockTask('lint'));

      // Fire all concurrently
      await Promise.all([
        provider.runTask('build'),
        provider.runTask('test'),
        provider.runTask('lint'),
      ]);

      assert.ok(provider._runningTasks.has('Workspace|build'));
      assert.ok(provider._runningTasks.has('Workspace|test'));
      assert.ok(provider._runningTasks.has('Workspace|lint'));
    });
  });

  // -----------------------------------------------------------------------
  //  Stopping Guards
  // -----------------------------------------------------------------------
  suite('Race Condition Prevention', () => {
    test('_stoppingTasks prevents re-entrant stopTask', async () => {
      const task = new vscode.MockTask('build');
      const execution = new vscode.MockTaskExecution(task);
      provider._runningTasks.set('Workspace|build', execution);
      provider._taskStates.set('Workspace|build', 'running');

      // Simulate that stopTask is already in progress
      provider._stoppingTasks.add('Workspace|build');

      await provider.stopTask('Workspace|build');
      // execution should NOT have been terminated because the guard fired
      assert.strictEqual(execution._terminated, false);
    });

    test('concurrent stopTask calls - second is a no-op', async () => {
      const task = new vscode.MockTask('build');
      const execution = new vscode.MockTaskExecution(task);
      provider._runningTasks.set('Workspace|build', execution);
      provider._taskStates.set('Workspace|build', 'running');

      // Fire two stops concurrently
      const [r1, r2] = await Promise.allSettled([
        provider.stopTask('Workspace|build'),
        provider.stopTask('Workspace|build'),
      ]);

      // Both should settle (no throws)
      assert.strictEqual(r1.status, 'fulfilled');
      assert.strictEqual(r2.status, 'fulfilled');

      // Task should be stopped
      assert.strictEqual(provider._taskStates.has('Workspace|build'), false);
      assert.strictEqual(provider._stoppingTasks.has('Workspace|build'), false);
    });

    test('stopTask on non-existent task is safe', async () => {
      await provider.stopTask('ghost');
      // Should not throw; should post a state message
      // Note: 'ghost' is interpreted as ID if not found as name.
      // Wait, is 'ghost' a name? Not registered.
      // So logic:
      // 1. Check ID 'ghost' -> not running.
      // 2. Check name 'ghost' -> not found.
      // 3. Post 'stopped'.
      // The message taskLabel will be 'ghost' (the input).
      const msg = view.webview._messages.find(
        m => m.type === 'taskStateChanged' && m.taskLabel === 'ghost'
      );
      assert.ok(msg);
    });

    test('concurrent state modifications via handleTaskStarted', async () => {
      // Start the same task twice rapidly (simulating duplicate events)
      const event1 = createStartEvent('build');
      const event2 = createStartEvent('build');
      provider.handleTaskStarted(event1);
      provider.handleTaskStarted(event2);
      await provider._taskStartQueue;

      // Guard prevents duplicate — first event's execution is retained
      assert.strictEqual(provider._taskStates.get('Workspace|build'), 'running');
      assert.strictEqual(provider._runningTasks.get('Workspace|build'), event1.execution);
    });
  });

  // -----------------------------------------------------------------------
  //  Hierarchy Modifications Under Concurrency
  // -----------------------------------------------------------------------
  suite('Concurrent Hierarchy Modifications', () => {
    test('concurrent addSubtask / removeSubtask', () => {
      provider.addSubtask('Workspace|parent', 'Workspace|child1');
      provider.addSubtask('Workspace|parent', 'Workspace|child2');
      provider.addSubtask('Workspace|parent', 'Workspace|child3');
      provider.removeSubtask('Workspace|parent', 'Workspace|child1');

      const children = provider.getTaskHierarchy('Workspace|parent');
      assert.strictEqual(children.length, 2);
      assert.ok(children.includes('Workspace|child2'));
      assert.ok(children.includes('Workspace|child3'));
    });

    test('removing all children cleans up parent entry', () => {
      provider.addSubtask('Workspace|p', 'Workspace|c1');
      provider.addSubtask('Workspace|p', 'Workspace|c2');
      provider.removeSubtask('Workspace|p', 'Workspace|c1');
      provider.removeSubtask('Workspace|p', 'Workspace|c2');
      assert.strictEqual(provider._taskHierarchy.has('Workspace|p'), false);
    });

    test('handleTaskEnded cleans up hierarchy for the ended task', async () => {
      provider.handleTaskStarted(createStartEvent('parent'));
      provider.handleTaskStarted(createStartEvent('child'));
      await provider._taskStartQueue;
      provider.addSubtask('Workspace|parent', 'Workspace|child');

      // End parent — its hierarchy entry should be deleted
      provider.handleTaskEnded(createEndEvent('parent', 0));
      assert.strictEqual(provider._taskHierarchy.has('Workspace|parent'), false);
    });
  });

  // -----------------------------------------------------------------------
  //  Webview Reconnection
  // -----------------------------------------------------------------------
  suite('Webview Reconnection', () => {
    test('restoreRunningTasksState re-sends running tasks to webview', async () => {
      provider.handleTaskStarted(createStartEvent('build'));
      provider.handleTaskStarted(createStartEvent('test'));
      await provider._taskStartQueue;

      view.webview._messages = [];
      await provider.restoreRunningTasksState();

      const startedMsgs = view.webview._messages.filter(m => m.type === 'taskStarted');
      assert.strictEqual(startedMsgs.length, 2);
    });

    test('restoreRunningTasksState sends taskCompleted for failed tasks', async () => {
      // Start the task so it appears in _runningTasks and _taskStartTimes
      provider.handleTaskStarted(createStartEvent('build'));
      await provider._taskStartQueue;

      // Mark it as failed via _taskResults (the Map the provider actually uses)
      provider._taskResults.set('Workspace|build', { exitCode: 1, failed: true, reason: 'compile error' });

      view.webview._messages = [];
      await provider.restoreRunningTasksState();

      // Provider sends 'taskCompleted' with the failure info, not 'taskFailed'
      const failedMsgs = view.webview._messages.filter(
        m => m.type === 'taskCompleted' && m.taskLabel === 'Workspace|build'
      );
      assert.strictEqual(failedMsgs.length, 1);
      assert.strictEqual(failedMsgs[0].exitCode, 1);
      assert.strictEqual(failedMsgs[0].failed, true);
      assert.strictEqual(failedMsgs[0].reason, 'compile error');
    });
  });
});
