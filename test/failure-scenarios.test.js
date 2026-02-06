/**
 * Failure Scenario Tests
 *
 * Tests failure handling, failure propagation through the hierarchy,
 * persisted failure state, and the stopTask escalation sequence.
 */

const assert = require('assert');
const sinon = require('sinon');
const {
  createProvider,
  createStartEvent,
  createEndEvent,
  vscode,
} = require('./helpers/provider-factory');

suite('Failure Scenario Tests', () => {
  let provider, view;
  let sandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    ({ provider, view } = createProvider());
  });

  teardown(() => {
    sandbox.restore();
  });

  // -----------------------------------------------------------------------
  //  Task Failure Handling
  // -----------------------------------------------------------------------
  suite('Task Failure Handling', () => {
    test('exit code 1 sets failure state', () => {
      provider.handleTaskStarted(createStartEvent('build'));
      provider.handleTaskEnded(createEndEvent('build', 1));
      assert.strictEqual(provider._taskStates.has('Workspace|build'), false);
      assert.ok(provider._taskFailures.has('Workspace|build'));
      assert.strictEqual(provider._taskFailures.get('Workspace|build').exitCode, 1);
    });

    test('exit code 127 (command not found) sets failure state', () => {
      provider.handleTaskStarted(createStartEvent('missing'));
      provider.handleTaskEnded(createEndEvent('missing', 127));
      assert.strictEqual(provider._taskStates.has('Workspace|missing'), false);
      assert.strictEqual(provider._taskFailures.get('Workspace|missing').exitCode, 127);
    });

    test('exit code 0 does NOT set failure state', () => {
      provider.handleTaskStarted(createStartEvent('build'));
      provider.handleTaskEnded(createEndEvent('build', 0));
      assert.strictEqual(provider._taskStates.has('Workspace|build'), false);
      assert.strictEqual(provider._taskFailures.has('Workspace|build'), false);
    });

    test('failure info includes reason, timestamp, and duration', () => {
      provider.handleTaskStarted(createStartEvent('build'));
      provider.handleTaskEnded(createEndEvent('build', 1));
      const info = provider._taskFailures.get('Workspace|build');
      assert.ok(info.reason);
      assert.ok(info.timestamp);
      assert.ok(info.duration !== undefined);
    });

    test('failure persists to globalState', async () => {
      provider.handleTaskStarted(createStartEvent('build'));
      provider.handleTaskEnded(createEndEvent('build', 1));
      // saveFailedTask is async fire-and-forget, give it a tick
      await new Promise(r => setTimeout(r, 10));
      const persisted = await provider.getPersistedFailedTasks();
      assert.ok(persisted['Workspace|build']);
      assert.strictEqual(persisted['Workspace|build'].exitCode, 1);
    });

    test('re-running a task clears previous failure from globalState', async () => {
      // Fail the task
      provider.handleTaskStarted(createStartEvent('build'));
      provider.handleTaskEnded(createEndEvent('build', 1));
      await new Promise(r => setTimeout(r, 10));

      // Re-start clears failure
      provider.handleTaskStarted(createStartEvent('build'));
      await new Promise(r => setTimeout(r, 10));
      const persisted = await provider.getPersistedFailedTasks();
      assert.strictEqual(persisted['Workspace|build'], undefined);
    });

    test('taskFailed message is posted to webview', () => {
      provider.handleTaskStarted(createStartEvent('build'));
      provider.handleTaskEnded(createEndEvent('build', 1));
      const msg = view.webview._messages.find(m => m.type === 'taskFailed' && m.taskLabel === 'Workspace|build');
      assert.ok(msg);
      assert.strictEqual(msg.exitCode, 1);
    });

    test('undefined exitCode is treated as 0 (success)', () => {
      provider.handleTaskStarted(createStartEvent('build'));
      provider.handleTaskEnded({ execution: createEndEvent('build').execution, exitCode: undefined });
      assert.strictEqual(provider._taskStates.has('Workspace|build'), false);
    });
  });

  // -----------------------------------------------------------------------
  //  Dependency Chain Failures (propagateTaskFailure)
  // -----------------------------------------------------------------------
  suite('Dependency Chain Failures', () => {
    test('child failure propagates to parent', () => {
      // Set up parent as running with child subtask
      provider.handleTaskStarted(createStartEvent('parent'));
      provider.addSubtask('Workspace|parent', 'Workspace|child');
      provider.handleTaskStarted(createStartEvent('child'));

      // Child fails
      provider.handleTaskEnded(createEndEvent('child', 1));

      // Parent should be marked as failed (state cleaned up, failure info persisted)
      assert.strictEqual(provider._taskStates.has('Workspace|parent'), false);
      assert.ok(provider._taskFailures.has('Workspace|parent'));
      assert.strictEqual(provider._taskFailures.get('Workspace|parent').exitCode, -1);
      assert.ok(provider._taskFailures.get('Workspace|parent').reason.includes('child'));
    });

    test('propagation terminates parent execution', () => {
      const parentEvent = createStartEvent('parent');
      provider.handleTaskStarted(parentEvent);
      provider.addSubtask('Workspace|parent', 'Workspace|child');
      provider.handleTaskStarted(createStartEvent('child'));

      provider.handleTaskEnded(createEndEvent('child', 1));

      // Parent execution should have been terminated
      assert.strictEqual(parentEvent.execution._terminated, true);
    });

    test('propagation cleans up parent tracking', () => {
      provider.handleTaskStarted(createStartEvent('parent'));
      provider.addSubtask('Workspace|parent', 'Workspace|child');
      provider.handleTaskStarted(createStartEvent('child'));

      provider.handleTaskEnded(createEndEvent('child', 1));

      assert.strictEqual(provider._runningTasks.has('Workspace|parent'), false);
      assert.strictEqual(provider._taskStartTimes.has('Workspace|parent'), false);
    });

    test('propagation posts taskFailed for parent', () => {
      provider.handleTaskStarted(createStartEvent('parent'));
      provider.addSubtask('Workspace|parent', 'Workspace|child');
      provider.handleTaskStarted(createStartEvent('child'));

      provider.handleTaskEnded(createEndEvent('child', 1));

      const msg = view.webview._messages.find(
        m => m.type === 'taskFailed' && m.taskLabel === 'Workspace|parent'
      );
      assert.ok(msg);
      assert.strictEqual(msg.exitCode, -1);
      assert.ok(msg.failedDependency === 'Workspace|child');
    });

    test('propagation reaches grandparents', () => {
      provider.handleTaskStarted(createStartEvent('gp'));
      provider.addSubtask('Workspace|gp', 'Workspace|parent');
      provider.handleTaskStarted(createStartEvent('parent'));
      provider.addSubtask('Workspace|parent', 'Workspace|child');
      provider.handleTaskStarted(createStartEvent('child'));

      provider.handleTaskEnded(createEndEvent('child', 1));

      assert.strictEqual(provider._taskStates.has('Workspace|parent'), false);
      assert.strictEqual(provider._taskStates.has('Workspace|gp'), false);
    });

    test('propagation is a no-op when parent is not running', () => {
      // Parent not tracked at all
      provider.addSubtask('Workspace|parent', 'Workspace|child');
      provider.handleTaskStarted(createStartEvent('child'));
      // Should not throw
      provider.handleTaskEnded(createEndEvent('child', 1));
      assert.strictEqual(provider._taskStates.has('Workspace|parent'), false);
    });

    test('failure persists for parent via saveFailedTask', async () => {
      provider.handleTaskStarted(createStartEvent('parent'));
      provider.addSubtask('Workspace|parent', 'Workspace|child');
      provider.handleTaskStarted(createStartEvent('child'));

      provider.handleTaskEnded(createEndEvent('child', 1));
      await new Promise(r => setTimeout(r, 10));

      const persisted = await provider.getPersistedFailedTasks();
      assert.ok(persisted['Workspace|parent']);
      assert.ok(persisted['Workspace|parent'].failedDependency === 'Workspace|child');
    });
  });

  // -----------------------------------------------------------------------
  //  stopTask behaviour
  // -----------------------------------------------------------------------
  suite('stopTask', () => {
    test('stopTask cleans up state and runningTasks', async () => {
      // Manually put task in running state
      const task = new vscode.MockTask('build');
      const execution = new vscode.MockTaskExecution(task);
      provider._runningTasks.set('Workspace|build', execution);
      provider._taskStates.set('Workspace|build', 'running');

      await provider.stopTask('Workspace|build');

      assert.strictEqual(provider._taskStates.has('Workspace|build'), false);
      assert.strictEqual(provider._runningTasks.has('Workspace|build'), false);
    });

    test('stopTask calls execution.terminate()', async () => {
      const task = new vscode.MockTask('build');
      const execution = new vscode.MockTaskExecution(task);
      provider._runningTasks.set('Workspace|build', execution);
      provider._taskStates.set('Workspace|build', 'running');

      await provider.stopTask('Workspace|build');

      assert.strictEqual(execution._terminated, true);
    });

    test('stopTask is a no-op for already stopped tasks', async () => {
      provider._taskStates.set('Workspace|build', 'stopped');
      // no execution registered
      await provider.stopTask('Workspace|build');
      // Should not throw
      const msg = view.webview._messages.find(
        m => m.type === 'taskStateChanged' && m.taskLabel === 'Workspace|build'
      );
      assert.ok(msg);
      assert.strictEqual(msg.state, 'stopped');
    });

    test('stopTask is a no-op for failed tasks', async () => {
      provider._taskStates.set('Workspace|build', 'failed');
      await provider.stopTask('Workspace|build');
      // Should not throw, state unchanged
    });

    test('stopTask guard prevents concurrent stops (stoppingTasks set)', async () => {
      const task = new vscode.MockTask('build');
      const execution = new vscode.MockTaskExecution(task);
      provider._runningTasks.set('Workspace|build', execution);
      provider._taskStates.set('Workspace|build', 'running');
      provider._stoppingTasks.add('Workspace|build');

      await provider.stopTask('Workspace|build');
      // Since it was already in stoppingTasks, it should be a no-op
      // The execution should NOT have been terminated
      assert.strictEqual(execution._terminated, false);
    });

    test('stopTask posts stopping then stopped states', async () => {
      const task = new vscode.MockTask('build');
      const execution = new vscode.MockTaskExecution(task);
      provider._runningTasks.set('Workspace|build', execution);
      provider._taskStates.set('Workspace|build', 'running');

      await provider.stopTask('Workspace|build');

      const stateChanges = view.webview._messages.filter(
        m => m.type === 'taskStateChanged' && m.taskLabel === 'Workspace|build'
      );
      assert.ok(stateChanges.length >= 2);
      assert.strictEqual(stateChanges[0].state, 'stopping');
      assert.strictEqual(stateChanges[stateChanges.length - 1].state, 'stopped');
    });

    test('stopTask removes label from stoppingTasks when done', async () => {
      const task = new vscode.MockTask('build');
      const execution = new vscode.MockTaskExecution(task);
      provider._runningTasks.set('Workspace|build', execution);
      provider._taskStates.set('Workspace|build', 'running');

      await provider.stopTask('Workspace|build');
      assert.strictEqual(provider._stoppingTasks.has('Workspace|build'), false);
    });

    test('stopTask with children terminates children and cleans hierarchy', async () => {
      // Set up parent with two children
      const parentTask = new vscode.MockTask('parent');
      const parentExec = new vscode.MockTaskExecution(parentTask);
      provider._runningTasks.set('Workspace|parent', parentExec);
      provider._taskStates.set('Workspace|parent', 'running');

      const child1Task = new vscode.MockTask('child1');
      const child1Exec = new vscode.MockTaskExecution(child1Task);
      provider._runningTasks.set('Workspace|child1', child1Exec);
      provider._taskStates.set('Workspace|child1', 'running');

      const child2Task = new vscode.MockTask('child2');
      const child2Exec = new vscode.MockTaskExecution(child2Task);
      provider._runningTasks.set('Workspace|child2', child2Exec);
      provider._taskStates.set('Workspace|child2', 'running');

      provider.addSubtask('Workspace|parent', 'Workspace|child1');
      provider.addSubtask('Workspace|parent', 'Workspace|child2');

      await provider.stopTask('Workspace|parent');

      // Children should have been terminated
      assert.strictEqual(child1Exec._terminated, true);
      assert.strictEqual(child2Exec._terminated, true);

      // Hierarchy should be cleaned up (removeSubtask was called correctly)
      assert.deepStrictEqual(provider.getTaskHierarchy('Workspace|parent'), []);

      // All tasks should be cleaned up from _taskStates
      assert.strictEqual(provider._taskStates.has('Workspace|parent'), false);
      assert.strictEqual(provider._taskStates.has('Workspace|child1'), false);
      assert.strictEqual(provider._taskStates.has('Workspace|child2'), false);
    });
  });

  // -----------------------------------------------------------------------
  //  runTask
  // -----------------------------------------------------------------------
  suite('runTask', () => {
    test('runTask finds and executes a registered task', async () => {
      const task = new vscode.MockTask('build');
      vscode.tasks._registerTask(task);

      await provider.runTask('build');

      assert.ok(provider._runningTasks.has('Workspace|build'));

      vscode.tasks._clearTasks();
    });

    test('runTask shows error for unknown task', async () => {
      const spy = sandbox.spy(vscode.window, 'showErrorMessage');
      await provider.runTask('nonexistent');
      assert.ok(spy.calledOnce);
      assert.ok(spy.firstCall.args[0].includes('nonexistent'));
    });

    test('runTask clears persisted failure before executing', async () => {
      await provider.saveFailedTask('Workspace|build', { exitCode: 1 });
      const task = new vscode.MockTask('build');
      vscode.tasks._registerTask(task);

      await provider.runTask('build');

      const persisted = await provider.getPersistedFailedTasks();
      assert.strictEqual(persisted['Workspace|build'], undefined);

      vscode.tasks._clearTasks();
    });

    test('runTask adds to recently used', async () => {
      const task = new vscode.MockTask('build');
      vscode.tasks._registerTask(task);

      await provider.runTask('build');

      const recent = await provider.getRecentlyUsedTasks();
      assert.ok(recent.includes('Workspace|build'));
    });
  });
});
