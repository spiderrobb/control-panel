// Shared task fixtures for testing both extension and webview components

/**
 * Sample tasks matching the structure returned by VS Code's fetchTasks()
 * after being serialized for the webview.
 */
export const sampleTasks = [
  {
    id: 'shell|test|/workspaces/ControlPanel',
    label: 'test',
    displayLabel: 'test',
    source: 'Workspace',
    definition: {
      type: 'shell',
      command: 'npm test',
      label: 'test'
    },
    dependsOn: [],
    dependsOrder: undefined
  },
  {
    id: 'shell|build|/workspaces/ControlPanel',
    label: 'build',
    displayLabel: 'build',
    source: 'Workspace',
    definition: {
      type: 'shell',
      command: 'webpack --mode production',
      label: 'build'
    },
    dependsOn: [],
    dependsOrder: undefined
  },
  {
    id: 'npm|test|/workspaces/ControlPanel',
    label: 'test',
    displayLabel: 'test',
    source: 'npm',
    definition: {
      type: 'npm',
      script: 'test',
      path: '/workspaces/ControlPanel'
    },
    dependsOn: [],
    dependsOrder: undefined
  },
  {
    id: 'shell|lint|/workspaces/ControlPanel',
    label: 'lint',
    displayLabel: 'lint',
    source: 'Workspace',
    definition: {
      type: 'shell',
      command: 'eslint .',
      label: 'lint'
    },
    dependsOn: [],
    dependsOrder: undefined
  }
];

/**
 * Task with sequential dependencies (tree-shaped dependsOn)
 */
export const taskWithDependencies = {
  id: 'shell|deploy|/workspaces/ControlPanel',
  label: 'deploy',
  displayLabel: 'deploy',
  source: 'Workspace',
  definition: {
    type: 'shell',
    command: 'echo deploy',
    label: 'deploy'
  },
  dependsOn: [
    { label: 'build', id: 'shell|build|/workspaces/ControlPanel', source: 'Workspace', definition: { type: 'shell', command: 'webpack --mode production', label: 'build' }, dependsOn: [], dependsOrder: 'parallel' },
    { label: 'test', id: 'shell|test|/workspaces/ControlPanel', source: 'Workspace', definition: { type: 'shell', command: 'npm test', label: 'test' }, dependsOn: [], dependsOrder: 'parallel' }
  ],
  dependsOrder: 'sequence'
};

/**
 * Task with parallel dependencies (tree-shaped dependsOn)
 */
export const taskWithParallelDeps = {
  id: 'shell|ci|/workspaces/ControlPanel',
  label: 'ci',
  displayLabel: 'ci',
  source: 'Workspace',
  definition: {
    type: 'shell',
    command: 'echo ci',
    label: 'ci'
  },
  dependsOn: [
    { label: 'lint', id: 'shell|lint|/workspaces/ControlPanel', source: 'Workspace', definition: { type: 'shell', command: 'eslint .', label: 'lint' }, dependsOn: [], dependsOrder: 'parallel' },
    { label: 'test', id: 'shell|test|/workspaces/ControlPanel', source: 'Workspace', definition: { type: 'shell', command: 'npm test', label: 'test' }, dependsOn: [], dependsOrder: 'parallel' }
  ],
  dependsOrder: 'parallel'
};

/**
 * Running task state samples (matching the runningTasks object shape in context.js)
 */
export const runningTaskStates = {
  simple: {
    running: true,
    startTime: Date.now() - 5000,
    state: 'running',
    subtasks: [],
    isFirstRun: false,
    avgDuration: null,
    canStop: true,
    canFocus: true
  },
  withProgress: {
    running: true,
    startTime: Date.now() - 10000,
    state: 'running',
    subtasks: [],
    isFirstRun: false,
    avgDuration: 30000,
    canStop: true,
    canFocus: true
  },
  firstRun: {
    running: true,
    startTime: Date.now() - 3000,
    state: 'running',
    subtasks: [],
    isFirstRun: true,
    avgDuration: null,
    canStop: true,
    canFocus: true
  },
  failed: {
    running: false,
    failed: true,
    startTime: Date.now() - 8000,
    exitCode: 1,
    failureReason: 'Test suite failed',
    subtasks: [],
    state: 'failed'
  },
  failedWithDependency: {
    running: false,
    failed: true,
    startTime: Date.now() - 5000,
    exitCode: 1,
    failureReason: 'Dependency failed',
    failedDependency: 'lint',
    subtasks: [],
    state: 'failed'
  },
  withSubtasks: {
    running: true,
    startTime: Date.now() - 15000,
    state: 'running',
    subtasks: ['build', 'test'],
    isFirstRun: false,
    avgDuration: 60000,
    canFocus: false,
    canStop: true
  },
  stopping: {
    running: true,
    startTime: Date.now() - 10000,
    state: 'stopping',
    subtasks: [],
    canStop: false,
    canFocus: true
  }
};

/**
 * Execution history samples matching the shape used by ExecutionHistoryPanel
 */
export const executionHistory = [
  {
    id: 'exec-1',
    taskLabel: 'test',
    startTime: Date.now() - 3600000,
    endTime: Date.now() - 3590000,
    duration: 10000,
    failed: false,
    exitCode: 0
  },
  {
    id: 'exec-2',
    taskLabel: 'build',
    startTime: Date.now() - 7200000,
    endTime: Date.now() - 7170000,
    duration: 30000,
    failed: false,
    exitCode: 0
  },
  {
    id: 'exec-3',
    taskLabel: 'test',
    startTime: Date.now() - 10800000,
    endTime: Date.now() - 10795000,
    duration: 5000,
    failed: true,
    exitCode: 1,
    reason: 'Test suite failed'
  }
];

