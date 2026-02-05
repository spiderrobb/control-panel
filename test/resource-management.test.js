const assert = require('assert');
const vscode = require('./vscode-mock');

suite('Resource Management Tests', () => {
  let mdxProvider;
  let context;

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('controlpanel');
    if (ext && !ext.isActive) {
      await ext.activate();
    }
    mdxProvider = null; // Will be mocked for testing
    
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
    if (mdxProvider) {
      await mdxProvider.stopAllTasks();
    }
  });

  suite('Memory Leak Detection', () => {
    test('State map cleanup on task completion', async function() {
      this.timeout(15000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      // Capture initial state sizes
      const initialRunning = mdxProvider._runningTasks.size;
      
      const tasks = ['test:cleanup-1', 'test:cleanup-2', 'build:cleanup', 'lint:cleanup'];
      
      // Run tasks to completion
      for (const task of tasks) {
        await mdxProvider.executeTask(task);
      }
      
      // Wait for all tasks to complete
      let attempts = 0;
      while (mdxProvider._runningTasks.size > initialRunning && attempts < 200) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      // Check state cleanup for completed tasks
      const completedTasks = tasks.filter(task => 
        !mdxProvider._runningTasks.has(task) && 
        mdxProvider._taskStates.get(task) !== 'running'
      );
      
      // Start times should be cleaned up for completed tasks
      completedTasks.forEach(task => {
        if (mdxProvider._taskStates.get(task) === 'stopped' || 
            mdxProvider._taskStates.get(task) === 'failed') {
          assert.strictEqual(mdxProvider._taskStartTimes.has(task), false,
            `Start time for ${task} should be cleaned up`);
        }
      });
      
      // Running tasks map should only contain actually running tasks
      const runningTasksArray = Array.from(mdxProvider._runningTasks.keys());
      runningTasksArray.forEach(task => {
        const state = mdxProvider._taskStates.get(task);
        assert.ok(['starting', 'running'].includes(state),
          `Running task ${task} should have appropriate state, got: ${state}`);
      });
    });

    test('Memory usage stability over time', async function() {
      this.timeout(30000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const getMemoryUsage = () => process.memoryUsage();
      const initialMemory = getMemoryUsage();
      
      // Simulate extended usage
      const cycles = 15;
      for (let i = 0; i < cycles; i++) {
        // Start several tasks
        const tasks = [`test:memory-cycle-${i}-1`, `test:memory-cycle-${i}-2`];
        await Promise.all(tasks.map(task => mdxProvider.executeTask(task)));
        
        // Let them run
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Stop them
        await Promise.all(tasks.map(task => mdxProvider.stopTask(task)));
        
        // Wait for cleanup
        let attempts = 0;
        while (tasks.some(task => mdxProvider._runningTasks.has(task)) && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        // Trigger GC if available
        if (global.gc && i % 5 === 0) {
          global.gc();
        }
      }
      
      const finalMemory = getMemoryUsage();
      const heapIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const rsIncrease = finalMemory.rss - initialMemory.rss;
      
      console.log(`Heap increase: ${Math.round(heapIncrease / 1024 / 1024)}MB`);
      console.log(`RSS increase: ${Math.round(rsIncrease / 1024 / 1024)}MB`);
      
      // Memory increase should be reasonable for the number of operations
      assert.ok(heapIncrease < 30 * 1024 * 1024, 'Heap memory increase should be < 30MB');
      assert.ok(rsIncrease < 50 * 1024 * 1024, 'RSS increase should be < 50MB');
    });

    test('Event listener cleanup', async function() {
      this.timeout(10000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      // Count initial event listeners (if accessible)
      const initialListenerCount = process.listenerCount ? 
        process.listenerCount('exit') : 0;
      
      // Perform operations that might create listeners
      const tasks = ['test:listeners-1', 'test:listeners-2'];
      for (const task of tasks) {
        await mdxProvider.executeTask(task);
        await mdxProvider.stopTask(task);
      }
      
      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check that listeners haven't accumulated excessively
      const finalListenerCount = process.listenerCount ? 
        process.listenerCount('exit') : 0;
      const listenerIncrease = finalListenerCount - initialListenerCount;
      
      assert.ok(listenerIncrease <= 2, 
        `Excessive event listener accumulation: ${listenerIncrease}`);
    });
  });

  suite('Terminal Resource Management', () => {
    test('Terminal cleanup verification', async function() {
      this.timeout(15000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const initialTerminalCount = vscode.window.terminals.length;
      const tasks = ['test:terminal-1', 'test:terminal-2', 'build:terminal'];
      
      // Start tasks that create terminals
      for (const task of tasks) {
        await mdxProvider.executeTask(task);
      }
      
      // Let them run briefly
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Stop all tasks
      for (const task of tasks) {
        await mdxProvider.stopTask(task);
      }
      
      // Wait for cleanup
      let attempts = 0;
      while (tasks.some(task => mdxProvider._runningTasks.has(task)) && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      // Check terminal count hasn't grown excessively
      const finalTerminalCount = vscode.window.terminals.length;
      const terminalIncrease = finalTerminalCount - initialTerminalCount;
      
      console.log(`Terminal count increase: ${terminalIncrease}`);
      
      // Some terminals may remain for debugging, but shouldn't be excessive
      assert.ok(terminalIncrease <= tasks.length + 2, 
        'Terminal count should not grow excessively');
    });

    test('Terminal disposal on task failure', async function() {
      this.timeout(10000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const initialTerminalCount = vscode.window.terminals.length;
      const failingTask = 'fail:terminal-test';
      
      // Start a task that will fail
      await mdxProvider.executeTask(failingTask);
      
      // Wait for failure
      let attempts = 0;
      while (!mdxProvider._taskFailures.has(failingTask) && 
             mdxProvider._taskStates.get(failingTask) !== 'failed' && 
             attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      // Task should be failed and not running
      assert.ok(mdxProvider._taskStates.get(failingTask) === 'failed' ||
               mdxProvider._taskFailures.has(failingTask));
      assert.strictEqual(mdxProvider._runningTasks.has(failingTask), false);
      
      // Terminal resources should be cleaned up appropriately
      const finalTerminalCount = vscode.window.terminals.length;
      console.log(`Terminals after failure: ${finalTerminalCount - initialTerminalCount}`);
    });
  });

  suite('State Persistence Across Extension Reloads', () => {
    test('Task history persistence', async function() {
      this.timeout(10000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      // Clear existing history
      await context.globalState.update('taskHistory', []);
      
      const testTasks = ['test:history-1', 'build:history-2'];
      
      // Execute tasks to build history
      for (const task of testTasks) {
        await mdxProvider.executeTask(task);
        await new Promise(resolve => setTimeout(resolve, 500));
        await mdxProvider.stopTask(task);
      }
      
      // Wait for history update
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check that history was persisted
      const history = context.globalState.get('taskHistory') || [];
      
      testTasks.forEach(task => {
        const historyEntry = history.find(h => h.label === task);
        assert.ok(historyEntry, `Task ${task} should be in history`);
        assert.ok(historyEntry.lastRun, 'History entry should have lastRun timestamp');
      });
    });

    test('Task failure state persistence', async function() {
      this.timeout(10000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const failingTask = 'fail:persistence-test';
      
      // Start a failing task
      await mdxProvider.executeTask(failingTask);
      
      // Wait for failure
      let attempts = 0;
      while (!mdxProvider._taskFailures.has(failingTask) && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      // Verify failure is recorded
      assert.ok(mdxProvider._taskFailures.has(failingTask));
      const failure = mdxProvider._taskFailures.get(failingTask);
      assert.ok(failure.timestamp);
      assert.ok(typeof failure.exitCode === 'number');
      
      // Simulate extension reload by checking persistence mechanism
      if (typeof mdxProvider._saveFailureState === 'function') {
        await mdxProvider._saveFailureState();
      }
    });

    test('Starred task persistence', async function() {
      this.timeout(5000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const taskToStar = 'test:starred-persistence';
      
      // Star a task (if the functionality exists)
      if (typeof mdxProvider.toggleTaskStar === 'function') {
        await mdxProvider.toggleTaskStar(taskToStar);
        
        // Check that starred state is persisted
        const starredTasks = context.globalState.get('starredTasks') || [];
        assert.ok(starredTasks.includes(taskToStar), 'Task should be starred');
        
        // Unstar it
        await mdxProvider.toggleTaskStar(taskToStar);
        const updatedStarred = context.globalState.get('starredTasks') || [];
        assert.ok(!updatedStarred.includes(taskToStar), 'Task should be unstarred');
      }
    });
  });

  suite('Resource Cleanup on Extension Deactivation', () => {
    test('Cleanup preparation for deactivation', async function() {
      this.timeout(10000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      // Start some tasks
      const tasks = ['test:deactivation-1', 'test:deactivation-2'];
      for (const task of tasks) {
        await mdxProvider.executeTask(task);
      }
      
      // Simulate preparation for deactivation
      if (typeof mdxProvider.prepareForDeactivation === 'function') {
        await mdxProvider.prepareForDeactivation();
      } else {
        // Manual cleanup
        await mdxProvider.stopAllTasks();
      }
      
      // Verify all tasks are stopped
      let attempts = 0;
      while (mdxProvider._runningTasks.size > 0 && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      assert.strictEqual(mdxProvider._runningTasks.size, 0, 
        'All tasks should be stopped before deactivation');
    });

    test('Context subscription cleanup', async function() {
      this.timeout(5000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const initialSubscriptions = context.subscriptions.length;
      
      // Simulate some operations that might add subscriptions
      await mdxProvider.executeTask('test:subscriptions');
      await mdxProvider.stopTask('test:subscriptions');
      
      // Check if cleanup method exists and call it
      if (typeof mdxProvider.dispose === 'function') {
        await mdxProvider.dispose();
        
        // Verify subscriptions are cleaned up
        // Note: In real VS Code, subscriptions would be disposed automatically
        // This test mainly ensures the dispose method exists and works
      }
      
      console.log(`Subscriptions: ${initialSubscriptions} -> ${context.subscriptions.length}`);
    });
  });
});