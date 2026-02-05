const assert = require('assert');
const vscode = require('./vscode-mock');

suite('Integration Stress Tests', () => {
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

  suite('High-Volume Task Execution', () => {
    test('Large task list processing', async function() {
      this.timeout(60000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      // Define a comprehensive set of tasks from the test workspace
      const allTasks = [
        // Build tasks
        'build:all', 'build:production', 'build:watch', 'build:clean',
        // Test tasks
        'test:unit', 'test:integration', 'test:coverage', 'test:smoke',
        // Lint tasks
        'lint:check', 'lint:fix',
        // TypeScript tasks
        'typescript:check',
        // Docker tasks
        'docker:build', 'docker:up', 'docker:down',
        // Deploy tasks
        'deploy:staging', 'deploy:production',
        // Database tasks
        'db:migrate', 'db:seed', 'db:reset'
      ];

      const startTime = Date.now();
      const results = [];
      
      // Process tasks in batches to avoid overwhelming the system
      const batchSize = 3;
      for (let i = 0; i < allTasks.length; i += batchSize) {
        const batch = allTasks.slice(i, i + batchSize);
        
        // Start batch
        const batchStartTime = Date.now();
        await Promise.all(batch.map(task => mdxProvider.executeTask(task)));
        
        // Let them run briefly
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Stop batch
        await Promise.all(batch.map(task => mdxProvider.stopTask(task)));
        
        // Wait for batch cleanup
        let attempts = 0;
        while (batch.some(task => mdxProvider._runningTasks.has(task)) && attempts < 100) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        const batchDuration = Date.now() - batchStartTime;
        results.push({
          batch: i / batchSize + 1,
          tasks: batch,
          duration: batchDuration
        });
        
        console.log(`Batch ${i / batchSize + 1}: ${batchDuration}ms for ${batch.length} tasks`);
      }
      
      const totalDuration = Date.now() - startTime;
      console.log(`Total: ${totalDuration}ms for ${allTasks.length} tasks`);
      
      // Verify system stability
      assert.strictEqual(mdxProvider._runningTasks.size, 0, 'No tasks should be running');
      assert.ok(totalDuration < 50000, 'Processing should complete in reasonable time');
      
      // Check for performance degradation across batches
      const avgDurations = results.map(r => r.duration);
      const firstHalfAvg = avgDurations.slice(0, Math.floor(avgDurations.length / 2))
        .reduce((a, b) => a + b, 0) / Math.floor(avgDurations.length / 2);
      const secondHalfAvg = avgDurations.slice(Math.floor(avgDurations.length / 2))
        .reduce((a, b) => a + b, 0) / Math.ceil(avgDurations.length / 2);
      
      const degradationRatio = secondHalfAvg / firstHalfAvg;
      console.log(`Performance degradation ratio: ${degradationRatio.toFixed(2)}`);
      assert.ok(degradationRatio < 2.0, 'Performance should not degrade significantly');
    });

    test('Long-running process management', async function() {
      this.timeout(30000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const longRunningTasks = [
        'build:watch',  // Typically runs continuously
        'test:watch',   // Continuous test runner if exists
        'docker:up'     // Long-running service
      ];

      const startTime = Date.now();
      
      // Start long-running tasks
      for (const task of longRunningTasks) {
        try {
          await mdxProvider.executeTask(task);
        } catch (error) {
          console.log(`Task ${task} not available: ${error.message}`);
        }
      }
      
      // Let them run for extended period
      console.log('Running long-term processes...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Verify they're still running (for tasks that started successfully)
      const runningTasks = Array.from(mdxProvider._runningTasks.keys());
      const stillRunning = longRunningTasks.filter(task => runningTasks.includes(task));
      
      console.log(`Still running: ${stillRunning.join(', ')}`);
      
      // Stop all long-running tasks
      for (const task of longRunningTasks) {
        try {
          await mdxProvider.stopTask(task);
        } catch (error) {
          console.log(`Error stopping ${task}: ${error.message}`);
        }
      }
      
      // Wait for cleanup
      let attempts = 0;
      while (longRunningTasks.some(task => mdxProvider._runningTasks.has(task)) && attempts < 200) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      const totalDuration = Date.now() - startTime;
      console.log(`Long-running test completed in ${totalDuration}ms`);
      
      // All should be stopped
      longRunningTasks.forEach(task => {
        assert.strictEqual(mdxProvider._runningTasks.has(task), false,
          `${task} should be stopped`);
      });
    });
  });

  suite('Complex Dependency Scenarios', () => {
    test('Deep nested dependency chains', async function() {
      this.timeout(25000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      // Test with nested failure scenarios from test workspace
      const complexTasks = [
        'fail:nested-parent',     // Should trigger child failures
        'fail:sequential-pipeline', // Chain of dependent tasks
        'build:production'        // Complex build with dependencies
      ];

      for (const task of complexTasks) {
        const startTime = Date.now();
        
        try {
          await mdxProvider.executeTask(task);
          
          // Wait for task to complete or fail
          let attempts = 0;
          while (mdxProvider._runningTasks.has(task) && 
                 !mdxProvider._taskFailures.has(task) && 
                 attempts < 200) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
          }
          
          const duration = Date.now() - startTime;
          console.log(`${task}: ${duration}ms`);
          
          // Verify final state is consistent
          const isRunning = mdxProvider._runningTasks.has(task);
          const isFailed = mdxProvider._taskFailures.has(task);
          const state = mdxProvider._taskStates.get(task);
          
          if (isRunning) {
            assert.ok(['starting', 'running'].includes(state));
          } else {
            assert.ok(['stopped', 'failed'].includes(state) || isFailed);
          }
          
        } catch (error) {
          console.log(`Task ${task} handling error: ${error.message}`);
        }
        
        // Cleanup
        await mdxProvider.stopTask(task);
      }
    });

    test('Parallel dependency resolution', async function() {
      this.timeout(20000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const parallelTasks = [
        'fail:parallel-checks',  // Multiple parallel tasks that may fail
        'test:unit',             // Independent parallel task
        'lint:check'             // Another independent task
      ];

      // Start all in parallel
      const startTime = Date.now();
      await Promise.all(parallelTasks.map(task => mdxProvider.executeTask(task)));
      
      // Monitor execution
      const checkInterval = setInterval(() => {
        const running = parallelTasks.filter(task => mdxProvider._runningTasks.has(task));
        const failed = parallelTasks.filter(task => mdxProvider._taskFailures.has(task));
        console.log(`Running: ${running.length}, Failed: ${failed.length}`);
      }, 1000);
      
      // Wait for completion/failure
      let attempts = 0;
      while (parallelTasks.some(task => mdxProvider._runningTasks.has(task)) && attempts < 150) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      clearInterval(checkInterval);
      
      const duration = Date.now() - startTime;
      console.log(`Parallel execution completed in ${duration}ms`);
      
      // Verify all tasks completed (success or failure)
      parallelTasks.forEach(task => {
        assert.strictEqual(mdxProvider._runningTasks.has(task), false,
          `${task} should not be running`);
      });
    });
  });

  suite('System Stability Under Stress', () => {
    test('Rapid task churning', async function() {
      this.timeout(45000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const churningTasks = ['test:churn-1', 'test:churn-2', 'build:churn'];
      const iterations = 25;
      const startTime = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        // Random task selection
        const task = churningTasks[Math.floor(Math.random() * churningTasks.length)];
        
        // Start task
        await mdxProvider.executeTask(task);
        
        // Random short delay
        await new Promise(resolve => setTimeout(resolve, Math.random() * 200));
        
        // Stop task
        await mdxProvider.stopTask(task);
        
        // Brief cleanup wait
        let attempts = 0;
        while (mdxProvider._runningTasks.has(task) && attempts < 20) {
          await new Promise(resolve => setTimeout(resolve, 50));
          attempts++;
        }
        
        // Progress indicator
        if (i % 5 === 0) {
          console.log(`Churn iteration ${i}/${iterations}`);
        }
      }
      
      const duration = Date.now() - startTime;
      console.log(`Churning completed: ${iterations} iterations in ${duration}ms`);
      
      // System should be stable
      assert.strictEqual(mdxProvider._runningTasks.size, 0);
      assert.ok(duration < 40000, 'Churning should complete in reasonable time');
    });

    test('Memory stress with task variations', async function() {
      this.timeout(35000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const memoryStressTasks = [
        'build:all', 'test:coverage', 'lint:check', 'typescript:check',
        'docker:build', 'test:integration'
      ];

      const initialMemory = process.memoryUsage();
      const memorySnapshots = [];
      
      // Stress test with varying task patterns
      for (let cycle = 0; cycle < 8; cycle++) {
        console.log(`Memory stress cycle ${cycle + 1}/8`);
        
        // Pattern 1: Sequential execution
        for (const task of memoryStressTasks.slice(0, 3)) {
          await mdxProvider.executeTask(task);
          await new Promise(resolve => setTimeout(resolve, 300));
          await mdxProvider.stopTask(task);
        }
        
        // Pattern 2: Parallel burst
        const parallelBatch = memoryStressTasks.slice(3, 6);
        await Promise.all(parallelBatch.map(task => mdxProvider.executeTask(task)));
        await new Promise(resolve => setTimeout(resolve, 500));
        await Promise.all(parallelBatch.map(task => mdxProvider.stopTask(task)));
        
        // Wait for cleanup
        let attempts = 0;
        while (mdxProvider._runningTasks.size > 0 && attempts < 100) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        // Memory snapshot
        const currentMemory = process.memoryUsage();
        memorySnapshots.push({
          cycle: cycle + 1,
          heapUsed: currentMemory.heapUsed,
          rss: currentMemory.rss
        });
        
        // Force GC if available
        if (global.gc && cycle % 2 === 1) {
          global.gc();
        }
      }
      
      // Analyze memory trends
      const finalMemory = process.memoryUsage();
      const totalHeapIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      console.log('Memory progression:');
      memorySnapshots.forEach(snapshot => {
        const heapMB = Math.round(snapshot.heapUsed / 1024 / 1024);
        const rssMB = Math.round(snapshot.rss / 1024 / 1024);
        console.log(`  Cycle ${snapshot.cycle}: Heap ${heapMB}MB, RSS ${rssMB}MB`);
      });
      
      console.log(`Total heap increase: ${Math.round(totalHeapIncrease / 1024 / 1024)}MB`);
      
      // Memory should remain stable
      assert.ok(totalHeapIncrease < 75 * 1024 * 1024, 'Heap increase should be < 75MB');
      
      // Check for memory leak patterns
      const heapProgression = memorySnapshots.map(s => s.heapUsed);
      const midPoint = Math.floor(heapProgression.length / 2);
      const firstHalfAvg = heapProgression.slice(0, midPoint).reduce((a, b) => a + b) / midPoint;
      const secondHalfAvg = heapProgression.slice(midPoint).reduce((a, b) => a + b) / (heapProgression.length - midPoint);
      
      const memoryGrowthRatio = secondHalfAvg / firstHalfAvg;
      console.log(`Memory growth ratio: ${memoryGrowthRatio.toFixed(2)}`);
      assert.ok(memoryGrowthRatio < 1.5, 'Memory growth should be limited');
    });

    test('Extension stability simulation', async function() {
      this.timeout(40000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const stabilityTasks = [
        'test:unit', 'build:quick', 'lint:check',
        'fail:exit1', 'test:integration', 'build:production'
      ];

      // Simulate extended extension usage
      const phases = [
        { name: 'startup', duration: 2000 },
        { name: 'light-usage', duration: 3000 },
        { name: 'heavy-usage', duration: 5000 },
        { name: 'mixed-usage', duration: 4000 }
      ];

      for (const phase of phases) {
        console.log(`Phase: ${phase.name} (${phase.duration}ms)`);
        const phaseStart = Date.now();
        
        while (Date.now() - phaseStart < phase.duration) {
          // Different activity patterns per phase
          if (phase.name === 'startup') {
            // Light activity
            const task = stabilityTasks[0];
            await mdxProvider.executeTask(task);
            await new Promise(resolve => setTimeout(resolve, 400));
            await mdxProvider.stopTask(task);
          } else if (phase.name === 'heavy-usage') {
            // Multiple concurrent tasks
            const tasks = stabilityTasks.slice(0, 3);
            await Promise.all(tasks.map(task => mdxProvider.executeTask(task)));
            await new Promise(resolve => setTimeout(resolve, 800));
            await Promise.all(tasks.map(task => mdxProvider.stopTask(task)));
          } else {
            // Mixed pattern
            const task = stabilityTasks[Math.floor(Math.random() * stabilityTasks.length)];
            await mdxProvider.executeTask(task);
            await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
            await mdxProvider.stopTask(task);
          }
          
          // Cleanup wait
          let attempts = 0;
          while (mdxProvider._runningTasks.size > 0 && attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 50));
            attempts++;
          }
        }
      }
      
      // Final stability check
      assert.strictEqual(mdxProvider._runningTasks.size, 0, 'No tasks should be running');
      
      // Check provider is still responsive
      await mdxProvider.executeTask('test:stability-check');
      await mdxProvider.stopTask('test:stability-check');
      
      console.log('Extension stability simulation completed successfully');
    });
  });
});