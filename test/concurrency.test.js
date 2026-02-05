const assert = require('assert');
const vscode = require('./vscode-mock');

suite('Concurrency and Race Condition Tests', () => {
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

  suite('Concurrent Task Execution', () => {
    test('Multiple simultaneous task starts', async function() {
      this.timeout(20000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const tasks = ['test:unit', 'test:integration', 'lint:check', 'build:quick'];
      
      // Start all tasks simultaneously
      const startPromises = tasks.map(task => mdxProvider.executeTask(task));
      await Promise.all(startPromises);
      
      // Verify all tasks are tracked
      let allStarted = false;
      let attempts = 0;
      while (!allStarted && attempts < 100) {
        allStarted = tasks.every(task => 
          mdxProvider._taskStates.has(task) && 
          (mdxProvider._taskStates.get(task) === 'running' || 
           mdxProvider._taskStates.get(task) === 'starting')
        );
        if (!allStarted) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
      }
      
      assert.ok(allStarted, 'All tasks should start successfully');
      
      // Wait for completion and cleanup
      attempts = 0;
      while (mdxProvider._runningTasks.size > 0 && attempts < 200) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
    });

    test('Rapid start/stop cycles on same task', async function() {
      this.timeout(15000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const taskLabel = 'test:rapid-cycle';
      const cycles = 5;
      
      for (let i = 0; i < cycles; i++) {
        // Start task
        await mdxProvider.executeTask(taskLabel);
        
        // Wait a bit for it to start
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Stop it immediately
        await mdxProvider.stopTask(taskLabel);
        
        // Wait for cleanup
        let attempts = 0;
        while (mdxProvider._runningTasks.has(taskLabel) && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        assert.strictEqual(mdxProvider._runningTasks.has(taskLabel), false, 
          `Cycle ${i}: Task should be stopped`);
      }
    });

    test('Concurrent task operations with shared resources', async function() {
      this.timeout(20000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const buildTasks = ['build:all', 'build:production', 'build:watch'];
      
      // Start build tasks concurrently (they might share build directories)
      const startPromises = buildTasks.map(task => mdxProvider.executeTask(task));
      await Promise.all(startPromises);
      
      // Let them run for a bit
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Stop all concurrently
      const stopPromises = buildTasks.map(task => mdxProvider.stopTask(task));
      await Promise.all(stopPromises);
      
      // Verify all stopped
      let attempts = 0;
      while (buildTasks.some(task => mdxProvider._runningTasks.has(task)) && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      buildTasks.forEach(task => {
        assert.strictEqual(mdxProvider._runningTasks.has(task), false, 
          `${task} should be stopped`);
      });
    });
  });

  suite('Race Condition Prevention', () => {
    test('Concurrent state modifications', async function() {
      this.timeout(15000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const taskLabel = 'test:state-race';
      const operations = 10;
      
      // Perform many concurrent operations on the same task
      const promises = [];
      
      for (let i = 0; i < operations; i++) {
        if (i % 2 === 0) {
          promises.push(mdxProvider.executeTask(taskLabel));
        } else {
          promises.push(mdxProvider.stopTask(taskLabel));
        }
      }
      
      // All operations should complete without throwing
      await Promise.allSettled(promises);
      
      // Final state should be consistent
      const isRunning = mdxProvider._runningTasks.has(taskLabel);
      const taskState = mdxProvider._taskStates.get(taskLabel);
      
      if (isRunning) {
        assert.ok(['starting', 'running'].includes(taskState));
      } else {
        assert.ok(!taskState || ['stopped', 'failed', 'stopping'].includes(taskState));
      }
    });

    test('Concurrent task hierarchy modifications', async function() {
      this.timeout(20000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const parentTasks = ['build:complex-parent-1', 'build:complex-parent-2'];
      
      // Start complex tasks with dependencies concurrently
      const startPromises = parentTasks.map(task => mdxProvider.executeTask(task));
      await Promise.all(startPromises);
      
      // Let them build hierarchy
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Stop them concurrently while hierarchy is being modified
      const stopPromises = parentTasks.map(task => mdxProvider.stopTask(task));
      await Promise.all(stopPromises);
      
      // Wait for cleanup
      let attempts = 0;
      while (parentTasks.some(task => mdxProvider._runningTasks.has(task)) && attempts < 200) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      // Hierarchy should be cleaned up
      parentTasks.forEach(task => {
        assert.strictEqual(mdxProvider._runningTasks.has(task), false);
      });
    });

    test('Webview reconnection during task execution', async function() {
      this.timeout(15000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const taskLabel = 'test:webview-reconnect';
      
      // Start a task
      await mdxProvider.executeTask(taskLabel);
      
      // Wait for it to be running
      let attempts = 0;
      while (mdxProvider._taskStates.get(taskLabel) !== 'running' && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      // Simulate webview reconnection by calling refresh methods if they exist
      if (typeof mdxProvider.refreshWebview === 'function') {
        await mdxProvider.refreshWebview();
      }
      if (typeof mdxProvider._updateWebview === 'function') {
        await mdxProvider._updateWebview();
      }
      
      // Task should still be running after webview operations
      assert.strictEqual(mdxProvider._taskStates.get(taskLabel), 'running');
      assert.ok(mdxProvider._runningTasks.has(taskLabel));
      
      // Cleanup
      await mdxProvider.stopTask(taskLabel);
    });
  });

  suite('Load Testing', () => {
    test('High-frequency task operations', async function() {
      this.timeout(30000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const operations = 50;
      const tasks = ['test:unit', 'lint:check', 'build:quick'];
      const startTime = Date.now();
      
      // Perform many rapid operations
      for (let i = 0; i < operations; i++) {
        const task = tasks[i % tasks.length];
        await mdxProvider.executeTask(task);
        
        // Some operations stop immediately, some let run
        if (i % 3 === 0) {
          await mdxProvider.stopTask(task);
        }
        
        // Small delay to prevent overwhelming
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      const duration = Date.now() - startTime;
      console.log(`Completed ${operations} operations in ${duration}ms`);
      
      // Stop all remaining tasks
      await mdxProvider.stopAllTasks();
      
      // System should be responsive
      assert.ok(duration < 25000, 'Operations should complete in reasonable time');
      assert.strictEqual(mdxProvider._runningTasks.size, 0);
    });

    test('Memory stability under load', async function() {
      this.timeout(25000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const initialMemory = process.memoryUsage();
      const iterations = 20;
      
      for (let i = 0; i < iterations; i++) {
        // Start multiple tasks
        const tasks = ['test:memory-1', 'test:memory-2', 'build:memory'];
        await Promise.all(tasks.map(task => mdxProvider.executeTask(task)));
        
        // Let them run briefly
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Stop all
        await Promise.all(tasks.map(task => mdxProvider.stopTask(task)));
        
        // Wait for cleanup
        let attempts = 0;
        while (mdxProvider._runningTasks.size > 0 && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      console.log(`Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
      
      // Memory increase should be reasonable (less than 50MB for this test)
      assert.ok(memoryIncrease < 50 * 1024 * 1024, 'Memory usage should be stable');
    });

    test('Task state consistency under concurrent load', async function() {
      this.timeout(20000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const taskLabel = 'test:consistency';
      const concurrent = 10;
      
      // Start many concurrent operations on the same task
      const promises = Array(concurrent).fill().map(async (_, i) => {
        // Stagger operations slightly
        await new Promise(resolve => setTimeout(resolve, i * 10));
        
        try {
          await mdxProvider.executeTask(taskLabel);
          await new Promise(resolve => setTimeout(resolve, 100));
          await mdxProvider.stopTask(taskLabel);
        } catch (error) {
          // Some operations may fail due to race conditions, that's ok
          console.log(`Operation ${i} failed: ${error.message}`);
        }
      });
      
      await Promise.allSettled(promises);
      
      // Final state should be consistent
      let attempts = 0;
      while (mdxProvider._runningTasks.has(taskLabel) && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      const isRunning = mdxProvider._runningTasks.has(taskLabel);
      const taskState = mdxProvider._taskStates.get(taskLabel);
      
      // State should be consistent
      if (isRunning) {
        assert.ok(['starting', 'running'].includes(taskState));
      } else {
        assert.ok(!taskState || ['stopped', 'failed', 'stopping'].includes(taskState));
      }
      
      // No state leaks
      if (!isRunning) {
        assert.strictEqual(mdxProvider._stoppingTasks?.has(taskLabel), false);
      }
    });
  });
});