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
    test('multiple simultaneous handleTaskStarted for different tasks', () => {
      provider.handleTaskStarted(createStartEvent('build'));
      provider.handleTaskStarted(createStartEvent('test'));
      provider.handleTaskStarted(createStartEvent('lint'));

      assert.strictEqual(provider._runningTasks.size, 3);
      assert.strictEqual(provider._taskStates.get('build'), 'running');
      assert.strictEqual(provider._taskStates.get('test'), 'running');
      assert.strictEqual(provider._taskStates.get('lint'), 'running');
    });

    test('rapid start/stop on the same task label', async () => {
      // Start
      provider.handleTaskStarted(createStartEvent('build'));
      assert.strictEqual(provider._taskStates.get('build'), 'running');

      // End
      provider.handleTaskEnded(createEndEvent('build', 0));
      assert.strictEqual(provider._taskStates.has('build'), false);

      // Start again
      provider.handleTaskStarted(createStartEvent('build'));
      assert.strictEqual(provider._taskStates.get('build'), 'running');
      assert.ok(provider._runningTasks.has('build'));
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

      assert.ok(provider._runningTasks.has('build'));
      assert.ok(provider._runningTasks.has('test'));
      assert.ok(provider._runningTasks.has('lint'));
    });
  });

  // -----------------------------------------------------------------------
  //  Stopping Guards
  // -----------------------------------------------------------------------
  suite('Race Condition Prevention', () => {
    test('_stoppingTasks prevents re-entrant stopTask', async () => {
      const task = new vscode.MockTask('build');
      const execution = new vscode.MockTaskExecution(task);
      provider._runningTasks.set('build', execution);
      provider._taskStates.set('build', 'running');

      // Simulate that stopTask is already in progress
      provider._stoppingTasks.add('build');

      await provider.stopTask('build');
      // execution should NOT have been terminated because the guard fired
      assert.strictEqual(execution._terminated, false);
    });

    test('concurrent stopTask calls - second is a no-op', async () => {
      const task = new vscode.MockTask('build');
      const execution = new vscode.MockTaskExecution(task);
      provider._runningTasks.set('build', execution);
      provider._taskStates.set('build', 'running');

      // Fire two stops concurrently
      const [r1, r2] = await Promise.allSettled([
        provider.stopTask('build'),
        provider.stopTask('build'),
      ]);

      // Both should settle (no throws)
      assert.strictEqual(r1.status, 'fulfilled');
      assert.strictEqual(r2.status, 'fulfilled');

      // Task should be stopped
      assert.strictEqual(provider._taskStates.has('build'), false);
      assert.strictEqual(provider._stoppingTasks.has('build'), false);
    });

    test('stopTask on non-existent task is safe', async () => {
      await provider.stopTask('ghost');
      // Should not throw; should post a state message
      const msg = view.webview._messages.find(
        m => m.type === 'taskStateChanged' && m.taskLabel === 'ghost'
      );
      assert.ok(msg);
    });

    test('concurrent state modifications via handleTaskStarted', () => {
      // Start the same task twice rapidly (simulating duplicate events)
      const event1 = createStartEvent('build');
      const event2 = createStartEvent('build');
      provider.handleTaskStarted(event1);
      provider.handleTaskStarted(event2);

      // Guard prevents duplicate — first event's execution is retained
      assert.strictEqual(provider._taskStates.get('build'), 'running');
      assert.strictEqual(provider._runningTasks.get('build'), event1.execution);
    });
  });

  // -----------------------------------------------------------------------
  //  Hierarchy Modifications Under Concurrency
  // -----------------------------------------------------------------------
  suite('Concurrent Hierarchy Modifications', () => {
    test('concurrent addSubtask / removeSubtask', () => {
      provider.addSubtask('parent', 'child1');
      provider.addSubtask('parent', 'child2');
      provider.addSubtask('parent', 'child3');
      provider.removeSubtask('parent', 'child1');

      const children = provider.getTaskHierarchy('parent');
      assert.strictEqual(children.length, 2);
      assert.ok(children.includes('child2'));
      assert.ok(children.includes('child3'));
    });

    test('removing all children cleans up parent entry', () => {
      provider.addSubtask('p', 'c1');
      provider.addSubtask('p', 'c2');
      provider.removeSubtask('p', 'c1');
      provider.removeSubtask('p', 'c2');
      assert.strictEqual(provider._taskHierarchy.has('p'), false);
    });

    test('handleTaskEnded cleans up hierarchy for the ended task', () => {
      provider.handleTaskStarted(createStartEvent('parent'));
      provider.addSubtask('parent', 'child');
      provider.handleTaskStarted(createStartEvent('child'));

      // End parent — its hierarchy entry should be deleted
      provider.handleTaskEnded(createEndEvent('parent', 0));
      assert.strictEqual(provider._taskHierarchy.has('parent'), false);
    });
  });

  // -----------------------------------------------------------------------
  //  Webview Reconnection
  // -----------------------------------------------------------------------
  suite('Webview Reconnection', () => {
    test('restoreRunningTasksState re-sends running tasks to webview', async () => {
      provider.handleTaskStarted(createStartEvent('build'));
      provider.handleTaskStarted(createStartEvent('test'));

      // Flush microtasks from the .then() inside handleTaskStarted, then clear
      await new Promise(resolve => setTimeout(resolve, 0));
      view.webview._messages = [];
      await provider.restoreRunningTasksState();

      const startedMsgs = view.webview._messages.filter(m => m.type === 'taskStarted');
      assert.strictEqual(startedMsgs.length, 2);
    });

    test('restoreRunningTasksState sends taskFailed for failed tasks', async () => {
      provider.handleTaskStarted(createStartEvent('build'));
      provider._taskFailures.set('build', { exitCode: 1, reason: 'compile error' });

      view.webview._messages = [];
      await provider.restoreRunningTasksState();

      const failedMsgs = view.webview._messages.filter(m => m.type === 'taskFailed');
      assert.strictEqual(failedMsgs.length, 1);
      assert.strictEqual(failedMsgs[0].taskLabel, 'build');
    });

    test('restoreRunningTasksState sends persisted failures for non-running tasks', async () => {
      await provider.saveFailedTask('old-task', { exitCode: 2, reason: 'old error' });

      view.webview._messages = [];
      await provider.restoreRunningTasksState();

      const failedMsgs = view.webview._messages.filter(m => m.type === 'taskFailed');
      assert.ok(failedMsgs.find(m => m.taskLabel === 'old-task'));
    });

    test('restoreNavigationState re-sends navigation history', async () => {
      await provider.updateNavigationHistory(['a.mdx', 'b.mdx'], 1);
      view.webview._messages = [];

      await provider.restoreNavigationState();

      const msg = view.webview._messages.find(m => m.type === 'updateNavigationHistory');
      assert.ok(msg);
      assert.deepStrictEqual(msg.history, ['a.mdx', 'b.mdx']);
    });
  });
});
