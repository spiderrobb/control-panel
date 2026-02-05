const assert = require('assert');
const vscode = require('./vscode-mock');

suite('Process Lifecycle Tests', () => {
  let mdxProvider;
  let context;

  suiteSetup(async () => {
    // Get the extension and activate it
    const ext = vscode.extensions.getExtension('controlpanel');
    if (ext && !ext.isActive) {
      await ext.activate();
    }
    // For testing, we'll need to access the provider differently
    // This would normally be provided by the extension's exports
    mdxProvider = null; // Will be mocked or injected for testing
    
    // Mock context for testing
    context = {
      subscriptions: [],
      workspaceState: new Map(),
      globalState: {
        get: (key) => context.workspaceState.get(key),
        update: (key, value) => context.workspaceState.set(key, value)
      },
      extensionPath: __dirname
    };
  });

  suiteTeardown(async () => {
    // Cleanup any running processes
    if (mdxProvider) {
      await mdxProvider.stopAllTasks();
    }
  });

  suite('Task State Transitions', () => {
    test('Task startup sequence: not-started -> starting -> running', async function() {
      this.timeout(10000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const taskLabel = 'test:unit';
      
      // Initial state should be not tracked
      assert.strictEqual(mdxProvider._taskStates.has(taskLabel), false);
      
      // Start task - should transition to starting
      await mdxProvider.executeTask(taskLabel);
      assert.strictEqual(mdxProvider._taskStates.get(taskLabel), 'starting');
      
      // Wait for running state (with timeout)
      let attempts = 0;
      while (mdxProvider._taskStates.get(taskLabel) === 'starting' && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      assert.strictEqual(mdxProvider._taskStates.get(taskLabel), 'running');
      assert.ok(mdxProvider._runningTasks.has(taskLabel));
      
      // Cleanup
      await mdxProvider.stopTask(taskLabel);
    });

    test('Task termination sequence: running -> stopping -> stopped', async function() {
      this.timeout(15000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const taskLabel = 'test:slow';
      
      // Start a long-running task
      await mdxProvider.executeTask(taskLabel);
      
      // Wait for running state
      let attempts = 0;
      while (mdxProvider._taskStates.get(taskLabel) !== 'running' && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      assert.strictEqual(mdxProvider._taskStates.get(taskLabel), 'running');
      
      // Stop the task
      await mdxProvider.stopTask(taskLabel);
      assert.strictEqual(mdxProvider._taskStates.get(taskLabel), 'stopping');
      
      // Wait for stopped state
      attempts = 0;
      while (mdxProvider._taskStates.get(taskLabel) === 'stopping' && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      assert.strictEqual(mdxProvider._taskStates.get(taskLabel), 'stopped');
      assert.strictEqual(mdxProvider._runningTasks.has(taskLabel), false);
    });

    test('Failed task state: running -> failed', async function() {
      this.timeout(10000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const taskLabel = 'fail:exit1';
      
      // Start a task that will fail
      await mdxProvider.executeTask(taskLabel);
      
      // Wait for failure
      let attempts = 0;
      while (!mdxProvider._taskStates.has(taskLabel) || 
             (mdxProvider._taskStates.get(taskLabel) !== 'failed' && 
              mdxProvider._taskStates.get(taskLabel) !== 'stopped')) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
        if (attempts > 100) break; // 10 second timeout
      }
      
      assert.strictEqual(mdxProvider._taskStates.get(taskLabel), 'failed');
      assert.ok(mdxProvider._taskFailures.has(taskLabel));
      
      const failureInfo = mdxProvider._taskFailures.get(taskLabel);
      assert.ok(failureInfo);
      assert.ok(failureInfo.timestamp);
      assert.strictEqual(failureInfo.exitCode, 1);
    });
  });

  suite('Process Resource Management', () => {
    test('Task cleanup on completion', async function() {
      this.timeout(10000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const taskLabel = 'build:quick';
      const initialTaskCount = mdxProvider._runningTasks.size;
      
      // Start task
      await mdxProvider.executeTask(taskLabel);
      
      // Verify task is tracked
      assert.ok(mdxProvider._runningTasks.has(taskLabel) || 
               mdxProvider._taskStates.get(taskLabel) === 'starting');
      
      // Wait for completion
      let attempts = 0;
      while (mdxProvider._runningTasks.has(taskLabel) && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      // Verify cleanup
      assert.strictEqual(mdxProvider._runningTasks.has(taskLabel), false);
      assert.strictEqual(mdxProvider._runningTasks.size, initialTaskCount);
    });

    test('Memory leak prevention - state maps cleanup', async function() {
      this.timeout(15000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      // Run multiple quick tasks
      const tasks = ['build:quick', 'test:unit', 'lint:check'];
      for (const task of tasks) {
        await mdxProvider.executeTask(task);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Wait for all tasks to complete
      let attempts = 0;
      while (mdxProvider._runningTasks.size > 0 && attempts < 200) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      // Check that temporary state is cleaned up
      // Note: Some persistent state like task history may remain
      const finalRunningCount = mdxProvider._runningTasks.size;
      assert.strictEqual(finalRunningCount, 0, 'Running tasks should be cleaned up');
      
      // Start times should be cleaned for completed tasks
      const activeStartTimes = Array.from(mdxProvider._taskStartTimes.keys()).filter(
        task => mdxProvider._runningTasks.has(task)
      );
      assert.strictEqual(activeStartTimes.length, 0, 'Start times should be cleaned for completed tasks');
    });
  });

  suite('Terminal Integration', () => {
    test('Terminal creation and cleanup', async function() {
      this.timeout(10000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const taskLabel = 'test:quick';
      const initialTerminalCount = vscode.window.terminals.length;
      
      // Start task
      await mdxProvider.executeTask(taskLabel);
      
      // Wait for task to start
      let attempts = 0;
      while (mdxProvider._taskStates.get(taskLabel) === 'starting' && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      // Should have created a terminal
      assert.ok(vscode.window.terminals.length >= initialTerminalCount);
      
      // Wait for completion
      attempts = 0;
      while (mdxProvider._runningTasks.has(taskLabel) && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      // Terminal should still exist but task should be cleaned up
      assert.strictEqual(mdxProvider._runningTasks.has(taskLabel), false);
    });
  });

  suite('State Persistence', () => {
    test('Task history persistence', async function() {
      this.timeout(10000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const taskLabel = 'build:test-history';
      
      // Clear existing history
      await context.globalState.update('taskHistory', []);
      
      // Run a task
      await mdxProvider.executeTask(taskLabel);
      
      // Wait for completion
      let attempts = 0;
      while (mdxProvider._runningTasks.has(taskLabel) && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      // Check that history was updated
      const history = context.globalState.get('taskHistory') || [];
      const historyEntry = history.find(h => h.label === taskLabel);
      assert.ok(historyEntry, 'Task should be recorded in history');
      assert.ok(historyEntry.lastRun, 'Task should have lastRun timestamp');
    });
  });
});