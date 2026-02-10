/**
 * Failure Scenario Tests
 *
 * Tests failure handling, failure propagation through the hierarchy,
 * persisted failure state, and the stopTask escalation sequence.
 *
 * Updated to match the current MdxWebviewProvider API which uses:
 *   - _taskResults (Map) instead of the legacy _taskFailures
 *   - saveCompletedTask / getPersistedCompletedTasks / clearCompletedTask
 *   - 'taskCompleted' webview message (with `failed` flag) instead of 'taskFailed'
 */

const assert = require('assert');
const sinon = require('sinon');
const {
  createProvider,
  createStartEvent,
  createEndEvent,
  vscode,
} = require('./helpers/provider-factory');

/**
 * Helper: handleTaskStarted is async (queued via _taskStartQueue).
 * After calling provider.handleTaskStarted(event), await this to
 * ensure the handler has finished before making assertions.
 */
async function awaitTaskStart(provider) {
  await provider._taskStartQueue;
}

suite('Failure Scenario Tests', () => {
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
  //  Task Failure Handling
  // -----------------------------------------------------------------------
  suite('Task Failure Handling', () => {
    test('exit code 1 sets failure state in _taskResults', async () => {
      provider.handleTaskStarted(createStartEvent('build'));
      await awaitTaskStart(provider);
      provider.handleTaskEnded(createEndEvent('build', 1));
      // State should be cleaned up after handleTaskEnded
      assert.strictEqual(provider._taskStates.has('Workspace|build'), false);
      // Result should be tracked in _taskResults
      assert.ok(provider._taskResults.has('Workspace|build'));
      assert.strictEqual(provider._taskResults.get('Workspace|build').exitCode, 1);
      assert.strictEqual(provider._taskResults.get('Workspace|build').failed, true);
    });

    test('exit code 127 (command not found) sets failure state', async () => {
      provider.handleTaskStarted(createStartEvent('missing'));
      await awaitTaskStart(provider);
      provider.handleTaskEnded(createEndEvent('missing', 127));
      assert.strictEqual(provider._taskStates.has('Workspace|missing'), false);
      assert.strictEqual(provider._taskResults.get('Workspace|missing').exitCode, 127);
      assert.strictEqual(provider._taskResults.get('Workspace|missing').failed, true);
    });

    test('exit code 0 tracks result with failed=false', async () => {
      provider.handleTaskStarted(createStartEvent('build'));
      await awaitTaskStart(provider);
      provider.handleTaskEnded(createEndEvent('build', 0));
      assert.strictEqual(provider._taskStates.has('Workspace|build'), false);
      // Result is tracked for exit code 0, but failed should be false
      assert.ok(provider._taskResults.has('Workspace|build'));
      assert.strictEqual(provider._taskResults.get('Workspace|build').failed, false);
    });

    test('failure info includes reason, timestamp, and duration', async () => {
      provider.handleTaskStarted(createStartEvent('build'));
      await awaitTaskStart(provider);
      provider.handleTaskEnded(createEndEvent('build', 1));
      const info = provider._taskResults.get('Workspace|build');
      assert.ok(info.reason);
      assert.ok(info.timestamp);
      assert.ok(info.duration !== undefined);
    });

    test('failure persists to workspaceState via saveCompletedTask', async () => {
      provider.handleTaskStarted(createStartEvent('build'));
      await awaitTaskStart(provider);
      provider.handleTaskEnded(createEndEvent('build', 1));
      // saveCompletedTask is async fire-and-forget, give it a tick
      await new Promise(r => setTimeout(r, 20));
      const persisted = await provider.getPersistedCompletedTasks();
      assert.ok(persisted['Workspace|build']);
      assert.strictEqual(persisted['Workspace|build'].exitCode, 1);
      assert.strictEqual(persisted['Workspace|build'].failed, true);
    });

    test('re-running a task clears previous result from workspaceState', async () => {
      // Fail the task
      provider.handleTaskStarted(createStartEvent('build'));
      await awaitTaskStart(provider);
      provider.handleTaskEnded(createEndEvent('build', 1));
      await new Promise(r => setTimeout(r, 20));

      // Re-start clears result (handleTaskStarted calls clearCompletedTask)
      provider.handleTaskStarted(createStartEvent('build'));
      await awaitTaskStart(provider);
      await new Promise(r => setTimeout(r, 20));
      const persisted = await provider.getPersistedCompletedTasks();
      assert.strictEqual(persisted['Workspace|build'], undefined);
    });

    test('taskCompleted message with failed=true is posted to webview', async () => {
      provider.handleTaskStarted(createStartEvent('build'));
      await awaitTaskStart(provider);
      provider.handleTaskEnded(createEndEvent('build', 1));
      const msg = view.webview._messages.find(
        m => m.type === 'taskCompleted' && m.taskLabel === 'Workspace|build' && m.failed === true
      );
      assert.ok(msg, 'Expected a taskCompleted message with failed=true');
      assert.strictEqual(msg.exitCode, 1);
    });

    test('undefined exitCode is treated as 0 (success)', async () => {
      provider.handleTaskStarted(createStartEvent('build'));
      await awaitTaskStart(provider);
      provider.handleTaskEnded({ execution: createEndEvent('build').execution, exitCode: undefined });
      assert.strictEqual(provider._taskStates.has('Workspace|build'), false);
      // Should be tracked as success
      const result = provider._taskResults.get('Workspace|build');
      assert.ok(result);
      assert.strictEqual(result.failed, false);
      assert.strictEqual(result.exitCode, 0);
    });
  });

  // -----------------------------------------------------------------------
  //  Dependency Chain Failures (propagateTaskFailure)
  // -----------------------------------------------------------------------
  suite('Dependency Chain Failures', () => {
    test('child failure propagates to parent', async () => {
      // Set up parent as running with child subtask
      provider.handleTaskStarted(createStartEvent('parent'));
      await awaitTaskStart(provider);
      provider.addSubtask('Workspace|parent', 'Workspace|child');
      provider.handleTaskStarted(createStartEvent('child'));
      await awaitTaskStart(provider);

      // Child fails
      provider.handleTaskEnded(createEndEvent('child', 1));

      // Parent should be marked as failed via propagateTaskFailure
      // propagateTaskFailure sets state to 'failed' then deletes it during cleanup
      assert.strictEqual(provider._taskStates.has('Workspace|parent'), false);
      assert.ok(provider._taskResults.has('Workspace|parent'));
      assert.strictEqual(provider._taskResults.get('Workspace|parent').exitCode, -1);
      assert.ok(provider._taskResults.get('Workspace|parent').reason.includes('child'));
    });

    test('propagation terminates parent execution', async () => {
      const parentEvent = createStartEvent('parent');
      provider.handleTaskStarted(parentEvent);
      await awaitTaskStart(provider);
      provider.addSubtask('Workspace|parent', 'Workspace|child');
      provider.handleTaskStarted(createStartEvent('child'));
      await awaitTaskStart(provider);

      provider.handleTaskEnded(createEndEvent('child', 1));

      // Parent execution should have been terminated
      assert.strictEqual(parentEvent.execution._terminated, true);
    });

    test('propagation cleans up parent tracking', async () => {
      provider.handleTaskStarted(createStartEvent('parent'));
      await awaitTaskStart(provider);
      provider.addSubtask('Workspace|parent', 'Workspace|child');
      provider.handleTaskStarted(createStartEvent('child'));
      await awaitTaskStart(provider);

      provider.handleTaskEnded(createEndEvent('child', 1));

      assert.strictEqual(provider._runningTasks.has('Workspace|parent'), false);
      assert.strictEqual(provider._taskStartTimes.has('Workspace|parent'), false);
    });

    test('propagation posts taskCompleted for parent with failedDependency', async () => {
      provider.handleTaskStarted(createStartEvent('parent'));
      await awaitTaskStart(provider);
      provider.addSubtask('Workspace|parent', 'Workspace|child');
      provider.handleTaskStarted(createStartEvent('child'));
      await awaitTaskStart(provider);

      provider.handleTaskEnded(createEndEvent('child', 1));

      const msg = view.webview._messages.find(
        m => m.type === 'taskCompleted' && m.taskLabel === 'Workspace|parent' && m.failed === true
      );
      assert.ok(msg, 'Expected a taskCompleted message for parent');
      assert.strictEqual(msg.exitCode, -1);
      assert.strictEqual(msg.failedDependency, 'Workspace|child');
    });

    test('propagation reaches grandparents', async () => {
      provider.handleTaskStarted(createStartEvent('gp'));
      await awaitTaskStart(provider);
      provider.addSubtask('Workspace|gp', 'Workspace|parent');
      provider.handleTaskStarted(createStartEvent('parent'));
      await awaitTaskStart(provider);
      provider.addSubtask('Workspace|parent', 'Workspace|child');
      provider.handleTaskStarted(createStartEvent('child'));
      await awaitTaskStart(provider);

      provider.handleTaskEnded(createEndEvent('child', 1));

      // Both parent and grandparent should have been cleaned up
      assert.strictEqual(provider._taskStates.has('Workspace|parent'), false);
      assert.strictEqual(provider._taskStates.has('Workspace|gp'), false);
    });

    test('propagation is a no-op when parent is not running', async () => {
      // Parent not tracked at all
      provider.addSubtask('Workspace|parent', 'Workspace|child');
      provider.handleTaskStarted(createStartEvent('child'));
      await awaitTaskStart(provider);
      // Should not throw
      provider.handleTaskEnded(createEndEvent('child', 1));
      assert.strictEqual(provider._taskStates.has('Workspace|parent'), false);
    });

    test('failure persists for parent via saveCompletedTask', async () => {
      provider.handleTaskStarted(createStartEvent('parent'));
      await awaitTaskStart(provider);
      provider.addSubtask('Workspace|parent', 'Workspace|child');
      provider.handleTaskStarted(createStartEvent('child'));
      await awaitTaskStart(provider);

      provider.handleTaskEnded(createEndEvent('child', 1));
      await new Promise(r => setTimeout(r, 20));

      const persisted = await provider.getPersistedCompletedTasks();
      assert.ok(persisted['Workspace|parent']);
      assert.strictEqual(persisted['Workspace|parent'].failedDependency, 'Workspace|child');
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
      // Should not throw; guard posts a taskStateChanged message
      const msg = view.webview._messages.find(
        m => m.type === 'taskStateChanged' && m.taskLabel === 'Workspace|build'
      );
      assert.ok(msg);
      assert.strictEqual(msg.state, 'stopped');
    });

    test('stopTask is a no-op for failed tasks', async () => {
      provider._taskStates.set('Workspace|build', 'failed');
      await provider.stopTask('Workspace|build');
      // Should not throw; guard posts a taskStateChanged message
      const msg = view.webview._messages.find(
        m => m.type === 'taskStateChanged' && m.taskLabel === 'Workspace|build'
      );
      assert.ok(msg);
      assert.strictEqual(msg.state, 'failed');
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

      // Hierarchy should be cleaned up
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
    });

    test('runTask shows error for unknown task', async () => {
      const spy = sandbox.spy(vscode.window, 'showErrorMessage');
      await provider.runTask('nonexistent');
      assert.ok(spy.calledOnce);
      assert.ok(spy.firstCall.args[0].includes('nonexistent'));
    });

    test('runTask clears persisted completion before executing', async () => {
      // Persist a completed task result via the current API
      await provider.saveCompletedTask('Workspace|build', { exitCode: 1, failed: true });
      const task = new vscode.MockTask('build');
      vscode.tasks._registerTask(task);

      await provider.runTask('build');

      const persisted = await provider.getPersistedCompletedTasks();
      assert.strictEqual(persisted['Workspace|build'], undefined);
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
