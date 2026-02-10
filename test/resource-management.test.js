/**
 * Resource Management Tests
 *
 * Tests cleanup of internal state maps, size limits on persisted data,
 * subscription disposal, and Logger resource management.
 */

const assert = require('assert');
const sinon = require('sinon');
const {
  createProvider,
  createLogger,
  createMockContext,
  createStartEvent,
  createEndEvent,
  vscode,
} = require('./helpers/provider-factory');

suite('Resource Management Tests', () => {
  let provider, logger;
  let sandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    ({ provider, logger } = createProvider());
  });

  teardown(() => {
    sandbox.restore();
    vscode.tasks._clearTasks();
  });

  // -----------------------------------------------------------------------
  //  State Map Cleanup
  // -----------------------------------------------------------------------
  suite('State Map Cleanup on Task Completion', () => {
    test('runningTasks is cleared after task ends', async () => {
      await provider.handleTaskStarted(createStartEvent('build'));
      assert.ok(provider._runningTasks.has('Workspace|build'));
      provider.handleTaskEnded(createEndEvent('build', 0));
      assert.strictEqual(provider._runningTasks.has('Workspace|build'), false);
    });

    test('taskStartTimes is cleared after task ends', async () => {
      await provider.handleTaskStarted(createStartEvent('build'));
      assert.ok(provider._taskStartTimes.has('Workspace|build'));
      provider.handleTaskEnded(createEndEvent('build', 0));
      assert.strictEqual(provider._taskStartTimes.has('Workspace|build'), false);
    });

    test('taskHierarchy is cleared after parent task ends', async () => {
      await provider.handleTaskStarted(createStartEvent('parent'));
      provider.addSubtask('Workspace|parent', 'Workspace|child');
      provider.handleTaskEnded(createEndEvent('parent', 0));
      assert.strictEqual(provider._taskHierarchy.has('Workspace|parent'), false);
    });

    test('multiple task start/end cycles leave no orphan state', async () => {
      for (let i = 0; i < 10; i++) {
        const label = `task-${i}`;
        await provider.handleTaskStarted(createStartEvent(label));
        provider.handleTaskEnded(createEndEvent(label, 0));
      }
      assert.strictEqual(provider._runningTasks.size, 0);
      assert.strictEqual(provider._taskStartTimes.size, 0);
    });

    test('_taskStates entries are cleaned up after completion', async () => {
      await provider.handleTaskStarted(createStartEvent('build'));
      assert.strictEqual(provider._taskStates.get('Workspace|build'), 'running');
      provider.handleTaskEnded(createEndEvent('build', 0));
      assert.strictEqual(provider._taskStates.has('Workspace|build'), false);
    });

    test('_stoppingTasks is empty when no tasks are being stopped', () => {
      assert.strictEqual(provider._stoppingTasks.size, 0);
    });

    test('_stoppingTasks is cleaned after stopTask completes', async () => {
      const task = new vscode.MockTask('build');
      const execution = new vscode.MockTaskExecution(task);
      provider._runningTasks.set('Workspace|build', execution);
      provider._taskStates.set('Workspace|build', 'running');

      await provider.stopTask('Workspace|build');
      assert.strictEqual(provider._stoppingTasks.size, 0);
    });
  });

  // -----------------------------------------------------------------------
  //  Size Limits on Persisted Data
  // -----------------------------------------------------------------------
  suite('Persisted Data Size Limits', () => {
    test('recentlyUsedTasks capped at 5', async () => {
      for (let i = 0; i < 10; i++) {
        await provider.addRecentlyUsedTask(`t-${i}`);
      }
      const recent = await provider.getRecentlyUsedTasks();
      assert.strictEqual(recent.length, 5);
    });

    test('starredTasks capped at 20', async () => {
      for (let i = 0; i < 25; i++) {
        await provider.toggleStarTask(`t-${i}`);
      }
      const starred = await provider.getStarredTasks();
      assert.strictEqual(starred.length, 20);
    });

    test('executionHistory capped at 20', async () => {
      for (let i = 0; i < 30; i++) {
        await provider.addExecutionRecord({ id: `${i}`, taskLabel: `t-${i}` });
      }
      const h = await provider.getExecutionHistory();
      assert.strictEqual(h.length, 20);
    });

    test('taskHistory durations capped at 10 per task', async () => {
      for (let i = 0; i < 15; i++) {
        await provider.updateTaskHistory('Workspace|build', i * 100);
      }
      const h = await provider.getTaskHistory('Workspace|build');
      assert.strictEqual(h.durations.length, 10);
    });
  });

  // -----------------------------------------------------------------------
  //  Subscription / Disposable Tracking
  // -----------------------------------------------------------------------
  suite('Subscription Management', () => {
    test('constructor pushes task event subscriptions to context.subscriptions', () => {
      const ctx = createMockContext();
      const lg = createLogger();
      const _p = require('../src/providers/MdxWebviewProvider');
      void new _p(ctx, lg);
      // Two subscriptions: onDidStartTaskProcess + onDidEndTaskProcess
      assert.ok(ctx.subscriptions.length >= 2);
      // Each should have a dispose method
      ctx.subscriptions.forEach(sub => {
        assert.strictEqual(typeof sub.dispose, 'function');
      });
    });
  });

  // -----------------------------------------------------------------------
  //  Logger Resource Management
  // -----------------------------------------------------------------------
  suite('Logger Resources', () => {
    test('Logger ring buffer caps at configured size', () => {
      const lg = createLogger('Test', 5);
      for (let i = 0; i < 10; i++) {
        lg.info(`msg-${i}`);
      }
      assert.strictEqual(lg.getBuffer().length, 5);
      lg.dispose();
    });

    test('Logger.dispose() disposes the output channel', () => {
      const lg = createLogger();
      lg.dispose();
      assert.strictEqual(lg._channel._disposed, true);
    });

    test('getBuffer returns a copy, not a reference', () => {
      logger.info('one');
      const buf1 = logger.getBuffer();
      buf1.push({ fake: true });
      assert.strictEqual(logger.getBuffer().length, 1);
    });
  });

  // -----------------------------------------------------------------------
  //  Terminal Resource Tracking
  // -----------------------------------------------------------------------
  suite('Terminal Management', () => {
    test('focusTaskTerminal finds terminal by name', async () => {
      // Add a terminal that matches the task name
      const terminal = new vscode.MockTerminal('Task - build');
      vscode.window.terminals.push(terminal);

      const showSpy = sandbox.spy(terminal, 'show');
      await provider.focusTaskTerminal('build');

      assert.ok(showSpy.calledOnce);
      vscode.window._clearTerminals();
    });

    test('focusTaskTerminal shows warning when terminal not found', async () => {
      vscode.window._clearTerminals();
      const spy = sandbox.spy(vscode.window, 'showWarningMessage');
      await provider.focusTaskTerminal('nonexistent');
      assert.ok(spy.calledOnce);
    });

    test('stopTask disposes matching terminal in fallback methods', async () => {
      const taskObj = new vscode.MockTask('build');
      const execution = new vscode.MockTaskExecution(taskObj);
      // Make terminate throw so it falls through to Method 2
      execution.terminate = () => { throw new Error('cannot terminate'); };

      provider._runningTasks.set('Workspace|build', execution);
      provider._taskStates.set('Workspace|build', 'running');

      // Add a matching terminal
      const terminal = new vscode.MockTerminal('Task - build');
      vscode.window.terminals.push(terminal);

      await provider.stopTask('Workspace|build');

      assert.strictEqual(terminal._disposed, true);
      vscode.window._clearTerminals();
    });
  });
});