/**
 * Execution history with parent/child relationships
 */
export const executionHistoryWithChildren = [
  {
    id: 'exec-parent-1',
    taskLabel: 'deploy',
    startTime: Date.now() - 3600000,
    endTime: Date.now() - 3540000,
    duration: 60000,
    failed: false,
    exitCode: 0,
    childLabels: ['build', 'test']
  },
  {
    id: 'exec-child-1',
    taskLabel: 'build',
    startTime: Date.now() - 3600000,
    endTime: Date.now() - 3570000,
    duration: 30000,
    failed: false,
    exitCode: 0,
    parentLabel: 'deploy'
  },
  {
    id: 'exec-child-2',
    taskLabel: 'test',
    startTime: Date.now() - 3570000,
    endTime: Date.now() - 3540000,
    duration: 30000,
    failed: false,
    exitCode: 0,
    parentLabel: 'deploy'
  }
];

/**
 * Helper to create a mock task object matching webview task shape
 */
export function createMockTask(label, options = {}) {
  const source = options.source || 'Workspace';
  const type = options.type || 'shell';
  return {
    id: options.id || `${type}|${label}|/workspaces/ControlPanel`,
    label,
    displayLabel: options.displayLabel || label,
    source,
    definition: {
      type,
      command: options.command || `echo ${label}`,
      script: options.script,
      path: options.path,
      label,
      ...options.definition
    },
    dependsOn: options.dependsOn || [],  // tree-shaped: array of { label, id, source, definition, dependsOn, dependsOrder }
    dependsOrder: options.dependsOrder
  };
}

/**
 * Helper to create running task state matching runningTasks object shape
 */
export function createRunningTaskState(taskLabel, options = {}) {
  return {
    running: options.running !== undefined ? options.running : !options.failed && !options.completed,
    completed: options.completed || options.failed || false,
    failed: options.failed || false,
    startTime: options.startTime || Date.now(),
    exitCode: options.exitCode,
    failureReason: options.failureReason,
    failedDependency: options.failedDependency,
    duration: options.duration || null,
    avgDuration: options.avgDuration || null,
    isFirstRun: options.isFirstRun || false,
    subtasks: options.subtasks || [],
    parentTask: options.parentTask || null,
    state: options.state || 'running',
    canStop: options.canStop !== undefined ? options.canStop : true,
    canFocus: options.canFocus !== undefined ? options.canFocus : true
  };
}

/**
 * Helper to create a dependency tree node (for dependsOn arrays)
 */
export function createDepNode(label, options = {}) {
  const source = options.source || 'Workspace';
  const type = options.type || 'shell';
  return {
    label,
    id: options.id || `${type}|${label}|/workspaces/ControlPanel`,
    source,
    definition: {
      type,
      command: options.command || `echo ${label}`,
      script: options.script,
      path: options.path,
      label,
      ...options.definition
    },
    dependsOn: options.dependsOn || [],
    dependsOrder: options.dependsOrder || 'parallel'
  };
}

/**
 * 3-level nested parallel dependency tree:
 * pipeline → [stage-1, stage-2]
 *   stage-1 → [s1-lint, s1-types, s1-format]  (parallel)
 *   stage-2 → [s2-unit, s2-e2e]               (parallel)
 */
export const nestedParallelTree = createMockTask('pipeline', {
  dependsOn: [
    createDepNode('stage-1', {
      dependsOn: [
        createDepNode('s1-lint'),
        createDepNode('s1-types'),
        createDepNode('s1-format')
      ],
      dependsOrder: 'parallel'
    }),
    createDepNode('stage-2', {
      dependsOn: [
        createDepNode('s2-unit'),
        createDepNode('s2-e2e')
      ],
      dependsOrder: 'parallel'
    })
  ],
  dependsOrder: 'parallel'
});

/**
 * 3-level nested sequential dependency chain:
 * deploy → [build, lint, test] all sequential
 *   build → [compile, bundle] sequential
 */
export const nestedSequentialChain = createMockTask('deploy', {
  dependsOn: [
    createDepNode('build', {
      dependsOn: [
        createDepNode('compile'),
        createDepNode('bundle')
      ],
      dependsOrder: 'sequence'
    }),
    createDepNode('lint'),
    createDepNode('test')
  ],
  dependsOrder: 'sequence'
});

/**
 * Mixed nested: parallel parent, stage-1 parallel children, stage-2 sequential children
 * pipeline → [stage-1 (parallel), stage-2 (sequential)]
 *   stage-1 → [s1-lint, s1-format]  (parallel)
 *   stage-2 → [s2-unit, s2-e2e]     (sequential)
 */
export const nestedMixedTree = createMockTask('pipeline', {
  id: 'shell|pipeline-mixed|/workspaces/ControlPanel',
  dependsOn: [
    createDepNode('stage-1', {
      dependsOn: [
        createDepNode('s1-lint'),
        createDepNode('s1-format')
      ],
      dependsOrder: 'parallel'
    }),
    createDepNode('stage-2', {
      dependsOn: [
        createDepNode('s2-unit'),
        createDepNode('s2-e2e')
      ],
      dependsOrder: 'sequence'
    })
  ],
  dependsOrder: 'parallel'
});

/**
 * Log buffer entries for debug panel testing
 */
export const sampleLogBuffer = [
  { timestamp: '2026-02-07 10:00:01', level: 'INFO', message: 'Task started: test' },
  { timestamp: '2026-02-07 10:00:02', level: 'DEBUG', message: 'Process spawned with PID 12345' },
  { timestamp: '2026-02-07 10:00:05', level: 'ERROR', message: 'Test suite failed with exit code 1' },
  { timestamp: '2026-02-07 10:00:06', level: 'WARN', message: 'Task retry recommended' }
];
