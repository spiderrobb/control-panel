// Shared task fixtures for testing both extension and webview components

/**
 * Sample tasks for testing
 */
export const sampleTasks = [
  {
    definition: {
      type: 'npm',
      script: 'test',
      path: '/workspaces/ControlPanel',
      label: 'npm: test'
    },
    name: 'test',
    source: 'npm',
    isBackground: false
  },
  {
    definition: {
      type: 'npm',
      script: 'build',
      path: '/workspaces/ControlPanel',
      label: 'npm: build'
    },
    name: 'build',
    source: 'npm',
    isBackground: false
  },
  {
    definition: {
      type: 'shell',
      command: 'echo "Hello World"',
      label: 'shell: echo'
    },
    name: 'echo',
    source: 'shell',
    isBackground: false
  }
];

/**
 * Task with dependencies for testing composite task scenarios
 */
export const taskWithDependencies = {
  definition: {
    type: 'npm',
    script: 'deploy',
    path: '/workspaces/ControlPanel',
    label: 'npm: deploy',
    dependsOn: ['npm: build', 'npm: test']
  },
  name: 'deploy',
  source: 'npm',
  isBackground: false
};

/**
 * Running task state samples
 */
export const runningTaskStates = {
  simple: {
    taskLabel: 'npm: test',
    startTime: Date.now() - 5000, // Started 5 seconds ago
    state: 'running'
  },
  withProgress: {
    taskLabel: 'npm: build',
    startTime: Date.now() - 10000,
    state: 'running',
    expectedDuration: 30000
  },
  failed: {
    taskLabel: 'npm: test',
    startTime: Date.now() - 8000,
    endTime: Date.now() - 1000,
    state: 'failed',
    exitCode: 1,
    failureReason: 'Test suite failed'
  },
  withSubtasks: {
    taskLabel: 'npm: deploy',
    startTime: Date.now() - 15000,
    state: 'running',
    subtasks: [
      {
        taskLabel: 'npm: build',
        startTime: Date.now() - 15000,
        endTime: Date.now() - 10000,
        state: 'completed'
      },
      {
        taskLabel: 'npm: test',
        startTime: Date.now() - 10000,
        state: 'running'
      }
    ]
  }
};

/**
 * Execution history samples
 */
export const executionHistory = [
  {
    id: '1',
    taskLabel: 'npm: test',
    startTime: Date.now() - 3600000, // 1 hour ago
    endTime: Date.now() - 3590000,
    duration: 10000,
    success: true,
    exitCode: 0
  },
  {
    id: '2',
    taskLabel: 'npm: build',
    startTime: Date.now() - 7200000, // 2 hours ago
    endTime: Date.now() - 7170000,
    duration: 30000,
    success: true,
    exitCode: 0
  },
  {
    id: '3',
    taskLabel: 'npm: test',
    startTime: Date.now() - 10800000, // 3 hours ago
    endTime: Date.now() - 10795000,
    duration: 5000,
    success: false,
    exitCode: 1
  }
];

/**
 * Helper to create a mock VS Code Task object
 */
export function createMockTask(label, options = {}) {
  return {
    definition: {
      type: options.type || 'npm',
      script: options.script || label.replace('npm: ', ''),
      path: options.path || '/workspaces/ControlPanel',
      label,
      ...options.definition
    },
    name: options.name || label,
    source: options.source || 'npm',
    isBackground: options.isBackground || false,
    ...options
  };
}

/**
 * Helper to create running task state
 */
export function createRunningTaskState(taskLabel, options = {}) {
  const now = Date.now();
  return {
    taskLabel,
    startTime: options.startTime || now,
    endTime: options.endTime,
    state: options.state || 'running',
    exitCode: options.exitCode,
    failureReason: options.failureReason,
    expectedDuration: options.expectedDuration,
    subtasks: options.subtasks || [],
    ...options
  };
}
