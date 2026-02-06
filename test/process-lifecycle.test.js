/**
 * Process Lifecycle Tests
 *
 * Tests state transitions, task start/end handling, task history,
 * recently-used tracking, starred tasks, navigation, and webview messaging.
 */

const assert = require('assert');
const sinon = require('sinon');
const {
  createProvider,
  createStartEvent,
  createEndEvent,
} = require('./helpers/provider-factory');

suite('Process Lifecycle Tests', () => {
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
  //  Task State Transitions (via handleTaskStarted / handleTaskEnded)
  // -----------------------------------------------------------------------
  suite('Task State Transitions', () => {
    test('handleTaskStarted sets state to running', () => {
      provider.handleTaskStarted(createStartEvent('build'));
      assert.strictEqual(provider._taskStates.get('Workspace|build'), 'running');
    });

    test('handleTaskStarted records the execution', () => {
      const event = createStartEvent('build');
      provider.handleTaskStarted(event);
      assert.ok(provider._runningTasks.has('Workspace|build'));
      assert.strictEqual(provider._runningTasks.get('Workspace|build'), event.execution);
    });

    test('handleTaskStarted records start time', () => {
      const before = Date.now();
      provider.handleTaskStarted(createStartEvent('build'));
      const after = Date.now();
      const startTime = provider._taskStartTimes.get('Workspace|build');
      assert.ok(startTime >= before && startTime <= after);
    });

    test('handleTaskStarted clears previous failure', () => {
      provider._taskFailures.set('Workspace|build', { exitCode: 1, reason: 'old' });
      provider.handleTaskStarted(createStartEvent('build'));
      assert.strictEqual(provider._taskFailures.has('Workspace|build'), false);
    });

    test('handleTaskStarted posts taskStarted to webview', async () => {
      provider.handleTaskStarted(createStartEvent('build'));
      // getTaskHistory is async — give it a tick
      await new Promise(r => setTimeout(r, 10));
      const msgs = view.webview._messages;
      const started = msgs.find(m => m.type === 'taskStarted' && m.taskLabel === 'Workspace|build');
      assert.ok(started, 'should post taskStarted');
    });

    test('handleTaskEnded with exitCode 0 cleans up state entry', () => {
      provider.handleTaskStarted(createStartEvent('build'));
      provider.handleTaskEnded(createEndEvent('build', 0));
      assert.strictEqual(provider._taskStates.has('Workspace|build'), false);
    });

    test('handleTaskEnded with non-zero exitCode cleans up state entry', () => {
      provider.handleTaskStarted(createStartEvent('build'));
      provider.handleTaskEnded(createEndEvent('build', 1));
      assert.strictEqual(provider._taskStates.has('Workspace|build'), false);
    });

    test('handleTaskEnded cleans up runningTasks and startTimes', () => {
      provider.handleTaskStarted(createStartEvent('build'));
      assert.ok(provider._runningTasks.has('Workspace|build'));
      assert.ok(provider._taskStartTimes.has('Workspace|build'));
      provider.handleTaskEnded(createEndEvent('build', 0));
      assert.strictEqual(provider._runningTasks.has('Workspace|build'), false);
      assert.strictEqual(provider._taskStartTimes.has('Workspace|build'), false);
    });

    test('handleTaskEnded posts taskEnded for success', () => {
      provider.handleTaskStarted(createStartEvent('build'));
      provider.handleTaskEnded(createEndEvent('build', 0));
      const ended = view.webview._messages.find(m => m.type === 'taskEnded' && m.taskLabel === 'Workspace|build');
      assert.ok(ended);
      assert.strictEqual(ended.exitCode, 0);
    });

    test('handleTaskEnded posts taskFailed for failure', () => {
      provider.handleTaskStarted(createStartEvent('build'));
      provider.handleTaskEnded(createEndEvent('build', 2));
      const failed = view.webview._messages.find(m => m.type === 'taskFailed' && m.taskLabel === 'Workspace|build');
      assert.ok(failed);
      assert.strictEqual(failed.exitCode, 2);
    });
  });

  // -----------------------------------------------------------------------
  //  Task History
  // -----------------------------------------------------------------------
  suite('Task History', () => {
    test('getTaskHistory returns default for unknown task', async () => {
      const h = await provider.getTaskHistory('unknown');
      assert.deepStrictEqual(h, { durations: [], count: 0 });
    });

    test('updateTaskHistory records duration and count', async () => {
      await provider.updateTaskHistory('Workspace|build', 1000);
      const h = await provider.getTaskHistory('Workspace|build');
      assert.deepStrictEqual(h.durations, [1000]);
      assert.strictEqual(h.count, 1);
    });

    test('updateTaskHistory keeps rolling window of 10', async () => {
      for (let i = 0; i < 12; i++) {
        await provider.updateTaskHistory('Workspace|build', i * 100);
      }
      const h = await provider.getTaskHistory('Workspace|build');
      assert.strictEqual(h.durations.length, 10);
      assert.strictEqual(h.count, 12);
      assert.strictEqual(h.durations[0], 200); // first two evicted
    });

    test('handleTaskEnded updates history for successful tasks', async () => {
      provider.handleTaskStarted(createStartEvent('build'));
      await new Promise(r => setTimeout(r, 5));
      provider.handleTaskEnded(createEndEvent('build', 0));
      await new Promise(r => setTimeout(r, 20));
      const h = await provider.getTaskHistory('Workspace|build');
      assert.strictEqual(h.count, 1);
    });

    test('handleTaskEnded does NOT update history for failed tasks', async () => {
      provider.handleTaskStarted(createStartEvent('build'));
      provider.handleTaskEnded(createEndEvent('build', 1));
      await new Promise(r => setTimeout(r, 20));
      const h = await provider.getTaskHistory('Workspace|build');
      assert.strictEqual(h.count, 0);
    });
  });

  // -----------------------------------------------------------------------
  //  Recently Used Tasks
  // -----------------------------------------------------------------------
  suite('Recently Used Tasks', () => {
    test('empty by default', async () => {
      assert.deepStrictEqual(await provider.getRecentlyUsedTasks(), []);
    });

    test('addRecentlyUsedTask prepends', async () => {
      await provider.addRecentlyUsedTask('Workspace|build');
      await provider.addRecentlyUsedTask('Workspace|test');
      assert.deepStrictEqual(await provider.getRecentlyUsedTasks(), ['Workspace|test', 'Workspace|build']);
    });

    test('deduplicates by moving to front', async () => {
      await provider.addRecentlyUsedTask('Workspace|build');
      await provider.addRecentlyUsedTask('Workspace|test');
      await provider.addRecentlyUsedTask('Workspace|build');
      assert.deepStrictEqual(await provider.getRecentlyUsedTasks(), ['Workspace|build', 'Workspace|test']);
    });

    test('caps at 5 entries', async () => {
      for (let i = 0; i < 7; i++) await provider.addRecentlyUsedTask(`Workspace|t${i}`);
      assert.strictEqual((await provider.getRecentlyUsedTasks()).length, 5);
    });

    test('posts updateRecentlyUsed to webview', async () => {
      await provider.addRecentlyUsedTask('Workspace|build');
      assert.ok(view.webview._messages.find(m => m.type === 'updateRecentlyUsed'));
    });
  });

  // -----------------------------------------------------------------------
  //  Starred Tasks
  // -----------------------------------------------------------------------
  suite('Starred Tasks', () => {
    test('empty by default', async () => {
      assert.deepStrictEqual(await provider.getStarredTasks(), []);
    });

    test('toggleStarTask stars a task', async () => {
      await provider.toggleStarTask('Workspace|build');
      assert.deepStrictEqual(await provider.getStarredTasks(), ['Workspace|build']);
    });

    test('toggleStarTask unstars a task', async () => {
      await provider.toggleStarTask('Workspace|build');
      await provider.toggleStarTask('Workspace|build');
      assert.deepStrictEqual(await provider.getStarredTasks(), []);
    });

    test('caps at 20 starred tasks', async () => {
      for (let i = 0; i < 20; i++) await provider.toggleStarTask(`Workspace|t${i}`);
      const result = await provider.toggleStarTask('Workspace|overflow');
      assert.strictEqual(result.length, 20);
      assert.ok(!result.includes('Workspace|overflow'));
    });

    test('posts updateStarred to webview', async () => {
      await provider.toggleStarTask('Workspace|build');
      assert.ok(view.webview._messages.find(m => m.type === 'updateStarred'));
    });
  });

  // -----------------------------------------------------------------------
  //  Navigation History
  // -----------------------------------------------------------------------
  suite('Navigation History', () => {
    test('defaults to empty / -1', async () => {
      assert.deepStrictEqual(await provider.getNavigationHistory(), []);
      assert.strictEqual(await provider.getNavigationIndex(), -1);
    });

    test('updateNavigationHistory persists and notifies', async () => {
      await provider.updateNavigationHistory(['a.mdx', 'b.mdx'], 1);
      assert.deepStrictEqual(await provider.getNavigationHistory(), ['a.mdx', 'b.mdx']);
      assert.strictEqual(await provider.getNavigationIndex(), 1);
      assert.ok(view.webview._messages.find(m => m.type === 'updateNavigationHistory'));
    });
  });

  // -----------------------------------------------------------------------
  //  Execution History
  // -----------------------------------------------------------------------
  suite('Execution History', () => {
    test('empty by default', async () => {
      assert.deepStrictEqual(await provider.getExecutionHistory(), []);
    });

    test('addExecutionRecord prepends', async () => {
      await provider.addExecutionRecord({ id: '1', taskLabel: 'Workspace|build' });
      await provider.addExecutionRecord({ id: '2', taskLabel: 'Workspace|test' });
      const h = await provider.getExecutionHistory();
      assert.strictEqual(h[0].taskLabel, 'Workspace|test');
    });

    test('caps at 20 entries', async () => {
      for (let i = 0; i < 25; i++) {
        await provider.addExecutionRecord({ id: `${i}`, taskLabel: `Workspace|t${i}` });
      }
      assert.strictEqual((await provider.getExecutionHistory()).length, 20);
    });

    test('handleTaskEnded adds execution record', async () => {
      provider.handleTaskStarted(createStartEvent('build'));
      provider.handleTaskEnded(createEndEvent('build', 0));
      await new Promise(r => setTimeout(r, 20));
      const h = await provider.getExecutionHistory();
      assert.strictEqual(h.length, 1);
      assert.strictEqual(h[0].failed, false);
    });
  });

  // -----------------------------------------------------------------------
  //  Subtask Hierarchy
  // -----------------------------------------------------------------------
  suite('Subtask Hierarchy', () => {
    test('addSubtask creates parent-child', () => {
      provider.addSubtask('Workspace|p', 'Workspace|c1');
      provider.addSubtask('Workspace|p', 'Workspace|c2');
      assert.deepStrictEqual(provider.getTaskHierarchy('Workspace|p').sort(), ['Workspace|c1', 'Workspace|c2']);
    });

    test('removeSubtask removes child', () => {
      provider.addSubtask('Workspace|p', 'Workspace|c1');
      provider.addSubtask('Workspace|p', 'Workspace|c2');
      provider.removeSubtask('Workspace|p', 'Workspace|c1');
      assert.deepStrictEqual(provider.getTaskHierarchy('Workspace|p'), ['Workspace|c2']);
    });

    test('removeSubtask cleans up empty parent', () => {
      provider.addSubtask('Workspace|p', 'Workspace|c');
      provider.removeSubtask('Workspace|p', 'Workspace|c');
      assert.strictEqual(provider._taskHierarchy.has('Workspace|p'), false);
    });

    test('getTaskHierarchy returns [] for unknown', () => {
      assert.deepStrictEqual(provider.getTaskHierarchy('x'), []);
    });

    test('subtaskStarted posts when child starts', async () => {
      provider.addSubtask('Workspace|p', 'Workspace|c');
      provider.handleTaskStarted(createStartEvent('c'));
      await new Promise(r => setTimeout(r, 10));
      const msg = view.webview._messages.find(m => m.type === 'subtaskStarted');
      assert.ok(msg);
      assert.strictEqual(msg.parentLabel, 'Workspace|p');
      assert.strictEqual(msg.childLabel, 'Workspace|c');
    });
  });

  // -----------------------------------------------------------------------
  //  Failed Tasks Persistence
  // -----------------------------------------------------------------------
  suite('Failed Tasks Persistence', () => {
    test('save and retrieve round-trip', async () => {
      await provider.saveFailedTask('Workspace|build', { exitCode: 1, reason: 'error' });
      const f = await provider.getPersistedFailedTasks();
      assert.strictEqual(f['Workspace|build'].exitCode, 1);
    });

    test('clearFailedTask removes entry', async () => {
      await provider.saveFailedTask('Workspace|build', { exitCode: 1 });
      await provider.clearFailedTask('Workspace|build');
      const f = await provider.getPersistedFailedTasks();
      assert.strictEqual(f['Workspace|build'], undefined);
    });
  });
});
