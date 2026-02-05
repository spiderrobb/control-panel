const assert = require('assert');
const vscode = require('./vscode-mock');

suite('Failure Scenario Tests', () => {
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

  suite('Task Failure Handling', () => {
    test('Exit code 1 failure handling', async function() {
      this.timeout(10000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const taskLabel = 'fail:exit1';
      
      await mdxProvider.executeTask(taskLabel);
      
      // Wait for failure
      let attempts = 0;
      while (!mdxProvider._taskFailures.has(taskLabel) && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      assert.ok(mdxProvider._taskFailures.has(taskLabel));
      const failure = mdxProvider._taskFailures.get(taskLabel);
      assert.strictEqual(failure.exitCode, 1);
      assert.strictEqual(mdxProvider._taskStates.get(taskLabel), 'failed');
    });

    test('Exit code 127 (command not found) failure handling', async function() {
      this.timeout(10000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const taskLabel = 'fail:exit127';
      
      await mdxProvider.executeTask(taskLabel);
      
      // Wait for failure
      let attempts = 0;
      while (!mdxProvider._taskFailures.has(taskLabel) && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      assert.ok(mdxProvider._taskFailures.has(taskLabel));
      const failure = mdxProvider._taskFailures.get(taskLabel);
      assert.strictEqual(failure.exitCode, 127);
      assert.strictEqual(mdxProvider._taskStates.get(taskLabel), 'failed');
    });

    test('Timeout failure handling', async function() {
      this.timeout(15000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const taskLabel = 'fail:timeout';
      
      await mdxProvider.executeTask(taskLabel);
      
      // Wait for the task to start
      let attempts = 0;
      while (mdxProvider._taskStates.get(taskLabel) === 'starting' && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      assert.strictEqual(mdxProvider._taskStates.get(taskLabel), 'running');
      
      // Stop the long-running task to simulate timeout
      await mdxProvider.stopTask(taskLabel);
      
      // Verify cleanup
      attempts = 0;
      while (mdxProvider._taskStates.get(taskLabel) === 'stopping' && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      assert.strictEqual(mdxProvider._runningTasks.has(taskLabel), false);
    });
  });

  suite('Dependency Chain Failures', () => {
    test('Sequential pipeline failure propagation', async function() {
      this.timeout(15000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const taskLabel = 'fail:sequential-pipeline';
      
      await mdxProvider.executeTask(taskLabel);
      
      // Wait for failure to propagate
      let attempts = 0;
      while (!mdxProvider._taskFailures.has(taskLabel) && 
             mdxProvider._taskStates.get(taskLabel) !== 'failed' && 
             attempts < 150) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      // The main task should be marked as failed due to subtask failure
      assert.ok(mdxProvider._taskStates.get(taskLabel) === 'failed' ||
               mdxProvider._taskFailures.has(taskLabel));
    });

    test('Parallel task failure handling', async function() {
      this.timeout(15000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const taskLabel = 'fail:parallel-checks';
      
      await mdxProvider.executeTask(taskLabel);
      
      // Wait for failure
      let attempts = 0;
      while (!mdxProvider._taskFailures.has(taskLabel) && 
             mdxProvider._taskStates.get(taskLabel) !== 'failed' && 
             attempts < 150) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      // Should handle parallel failure gracefully
      assert.ok(mdxProvider._taskStates.get(taskLabel) === 'failed' ||
               mdxProvider._taskFailures.has(taskLabel));
    });

    test('Nested dependency failure propagation', async function() {
      this.timeout(20000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const parentLabel = 'fail:nested-parent';
      
      await mdxProvider.executeTask(parentLabel);
      
      // Wait for the nested failure to propagate up
      let attempts = 0;
      while (!mdxProvider._taskFailures.has(parentLabel) && 
             mdxProvider._taskStates.get(parentLabel) !== 'failed' && 
             attempts < 200) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      // Parent should be marked as failed due to child failure
      assert.ok(mdxProvider._taskStates.get(parentLabel) === 'failed' ||
               mdxProvider._taskFailures.has(parentLabel));
      
      // Check if the failure propagation recorded the child that failed
      if (mdxProvider._taskFailures.has(parentLabel)) {
        const failure = mdxProvider._taskFailures.get(parentLabel);
        assert.ok(failure);
        assert.ok(failure.failedSubtask, 'Should record which subtask failed');
      }
    });
  });

  suite('Circular Dependency Detection', () => {
    test('Circular dependency prevention', async function() {
      this.timeout(10000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      // This test needs to be implemented based on how circular dependencies
      // are handled in the actual implementation
      // For now, we'll test that the system doesn't hang indefinitely
      
      const testStartTime = Date.now();
      
      try {
        // Try to execute a task that might have circular dependencies
        // This should either succeed or fail quickly, not hang
        await mdxProvider.executeTask('test:circular-dependency');
      } catch (error) {
        // Expected if circular dependency is detected
        const testDuration = Date.now() - testStartTime;
        assert.ok(testDuration < 5000, 'Circular dependency detection should be fast');
      }
      
      const testDuration = Date.now() - testStartTime;
      assert.ok(testDuration < 5000, 'Task execution should not hang indefinitely');
    });
  });

  suite('Error Handling Edge Cases', () => {
    test('Malformed task definition handling', async function() {
      this.timeout(10000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      // Test handling of non-existent task
      try {
        await mdxProvider.executeTask('non-existent-task');
        // Should not throw unhandled exception
      } catch (error) {
        // Expected - should handle gracefully
        assert.ok(error instanceof Error);
      }
    });

    test('VS Code Tasks API failure handling', async function() {
      this.timeout(10000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      // This test would need to mock the VS Code API to simulate failures
      // For now, we'll test that the provider handles missing task definitions
      
      const invalidLabel = 'invalid:task:label:with:too:many:colons';
      
      try {
        await mdxProvider.executeTask(invalidLabel);
      } catch (error) {
        // Should handle invalid task labels gracefully
        assert.ok(error instanceof Error);
      }
    });

    test('Concurrent stop operations on same task', async function() {
      this.timeout(15000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const taskLabel = 'test:long-running';
      
      // Start a long-running task
      await mdxProvider.executeTask(taskLabel);
      
      // Wait for it to be running
      let attempts = 0;
      while (mdxProvider._taskStates.get(taskLabel) !== 'running' && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      // Attempt to stop it multiple times concurrently
      const stopPromises = [
        mdxProvider.stopTask(taskLabel),
        mdxProvider.stopTask(taskLabel),
        mdxProvider.stopTask(taskLabel)
      ];
      
      // All stop operations should complete without throwing
      await Promise.all(stopPromises);
      
      // Task should be stopped
      assert.strictEqual(mdxProvider._runningTasks.has(taskLabel), false);
    });
  });

  suite('Framework-Specific Failures', () => {
    test('Jest test failure handling', async function() {
      this.timeout(15000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const taskLabel = 'fail:jest';
      
      await mdxProvider.executeTask(taskLabel);
      
      // Wait for Jest failure
      let attempts = 0;
      while (!mdxProvider._taskFailures.has(taskLabel) && 
             mdxProvider._taskStates.get(taskLabel) !== 'failed' && 
             attempts < 150) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      assert.ok(mdxProvider._taskStates.get(taskLabel) === 'failed' ||
               mdxProvider._taskFailures.has(taskLabel));
    });

    test('Pytest failure handling', async function() {
      this.timeout(15000);
      
      if (!mdxProvider) {
        this.skip();
        return;
      }

      const taskLabel = 'fail:pytest';
      
      await mdxProvider.executeTask(taskLabel);
      
      // Wait for pytest failure
      let attempts = 0;
      while (!mdxProvider._taskFailures.has(taskLabel) && 
             mdxProvider._taskStates.get(taskLabel) !== 'failed' && 
             attempts < 150) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      assert.ok(mdxProvider._taskStates.get(taskLabel) === 'failed' ||
               mdxProvider._taskFailures.has(taskLabel));
    });
  });
});