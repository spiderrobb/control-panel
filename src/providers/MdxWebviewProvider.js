const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class MdxWebviewProvider {
  constructor(context, logger) {
    this._context = context;
    this._logger = logger;
    this._view = undefined;
    this._runningTasks = new Map(); // Map<label, execution>
    this._taskHierarchy = new Map(); // Map<parentLabel, Set<childLabel>>
    this._taskStartTimes = new Map(); // Map<label, timestamp>
    this._taskResults = new Map(); // Map<label, {exitCode, reason, failed}>
    this._taskStates = new Map(); // Map<label, 'starting'|'running'|'stopping'|'stopped'|'failed'>
    this._stoppingTasks = new Set(); // Set<label> - tracks tasks currently being stopped to prevent circular dependencies
    this._cancelledTasks = new Set(); // Set<label> - tasks cancelled by stopTask; handleTaskStarted/Ended will ignore them
    this._ensureParentPromises = new Map(); // Map<label, Promise> - deduplicates concurrent ensureParentRunning calls
    this._stateMutex = Promise.resolve(); // Async mutex for global state read-modify-write operations
    
    // Watch for task execution changes
    this._taskExecution = vscode.tasks.onDidStartTaskProcess((e) => {
      this.handleTaskStarted(e);
    });
    
    this._taskEnd = vscode.tasks.onDidEndTaskProcess((e) => {
      this.handleTaskEnded(e);
    });
    
    context.subscriptions.push(this._taskExecution);
    context.subscriptions.push(this._taskEnd);
  }

  dispose() {
    if (this._taskExecution) {
      this._taskExecution.dispose();
    }
    if (this._taskEnd) {
      this._taskEnd.dispose();
    }
    this._runningTasks.clear();
    this._taskHierarchy.clear();
    this._taskStartTimes.clear();
    this._taskResults.clear();
    this._taskStates.clear();
    this._stoppingTasks.clear();
    this._cancelledTasks.clear();
    this._ensureParentPromises.clear();
  }

  // Generate a unique ID for a task
  getTaskId(task) {
    if (!task) return null;
    const source = task.source || 'User';
    return `${source}|${task.name}`;
  }

  // Async mutex helper to serialize global state read-modify-write operations
  _withStateLock(fn) {
    const next = this._stateMutex.then(() => fn()).catch(err => {
      this._logger.warn('Global state update failed:', err);
    });
    this._stateMutex = next;
    return next;
  }

  // Task history storage management
  async getTaskHistory(label) {
    const history = this._context.globalState.get('taskHistory', {});
    return history[label] || { durations: [], count: 0 };
  }

  async updateTaskHistory(label, duration) {
    return this._withStateLock(async () => {
      const history = this._context.globalState.get('taskHistory', {});
      const taskData = history[label] || { durations: [], count: 0 };
      
      // Keep last 10 durations for rolling average
      taskData.durations.push(duration);
      if (taskData.durations.length > 10) {
        taskData.durations.shift();
      }
      taskData.count++;
      
      history[label] = taskData;
      await this._context.globalState.update('taskHistory', history);
      
      return taskData;
    });
  }

  getAverageDuration(durations) {
    if (durations.length === 0) return null;
    const sum = durations.reduce((a, b) => a + b, 0);
    return sum / durations.length;
  }

  // Recently used tasks
  async getRecentlyUsedTasks() {
    return this._context.globalState.get('recentlyUsedTasks', []);
  }

  async addRecentlyUsedTask(label) {
    let recent = await this.getRecentlyUsedTasks();
    // Remove if already exists
    recent = recent.filter(t => t !== label);
    // Add to front
    recent.unshift(label);
    // Keep only last 5
    recent = recent.slice(0, 5);
    await this._context.globalState.update('recentlyUsedTasks', recent);
    
    // Notify webview
    this._view?.webview.postMessage({
      type: 'updateRecentlyUsed',
      tasks: recent
    });
  }

  // Starred tasks
  async getStarredTasks() {
    return this._context.globalState.get('starredTasks', []);
  }

  // Execution history (workspace-specific)
  async getExecutionHistory() {
    return this._context.workspaceState.get('executionHistory', []);
  }

  async addExecutionRecord(record) {
    let history = await this.getExecutionHistory();
    
    // Add new record at the beginning (most recent first)
    history.unshift(record);
    
    // Limit to 20 most recent executions
    if (history.length > 20) {
      history = history.slice(0, 20);
    }
    
    await this._context.workspaceState.update('executionHistory', history);
    
    // Notify webview
    this._view?.webview.postMessage({
      type: 'executionHistory',
      history
    });

    return history;
  }

  // Navigation history (workspace-specific)
  async getNavigationHistory() {
    return this._context.workspaceState.get('navigationHistory', []);
  }

  async getNavigationIndex() {
    return this._context.workspaceState.get('navigationIndex', -1);
  }

  async updateNavigationHistory(history, index) {
    await this._context.workspaceState.update('navigationHistory', history);
    await this._context.workspaceState.update('navigationIndex', index);
    
    // Send updated history to webview
    this._view?.webview.postMessage({
      type: 'updateNavigationHistory',
      history,
      index
    });
  }

  // Completed tasks persistence (workspace-specific) — stores both successes and failures
  async getPersistedCompletedTasks() {
    // Migrate legacy 'failedTasks' key on first access
    const legacy = this._context.workspaceState.get('failedTasks', null);
    if (legacy) {
      const current = this._context.workspaceState.get('completedTasks', {});
      const merged = { ...legacy, ...current };
      await this._context.workspaceState.update('completedTasks', merged);
      await this._context.workspaceState.update('failedTasks', undefined);
      return merged;
    }
    return this._context.workspaceState.get('completedTasks', {});
  }

  async saveCompletedTask(label, resultInfo) {
    return this._withStateLock(async () => {
      const completed = await this.getPersistedCompletedTasks();
      completed[label] = resultInfo;
      await this._context.workspaceState.update('completedTasks', completed);
    });
  }

  async clearCompletedTask(label) {
    return this._withStateLock(async () => {
      const completed = await this.getPersistedCompletedTasks();
      // Recursively collect all child labels to dismiss
      const toDismiss = new Set();
      const collectChildren = (taskLabel) => {
        if (toDismiss.has(taskLabel)) return;
        toDismiss.add(taskLabel);
        // Check in-memory hierarchy
        const hierarchyChildren = this.getTaskHierarchy(taskLabel);
        for (const child of hierarchyChildren) {
          collectChildren(child);
        }
        // Also check persisted subtasks (in case hierarchy was already cleaned up)
        const persisted = completed[taskLabel];
        if (persisted?.subtasks) {
          for (const child of persisted.subtasks) {
            collectChildren(child);
          }
        }
      };
      collectChildren(label);
      for (const taskLabel of toDismiss) {
        delete completed[taskLabel];
      }
      await this._context.workspaceState.update('completedTasks', completed);
    });
  }

  // UI panel collapse state (global)
  async getPanelState() {
    return this._context.globalState.get('panelState', {
      runningTasksCollapsed: false,
      starredTasksCollapsed: false
    });
  }

  async updatePanelState(partialState) {
    return this._withStateLock(async () => {
      const current = await this.getPanelState();
      const next = { ...current, ...partialState };
      await this._context.globalState.update('panelState', next);
      this._view?.webview.postMessage({
        type: 'panelState',
        state: next
      });
      return next;
    });
  }

  async toggleStarTask(label) {
    let starred = await this.getStarredTasks();
    if (starred.includes(label)) {
      starred = starred.filter(t => t !== label);
    } else {
      // Limit to 20 starred tasks
      if (starred.length >= 20) {
        this._view?.webview.postMessage({
          type: 'error',
          message: 'Maximum 20 starred tasks allowed. Remove one to add another.'
        });
        return starred;
      }
      starred.push(label);
    }
    await this._context.globalState.update('starredTasks', starred);
    
    // Notify webview
    this._view?.webview.postMessage({
      type: 'updateStarred',
      tasks: starred
    });
    
    return starred;
  }

  // Subtask tracking
  addSubtask(parentLabel, childLabel) {
    if (!this._taskHierarchy.has(parentLabel)) {
      this._taskHierarchy.set(parentLabel, new Set());
    }
    this._taskHierarchy.get(parentLabel).add(childLabel);
  }

  normalizeDependencyLabel(dep) {
    if (!dep) return null;
    if (typeof dep === 'string') return dep;
    return dep.label || dep.task || null;
  }

  /**
   * Resolve a task name to a VS Code Task object, following VS Code's own
   * task-source precedence rules.
   *
   * ── VS Code Task Resolution Precedence ──────────────────────────────────
   *
   *   Workspace (tasks.json)  ALWAYS  takes precedence over auto-detected
   *   tasks (npm, gulp, grunt, etc.) when both define the same name.
   *
   *   Example with a "compile" task defined in BOTH tasks.json and package.json:
   *     "compile"       → resolves to the tasks.json (Workspace) definition
   *     "npm: compile"  → resolves to the package.json (npm) definition
   *
   *   If tasks.json does NOT define "compile":
   *     "compile"       → resolves to the package.json (npm) definition
   *     "npm: compile"  → resolves to the package.json (npm) definition
   *
   * ── Why this matters ───────────────────────────────────────────────────
   *
   *   vscode.tasks.fetchTasks() returns tasks from ALL providers (Workspace,
   *   npm, etc.) in arbitrary order. A bare `tasks.find(t => t.name === name)`
   *   picks whichever comes first — often the npm variant.
   *
   *   Task IDs use the format "Source|Name" (e.g. "Workspace|compile" vs
   *   "npm|compile"). When dependency registration picks "npm|compile" but
   *   VS Code's runner actually executes "Workspace|compile", the hierarchy
   *   lookup in handleTaskStarted fails to match — causing the parent task
   *   to never be recognized as running (e.g. no Stop button on the
   *   TaskLink for "test:ci" when its first dependency is "compile").
   *
   * ── Canonical implementations of this same rule ────────────────────────
   *
   *   @see sendTasksToWebview — tasksByLabel map with Workspace preference
   *   @see TaskLink.jsx — getTaskInfo with matching.find(t => t.source === 'Workspace')
   *
   * @param {import('vscode').Task[]} tasks - Array from vscode.tasks.fetchTasks()
   * @param {string} name - The task name/label to resolve
   * @returns {import('vscode').Task | null} The resolved task, or null if not found
   */
  _resolveTaskByName(tasks, name) {
    const matching = tasks.filter(t => t.name === name);
    return matching.find(t => t.source === 'Workspace') || matching[0] || null;
  }

  async registerTaskDependencies(taskId) {
    const tasks = await vscode.tasks.fetchTasks();
    const task = tasks.find(t => this.getTaskId(t) === taskId);

    if (!task) return [];

    const dependencies = await this.getTaskDependencies(task);
    const depIds = [];

    dependencies.forEach(dep => {
      const depName = this.normalizeDependencyLabel(dep);
      if (depName) {
        const depTask = this._resolveTaskByName(tasks, depName);
        if (depTask) {
          const depId = this.getTaskId(depTask);
          if (depId !== taskId) {
            this.addSubtask(taskId, depId);
            depIds.push(depId);
          }
        }
      }
    });

    return depIds;
  }

  /**
   * Recursively register the full dependency tree for a task.
   * Walks all dependsOn children and their children, populating
   * _taskHierarchy at every level so the UI can render the full tree.
   * @param {string} taskId - The task ID to register deps for
   * @param {Array} [allTasks] - Pre-fetched tasks array (avoids redundant fetchTasks calls)
   * @param {Set} [visited] - Tracks visited IDs to prevent infinite loops
   */
  async registerDependencyTree(taskId, allTasks, visited) {
    if (!allTasks) {
      allTasks = await vscode.tasks.fetchTasks();
    }
    if (!visited) {
      visited = new Set();
    }
    if (visited.has(taskId)) return;
    visited.add(taskId);

    const task = allTasks.find(t => this.getTaskId(t) === taskId);
    if (!task) return;

    const dependencies = await this.getTaskDependencies(task);
    for (const dep of dependencies) {
      const depName = this.normalizeDependencyLabel(dep);
      if (!depName) continue;
      const depTask = this._resolveTaskByName(allTasks, depName);
      if (!depTask) continue;
      const depId = this.getTaskId(depTask);
      if (depId === taskId) continue;

      this.addSubtask(taskId, depId);

      // Recurse into this child to register its own children
      await this.registerDependencyTree(depId, allTasks, visited);
    }
  }

  // Discover parent tasks for a given task ID by checking both active task
  // executions and all workspace tasks. When a task is started as a dependency
  // (e.g. via VS Code's native task runner or command palette), the parent-child
  // hierarchy is not pre-populated by runTask(). This method finds any parent
  // that lists the given task as a dependency and registers the relationship so
  // that ensureParentRunning can make the parent visible in the UI immediately.
  async discoverParentTasks(taskId) {
    // If already registered as a subtask of some parent, nothing to discover.
    // Use label-part matching to handle source mismatches.
    const taskLabelPart = taskId.includes('|') ? taskId.split('|')[1] : taskId;
    let alreadyHasParent = false;
    this._taskHierarchy.forEach((subtasks) => {
      if (subtasks.has(taskId)) { alreadyHasParent = true; return; }
      for (const sub of subtasks) {
        const subLabel = sub.includes('|') ? sub.split('|')[1] : sub;
        if (subLabel === taskLabelPart) {
          // Also register the actual taskId for direct lookups
          subtasks.add(taskId);
          alreadyHasParent = true;
          return;
        }
      }
    });
    if (alreadyHasParent) return;

    // Extract the task name from the ID (format: "Source|Name")
    const taskName = taskId.includes('|') ? taskId.split('|')[1] : taskId;

    // Build a set of task IDs that have active VS Code executions.
    // taskExecutions includes parent tasks whose process hasn't started yet
    // (i.e. still waiting for dependsOn dependencies to complete).
    const activeExecutions = vscode.tasks.taskExecutions || [];
    const activeIds = new Set();
    for (const exec of activeExecutions) {
      activeIds.add(this.getTaskId(exec.task));
    }

    // Scan ALL workspace tasks to find any that list our task as a dependency
    const allTasks = await vscode.tasks.fetchTasks();

    for (const candidateTask of allTasks) {
      const candidateId = this.getTaskId(candidateTask);

      // Skip self
      if (candidateId === taskId) continue;

      // Skip if this candidate is already tracking our task
      const existingChildren = this._taskHierarchy.get(candidateId);
      if (existingChildren && existingChildren.has(taskId)) continue;

      // Only consider candidates that have an active VS Code execution
      if (!activeIds.has(candidateId)) continue;

      // Check if this candidate lists our task as a dependency
      const depInfo = await this.getTaskDependencyInfo(candidateTask);
      const depNames = (depInfo.dependsOn || []).map(d => this.normalizeDependencyLabel(d)).filter(Boolean);

      if (depNames.includes(taskName)) {
        this._logger.info(`Discovered parent task "${candidateId}" for "${taskId}" (via active executions)`);

        // Store the actual VS Code TaskExecution for the parent so stopTask
        // can terminate it later (the parent's process may not have started
        // yet, but VS Code's execution handle can still terminate the chain).
        const parentExec = activeExecutions.find(e => this.getTaskId(e.task) === candidateId);
        if (parentExec && !this._runningTasks.has(candidateId)) {
          this._runningTasks.set(candidateId, parentExec);
        }

        // Register ALL of this parent's dependencies (not just ours).
        // Also register the actual taskId if the resolved variant differs
        // (handles source mismatches like Workspace|package vs npm|package).
        for (const depName of depNames) {
          const depTask = this._resolveTaskByName(allTasks, depName);
          if (depTask) {
            const depId = this.getTaskId(depTask);
            if (depId !== candidateId) {
              this.addSubtask(candidateId, depId);
              // If the running task's actual ID differs from resolved, register both
              if (depName === taskLabelPart && depId !== taskId) {
                this.addSubtask(candidateId, taskId);
              }
            }
          }
        }

        // Also register the parent's own dependencies recursively
        await this.registerTaskDependencies(candidateId);

        // Recurse upward: the discovered parent may itself be a child
        // of a grandparent (e.g. stage-1 is a child of pipeline).
        await this.discoverParentTasks(candidateId);
      }
    }
  }

  async ensureParentRunning(parentId) {
    const currentState = this._taskStates.get(parentId);

    // If parent was already fully set up by a prior call (or by
    // handleTaskStarted), no-op.
    if (currentState === 'running') {
      // If there's an in-flight promise from a concurrent call that
      // hasn't finished sending messages yet, wait for it.
      const inflight = this._ensureParentPromises.get(parentId);
      if (inflight) await inflight;
      return;
    }

    // If another concurrent caller is already setting up this parent,
    // just wait for that same promise instead of duplicating work.
    const existing = this._ensureParentPromises.get(parentId);
    if (existing) {
      await existing;
      return;
    }

    // Mark running IMMEDIATELY before any async work so concurrent
    // callers see it and await our promise instead of duplicating.
    const startTime = this._taskStartTimes.get(parentId) || Date.now();
    this._taskStartTimes.set(parentId, startTime);
    this._taskStates.set(parentId, 'running');

    if (!this._runningTasks.has(parentId)) {
      this._runningTasks.set(parentId, null);
    }

    // Store the setup promise so concurrent callers can await it.
    const setupPromise = this._doEnsureParentRunning(parentId, startTime);
    this._ensureParentPromises.set(parentId, setupPromise);

    try {
      await setupPromise;
    } finally {
      this._ensureParentPromises.delete(parentId);
    }
  }

  async _doEnsureParentRunning(parentId, startTime) {
    // Walk up: if this parent is itself a child of a grandparent, ensure
    // the grandparent is running first so the full chain is visible.
    let grandparentId = null;
    for (const [ancestorId, ancestorChildren] of this._taskHierarchy) {
      if (ancestorChildren.has(parentId)) {
        grandparentId = ancestorId;
        await this.ensureParentRunning(ancestorId);
        // Notify webview of the grandparent → parent link
        this._view?.webview.postMessage({
          type: 'subtaskStarted',
          parentLabel: ancestorId,
          childLabel: parentId,
          parentStartTime: this._taskStartTimes.get(ancestorId) || Date.now()
        });
        break; // a task has at most one direct parent
      }
    }

    const history = await this.getTaskHistory(parentId);
    const avgDuration = this.getAverageDuration(history.durations);
    const subtasks = this.getTaskHierarchy(parentId);

    this._view?.webview.postMessage({
      type: 'taskStarted',
      taskLabel: parentId,
      execution: null,
      startTime,
      avgDuration,
      isFirstRun: history.count === 0,
      subtasks,
      state: 'running',
      isDependencyProxy: true,
      parentTask: grandparentId
    });

    this._view?.webview.postMessage({
      type: 'taskStateChanged',
      taskLabel: parentId,
      state: 'running',
      canStop: true,
      canFocus: false
    });
  }

  removeSubtask(parentLabel, childLabel) {
    if (this._taskHierarchy.has(parentLabel)) {
      this._taskHierarchy.get(parentLabel).delete(childLabel);
      if (this._taskHierarchy.get(parentLabel).size === 0) {
        this._taskHierarchy.delete(parentLabel);
      }
    }
  }

  getTaskHierarchy(label) {
    const subtasks = this._taskHierarchy.get(label);
    return subtasks ? Array.from(subtasks) : [];
  }

  /**
   * Walk _taskHierarchy upward from `taskId` to find the root ancestor.
   * Returns `taskId` itself if it has no parent in the hierarchy.
   */
  _findTopmostParent(taskId) {
    let current = taskId;
    const visited = new Set();
    for (;;) {
      if (visited.has(current)) return current; // cycle guard
      visited.add(current);
      let parent = null;
      for (const [parentId, children] of this._taskHierarchy) {
        if (children.has(current)) { parent = parentId; break; }
      }
      if (!parent) return current;
      current = parent;
    }
  }

  /**
   * Recursively collect all descendants of `taskId` from _taskHierarchy.
   * Returns a flat array of all child/grandchild/… IDs (not including taskId itself).
   */
  _collectAllDescendants(taskId) {
    const result = [];
    const visited = new Set();
    const walk = (id) => {
      const children = this._taskHierarchy.get(id);
      if (!children) return;
      for (const child of children) {
        if (!visited.has(child)) {
          visited.add(child);
          result.push(child);
          walk(child);
        }
      }
    };
    walk(taskId);
    return result;
  }

  async restoreNavigationState() {
    const history = await this.getNavigationHistory();
    const index = await this.getNavigationIndex();
    
    this._view?.webview.postMessage({
      type: 'updateNavigationHistory',
      history,
      index
    });
  }

  async restoreRunningTasksState() {
    // Re-send taskStarted messages for tasks that are still running
    // This handles the case where the webview is hidden/shown or extension view is switched
    
    // Helper: find this task's parent in the hierarchy
    const findParent = (taskLabel) => {
      for (const [parentId, children] of this._taskHierarchy) {
        if (children.has(taskLabel)) return parentId;
      }
      return null;
    };

    // Restore running tasks
    for (const [label, execution] of this._runningTasks.entries()) {
      const startTime = this._taskStartTimes.get(label);
      const state = this._taskStates.get(label);
      const resultInfo = this._taskResults.get(label);
      
      if (!startTime) continue;

      const history = await this.getTaskHistory(label);
      const avgDuration = this.getAverageDuration(history.durations);
      const subtasks = this.getTaskHierarchy(label);
      const parentTask = findParent(label);

      // Send appropriate message based on current state
      if (resultInfo) {
        this._view?.webview.postMessage({
          type: 'taskCompleted',
          taskLabel: label,
          exitCode: resultInfo.exitCode,
          failed: resultInfo.failed,
          reason: resultInfo.reason,
          duration: Date.now() - startTime,
          subtasks,
          parentTask: resultInfo.parentTask || parentTask
        });
      } else {
        this._view?.webview.postMessage({
          type: 'taskStarted',
          taskLabel: label,
          execution: execution,
          startTime,
          avgDuration,
          isFirstRun: history.count === 0,
          subtasks,
          state: state || 'running',
          parentTask
        });
      }
    }

    // Restore persisted completed tasks (successes and failures)
    const persistedCompleted = await this.getPersistedCompletedTasks();
    for (const [label, resultInfo] of Object.entries(persistedCompleted)) {
      // Only restore if not currently running
      if (!this._runningTasks.has(label)) {
        this._view?.webview.postMessage({
          type: 'taskCompleted',
          taskLabel: label,
          exitCode: resultInfo.exitCode,
          failed: resultInfo.failed,
          reason: resultInfo.reason,
          duration: resultInfo.duration || 0,
          subtasks: resultInfo.subtasks || [],
          failedDependency: resultInfo.failedDependency,
          parentTask: resultInfo.parentTask || null
        });
      }
    }
  }

  resolveWebviewView(webviewView, _context, _token) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this._context.extensionPath, 'dist'))
      ]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    
    // Restore navigation history
    this.restoreNavigationState();
    
    // Restore state for running tasks when webview reconnects
    this.restoreRunningTasksState();

    // When the webview becomes visible again after being hidden, the JS
    // context may have been disposed (retainContextWhenHidden is not set).
    // The new context will send a 'ready' message which triggers a full
    // restore. However, if any messages were posted while the webview was
    // hidden they are lost. Re-push running/failed task state as a safety
    // net so the UI is always up-to-date when the panel is shown.
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.restoreRunningTasksState();
      }
    });

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          await this.loadDefaultMdx();
          await this.restoreNavigationState();
          await this.sendTasksToWebview();
          await this.restoreRunningTasksState();
          break;
        case 'navigate':
          await this.loadMdxFile(message.file);
          break;
        case 'navigateBack':
          await this.navigateBack();
          break;
        case 'navigateForward':
          await this.navigateForward();
          break;
        case 'navigateToHistoryItem':
          await this.navigateToHistoryItem(message.index);
          break;
        case 'runTask':
          await this.runTask(message.label);
          break;
        case 'stopTask':
          await this.stopTask(message.label);
          break;
        case 'focusTerminal':
          await this.focusTaskTerminal(message.label);
          break;
        case 'openTaskDefinition':
          await this.openTaskDefinition(message.label);
          break;
        case 'toggleStar':
          await this.toggleStarTask(message.label);
          break;
        case 'getTaskLists': {
          const recent = await this.getRecentlyUsedTasks();
          const starred = await this.getStarredTasks();
          this._view?.webview.postMessage({
            type: 'updateRecentlyUsed',
            tasks: recent
          });
          this._view?.webview.postMessage({
            type: 'updateStarred',
            tasks: starred
          });
          break;
        }
        case 'getPanelState': {
          const state = await this.getPanelState();
          this._view?.webview.postMessage({
            type: 'panelState',
            state
          });
          break;
        }
        case 'setPanelState': {
          await this.updatePanelState(message.state || {});
          break;
        }
        case 'dismissTask':
          await this.clearCompletedTask(message.label);
          break;
        case 'showLogs':
          this._logger.show();
          break;
        case 'getLogBuffer':
          this._view?.webview.postMessage({
            type: 'logBuffer',
            entries: this._logger.getBuffer()
          });
          break;
        case 'openCurrentFile': {
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (workspaceFolders && message.file) {
            const cpdoxPath = path.join(workspaceFolders[0].uri.fsPath, '.cpdox');
            const filePath = path.join(cpdoxPath, message.file);
            if (fs.existsSync(filePath)) {
              const fileUri = vscode.Uri.file(filePath);
              await vscode.commands.executeCommand('vscode.open', fileUri);
            }
          }
          break;
        }
        case 'getExecutionHistory': {
          const history = await this.getExecutionHistory();
          this._view?.webview.postMessage({
            type: 'executionHistory',
            history
          });
          break;
        }
        case 'copyTasksJson': {
          try {
            const tasks = await vscode.tasks.fetchTasks();
            // Serialize tasks to JSON-friendly format
            const tasksData = tasks.map(task => ({
              name: task.name,
              source: task.source,
              definition: task.definition,
              scope: task.scope?.name || task.scope,
              detail: task.detail,
              group: task.group ? {
                id: task.group.id,
                isDefault: task.group.isDefault
              } : undefined,
              presentationOptions: task.presentationOptions,
              isBackground: task.isBackground,
              problemMatchers: task.problemMatchers,
              runOptions: task.runOptions
            }));
            
            const jsonString = JSON.stringify(tasksData, null, 2);
            await vscode.env.clipboard.writeText(jsonString);
            vscode.window.showInformationMessage(
              `Copied ${tasks.length} task(s) JSON to clipboard`
            );
          } catch (error) {
            this._logger.error('Failed to copy tasks JSON:', error);
            vscode.window.showErrorMessage(
              `Failed to copy tasks JSON: ${error.message}`
            );
          }
          break;
        }
      }
    });
  }

  async loadDefaultMdx() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    // Check if there's navigation history - if so, load the last viewed document
    const history = await this.getNavigationHistory();
    const index = await this.getNavigationIndex();
    
    if (history.length > 0 && index >= 0 && index < history.length) {
      const lastFile = history[index];
      const cpdoxPath = path.join(workspaceFolders[0].uri.fsPath, '.cpdox');
      const lastFilePath = path.join(cpdoxPath, lastFile);
      
      // Only restore if the file still exists
      if (fs.existsSync(lastFilePath)) {
        await this.loadMdxFile(lastFile, true);
        return;
      }
      // File no longer exists - clear stale history and fall through to default
      this._logger.warn(`Previous document "${lastFile}" no longer exists, loading default`);
      await this.updateNavigationHistory([], -1);
    }

    // No history or stale history - load getting-started.mdx
    const cpdoxPath = path.join(workspaceFolders[0].uri.fsPath, '.cpdox');
    const defaultFile = path.join(cpdoxPath, 'getting-started.mdx');

    if (fs.existsSync(defaultFile)) {
      await this.loadMdxFile('getting-started.mdx');
    } else {
      this._view?.webview.postMessage({
        type: 'loadMdx',
        content: '<h1>Welcome to Control Panel</h1><p>No .cpdox directory found. Create one to get started!</p>',
        file: ''
      });
    }
  }

  async loadMdxFile(fileName, skipHistory = false) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    const cpdoxPath = path.join(workspaceFolders[0].uri.fsPath, '.cpdox');
    const filePath = path.join(cpdoxPath, fileName);

    if (!fs.existsSync(filePath)) {
      vscode.window.showErrorMessage(`MDX file not found: ${fileName}`);
      return;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Update navigation history (skip duplicates)
      if (!skipHistory) {
        let history = await this.getNavigationHistory();
        let index = await this.getNavigationIndex();
        
        // Get current file at index (if any)
        const currentFile = index >= 0 && index < history.length ? history[index] : null;
        
        // Skip if navigating to the same file
        if (currentFile !== fileName) {
          // Clear forward history when navigating to a new file
          history = history.slice(0, index + 1);
          
          // Add new file
          history.push(fileName);
          
          // Limit to 10 items
          if (history.length > 10) {
            history.shift();
          } else {
            index++;
          }
          
          await this.updateNavigationHistory(history, index);
        }
      }
      
      this._view?.webview.postMessage({
        type: 'loadMdx',
        content: content, // Send raw MDX content
        file: fileName
      });
    } catch (error) {
      this._logger.error(`Error loading MDX file "${fileName}":`, error);
      vscode.window.showErrorMessage(`Error loading MDX: ${error.message}`);
    }
  }

  async navigateBack() {
    let history = await this.getNavigationHistory();
    let index = await this.getNavigationIndex();
    
    if (index > 0) {
      index--;
      await this.updateNavigationHistory(history, index);
      await this.loadMdxFile(history[index], true); // skipHistory = true
    }
  }

  async navigateForward() {
    let history = await this.getNavigationHistory();
    let index = await this.getNavigationIndex();
    
    if (index < history.length - 1) {
      index++;
      await this.updateNavigationHistory(history, index);
      await this.loadMdxFile(history[index], true); // skipHistory = true
    }
  }

  async navigateToHistoryItem(targetIndex) {
    let history = await this.getNavigationHistory();
    
    if (targetIndex >= 0 && targetIndex < history.length) {
      // Navigate to the item and truncate forward history (browser-like behavior)
      history = history.slice(0, targetIndex + 1);
      await this.updateNavigationHistory(history, targetIndex);
      await this.loadMdxFile(history[targetIndex], true); // skipHistory = true
    }
  }

  parseMdxContent(mdxContent) {
    // Parse MDX content into structured blocks that React can render
    const blocks = [];
    const lines = mdxContent.split('\n');
    let currentBlock = { type: 'text', content: '' };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for TaskLink component
      const taskLinkMatch = line.match(/<TaskLink\s+label="([^"]+)"\s*\/>/);
      if (taskLinkMatch) {
        if (currentBlock.content.trim()) {
          blocks.push(currentBlock);
        }
        blocks.push({ type: 'TaskLink', label: taskLinkMatch[1] });
        currentBlock = { type: 'text', content: '' };
        continue;
      }
      
      // Check for TaskList component
      const taskListMatch = line.match(/<TaskList\s+labelStartsWith="([^"]+)"\s*\/>/);
      if (taskListMatch) {
        if (currentBlock.content.trim()) {
          blocks.push(currentBlock);
        }
        blocks.push({ type: 'TaskList', labelStartsWith: taskListMatch[1] });
        currentBlock = { type: 'text', content: '' };
        continue;
      }
      
      // Regular content
      currentBlock.content += line + '\n';
    }
    
    // Add final block
    if (currentBlock.content.trim()) {
      blocks.push(currentBlock);
    }
    
    return blocks;
  }

  async sendTasksToWebview() {
    const tasks = await vscode.tasks.fetchTasks();
    const taskList = await Promise.all(tasks.map(async task => {
      const dependencyInfo = await this.getTaskDependencyInfo(task);
      // No prefix for npm tasks anymore - chips will handle visual distinction
      const displayLabel = task.name;
      const taskId = this.getTaskId(task);

      // Extract command info from execution if not in definition
      let definition = task.definition;
      
      // We can inspect task.execution for shell/process tasks to get the actual command
      if (task.execution) {
        // Create a shallow copy to safely mutate for the message
        definition = { ...task.definition };
        
        // Only attempt to populate if missing both command and script
        if (!definition.command && !definition.script) {
          try {
             const exec = task.execution;
             // Handle ShellExecution
             if (exec.commandLine) {
               definition.command = exec.commandLine;
             } else if (exec.command) { 
               // ShellExecution with args
               let cmd = (typeof exec.command === 'string') ? exec.command : exec.command.value;
               if (exec.args && exec.args.length > 0) {
                 // args can be strings or ShellQuotedString
                 const formattedArgs = exec.args.map(a => {
                   if (typeof a === 'string') return a;
                   return a.value; // Handle ShellQuotedString
                 }).join(' ');
                 cmd += ` ${formattedArgs}`;
               }
               definition.command = cmd;
             } else if (exec.process) { 
                 // Handle ProcessExecution
                 let cmd = exec.process;
                 if (exec.args && exec.args.length > 0) {
                   const formattedArgs = exec.args.map(a => {
                     if (typeof a === 'string') return a;
                     return a.value;
                   }).join(' ');
                   cmd += ` ${formattedArgs}`;
                 }
                 definition.command = cmd;
             }
          } catch (e) {
            this._logger.warn(`Failed to extract execution info for task ${task.name}:`, e);
          }
        }
      }

      return {
        id: taskId,
        // 'label' field is set to task.name - kept for legacy lookup
        label: task.name,
        displayLabel: displayLabel,
        detail: task.detail || '',
        source: task.source,
        definition: definition, // Include definition for script names and paths
        dependsOn: dependencyInfo.dependsOn, // flat names for tree resolution below
        dependsOrder: dependencyInfo.dependsOrder
      };
    }));

    // Build a lookup map by label for recursive tree resolution
    const tasksByLabel = new Map();
    for (const t of taskList) {
      // Prefer Workspace tasks over npm when labels collide (VS Code convention)
      if (!tasksByLabel.has(t.label) || t.source === 'Workspace') {
        tasksByLabel.set(t.label, t);
      }
    }

    // Recursively resolve dependsOn from flat label strings into tree nodes
    const resolveDependencyTree = (depLabels, visited = new Set()) => {
      if (!depLabels || depLabels.length === 0) return [];
      return depLabels.map(depLabel => {
        const normalizedLabel = this.normalizeDependencyLabel(depLabel);
        if (!normalizedLabel) return { label: depLabel, id: null, dependsOn: [], dependsOrder: 'parallel' };

        // Cycle detection
        if (visited.has(normalizedLabel)) {
          return { label: normalizedLabel, id: null, dependsOn: [], dependsOrder: 'parallel', cycle: true };
        }
        visited.add(normalizedLabel);

        const resolved = tasksByLabel.get(normalizedLabel);
        if (!resolved) {
          return { label: normalizedLabel, id: null, dependsOn: [], dependsOrder: 'parallel' };
        }

        // Recurse into this dependency's own dependsOn
        const childDeps = resolveDependencyTree(resolved.dependsOn, new Set(visited));

        return {
          label: resolved.label,
          id: resolved.id,
          source: resolved.source,
          definition: resolved.definition,
          dependsOn: childDeps,
          dependsOrder: resolved.dependsOrder || 'parallel'
        };
      });
    };

    // Replace flat dependsOn with recursive tree on each task
    const enrichedTaskList = taskList.map(t => ({
      ...t,
      dependsOn: resolveDependencyTree(t.dependsOn)
    }));

    this._view?.webview.postMessage({
      type: 'updateTasks',
      tasks: enrichedTaskList
    });
  }

  async getTaskDependencies(task) {
    const info = await this.getTaskDependencyInfo(task);
    return info.dependsOn;
  }

  async getTaskDependencyInfo(task) {
    let dependsOn = [];
    let dependsOrder = 'parallel';

    // 1. Check definition (extension provided tasks)
    if (task.definition && task.definition.dependsOn) {
      dependsOn = Array.isArray(task.definition.dependsOn)
        ? task.definition.dependsOn
        : [task.definition.dependsOn];
      if (task.definition.dependsOrder) {
        dependsOrder = task.definition.dependsOrder;
      }
    }
    
    // 2. Check tasks.json (configured tasks)
    // Gather potential workspace folders to check
    const folders = [];
    if (task.scope && task.scope.uri) {
      folders.push(task.scope);
    } else if (vscode.workspace.workspaceFolders) {
      folders.push(...vscode.workspace.workspaceFolders);
    }

    for (const folder of folders) {
      const tasksJsonPath = path.join(folder.uri.fsPath, '.vscode', 'tasks.json');
      if (fs.existsSync(tasksJsonPath)) {
        try {
          const content = fs.readFileSync(tasksJsonPath, 'utf8');
          // Basic JSONC cleanup: remove comments and trailing commas
          const jsonContent = content
            .replace(/\/\/.*$/gm, '') // Remove // comments
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
            .replace(/,(\s*[\]}])/g, '$1'); // Remove trailing commas
            
          const config = JSON.parse(jsonContent);
          
          if (config.tasks) {
            const taskConfig = config.tasks.find(t => t.label === task.name);
            if (taskConfig) {
              if (taskConfig.dependsOn) {
                dependsOn = Array.isArray(taskConfig.dependsOn)
                  ? taskConfig.dependsOn
                  : [taskConfig.dependsOn];
              }
              if (taskConfig.dependsOrder) {
                dependsOrder = taskConfig.dependsOrder;
              }
            }
          }
        } catch (e) {
          this._logger.warn('Failed to parse tasks.json dependencies:', e);
        }
      }
    }

    return { dependsOn, dependsOrder };
  }

  // Invokes a task by name or ID
  // @param {string} labelOrId - The task name to invoke or unique ID
  async runTask(labelOrId) {
    const tasks = await vscode.tasks.fetchTasks();
    // Handle both "npm: name" format, plain task names, and unique IDs
    
    // 1. Try ID match
    let task = tasks.find(t => this.getTaskId(t) === labelOrId);
    
    // 2. Try Name match (Legacy)
    if (!task) {
      task = this._resolveTaskByName(tasks, labelOrId);
    }
    
    // 3. Try "npm: name" match (Legacy MDX)
    if (!task && labelOrId.startsWith('npm: ')) {
      const scriptName = labelOrId.substring(5); // Remove "npm: " prefix
      task = tasks.find(t => t.source === 'npm' && t.name === scriptName);
    }

    if (task) {
      const taskId = this.getTaskId(task);

      // Find the top-most parent of this task so we can clear the entire
      // previous task group from both the webview and in-memory state.
      // This ensures stale completed/failed siblings and children from a
      // prior run are removed before the new execution begins.
      let topmostParent = this._findTopmostParent(taskId);

      // Fallback: if _findTopmostParent found no in-memory parent (hierarchy
      // was already cleared by handleTaskEnded), check persisted completed
      // tasks for a parent group that previously contained this task.
      // Example: "demo:pipeline" completed (hierarchy cleared), user re-runs
      // "demo:stage-2" — we need to find and dismiss the old pipeline group.
      if (topmostParent === taskId) {
        const persisted = await this.getPersistedCompletedTasks();
        let current = taskId;
        const visited = new Set();
        while (current && !visited.has(current)) {
          visited.add(current);
          // Find any persisted entry whose subtasks array includes current
          const parentEntry = Object.entries(persisted).find(([_label, info]) =>
            info.subtasks?.includes(current)
          );
          if (parentEntry) {
            current = parentEntry[0]; // walk up to the parent
          } else {
            break;
          }
        }
        if (current !== taskId) {
          topmostParent = current;
        }
      }

      // Tell the webview to remove the entire task group from RunningTasksPanel
      this._view?.webview.postMessage({
        type: 'dismissTaskGroup',
        label: topmostParent
      });

      // Clear ALL stale in-memory state before re-run.
      // Walk the full tree from the topmost parent downward so that
      // ancestors, siblings, and all descendants are cleaned up.
      const allToClear = [topmostParent, ...this._collectAllDescendants(topmostParent)];
      for (const id of allToClear) {
        this._cancelledTasks.delete(id);
        this._taskStates.delete(id);
        this._taskStartTimes.delete(id);
        this._taskResults.delete(id);
        this._stoppingTasks.delete(id);
        this._runningTasks.delete(id);
        this._taskHierarchy.delete(id);
      }

      // Clear persisted completion record for the full tree
      await this.clearCompletedTask(topmostParent);

      // Register the full dependency tree recursively so the hierarchy
      // is fully populated before VS Code starts firing onDidStartTaskProcess
      // events for leaf tasks.
      const tasks_list = await vscode.tasks.fetchTasks();
      await this.registerDependencyTree(taskId, tasks_list);
      const subtasks = this.getTaskHierarchy(taskId);
      
      const execution = await vscode.tasks.executeTask(task);
      this._runningTasks.set(taskId, execution);
      await this.addRecentlyUsedTask(taskId);
    } else {
      vscode.window.showErrorMessage(`Task not found: ${labelOrId}`);
    }
  }

  // Stops a running task by ID
  // @param {string} labelOrId - The task ID to stop
  async stopTask(labelOrId) {
    let taskId = labelOrId;
    
    // Attempt to resolve label to ID if not found in state directly
    if (!this._runningTasks.has(taskId) && !this._taskStates.has(taskId)) {
       // If it doesn't look like an ID (no pipe), try to find it
       if (!taskId.includes('|')) {
         const tasks = await vscode.tasks.fetchTasks();
         const task = this._resolveTaskByName(tasks, taskId);
         if (task) taskId = this.getTaskId(task);
       }
    }

    let execution = this._runningTasks.get(taskId);
    const state = this._taskStates.get(taskId);
    const children = this.getTaskHierarchy(taskId);
    
    // Don't try to stop if already stopped, failed, or currently being stopped (circular dependency protection)
    if ((!execution && (!children || children.length === 0)) || state === 'stopped' || state === 'failed' || this._stoppingTasks.has(taskId)) {
      this._view?.webview.postMessage({
        type: 'taskStateChanged',
        taskLabel: taskId,
        state: state || 'stopped',
        canStop: false,
        canFocus: false
      });
      return;
    }
    
    // Mark this task as being stopped to prevent circular dependencies
    this._stoppingTasks.add(taskId);
    
    // Set stopping state and notify UI immediately
    this._taskStates.set(taskId, 'stopping');
    this._view?.webview.postMessage({
      type: 'taskStateChanged',
      taskLabel: taskId,
      state: 'stopping',
      canStop: false,
      canFocus: false
    });

    // If we have no real execution (proxy parent), try to find it from VS Code
    if (!execution) {
      try {
        const activeExecutions = vscode.tasks.taskExecutions || [];
        const match = activeExecutions.find(e => this.getTaskId(e.task) === taskId);
        if (match) {
          execution = match;
          this._logger.info(`Found real VS Code execution for proxy parent "${taskId}"`);
        }
      } catch (error) {
        this._logger.warn(`Failed to look up execution for ${taskId}:`, error);
      }
    }
    
    // Recursively collect ALL descendants (children, grandchildren, etc.)
    // so that deeply nested trees are fully stopped.
    const allDescendants = [];
    const collectDescendants = (parentId) => {
      const kids = this._taskHierarchy.get(parentId);
      if (!kids) return;
      for (const childId of kids) {
        if (!allDescendants.includes(childId)) {
          allDescendants.push(childId);
          collectDescendants(childId); // recurse into grandchildren
        }
      }
    };
    collectDescendants(taskId);

    // Build a set of all task names involved (root + descendants) for terminal matching later
    const allTaskNames = new Set();
    const rootName = taskId.includes('|') ? taskId.split('|')[1] : taskId;
    allTaskNames.add(rootName);

    // Phase 1: Cancel all descendants and terminate their executions via API
    if (allDescendants.length > 0) {
      this._logger.info(`Stopping ${allDescendants.length} descendant task(s) of "${taskId}"...`);

      // Snapshot VS Code active executions once (avoid repeated lookups)
      let activeExecutions = [];
      try {
        activeExecutions = vscode.tasks.taskExecutions || [];
      } catch (e) { /* ignore */ }

      for (const descId of allDescendants) {
        // Add to cancelled set so future VS Code events for this task are ignored
        this._cancelledTasks.add(descId);

        // Collect name for terminal sweep
        const descName = descId.includes('|') ? descId.split('|')[1] : descId;
        allTaskNames.add(descName);

        // Terminate via stored execution handle
        const descExec = this._runningTasks.get(descId);
        if (descExec) {
          try {
            descExec.terminate();
            this._logger.info(`Terminated descendant execution "${descId}"`);
          } catch (e) {
            this._logger.warn(`Failed to terminate descendant ${descId}:`, e);
          }
        } else {
          // Fallback: look up in VS Code's active executions
          const match = activeExecutions.find(e => this.getTaskId(e.task) === descId);
          if (match) {
            try {
              match.terminate();
              this._logger.info(`Terminated descendant execution "${descId}" (from VS Code taskExecutions)`);
            } catch (e) {
              this._logger.warn(`Failed to terminate descendant ${descId} from taskExecutions:`, e);
            }
          }
        }

        // Clean up descendant tracking state
        this._runningTasks.delete(descId);
        this._taskStartTimes.delete(descId);
        this._taskHierarchy.delete(descId);
        this._taskStates.delete(descId);
        this._taskResults.delete(descId);
        this._stoppingTasks.delete(descId);

        // Notify webview that descendant is stopped
        this._view?.webview.postMessage({
          type: 'taskEnded',
          taskLabel: descId,
          exitCode: 130,
          duration: 0,
          subtasks: []
        });
      }

      // Clean up root's hierarchy
      this._taskHierarchy.delete(taskId);
    }

    // Phase 2: Terminate the root task itself via API
    let stopped = false;
    try {
      if (execution) {
        execution.terminate();
        this._logger.info(`API terminate: Sent terminate signal to task "${taskId}"`);
        stopped = true;
      }
    } catch (error) {
      this._logger.warn(`API terminate failed for task ${taskId}:`, error);
    }

    // Phase 3: Single terminal sweep for root + all descendants.
    // Instead of running 5 fallback methods per node, we do one pass over
    // all terminals and dispose any that match the task tree.
    if (!stopped || allDescendants.length > 0) {
      try {
        const terminals = vscode.window.terminals;
        let killedCount = 0;

        terminals.forEach(terminal => {
          const tName = terminal.name.toLowerCase();
          for (const taskName of allTaskNames) {
            if (tName.includes(taskName.toLowerCase())) {
              try {
                terminal.sendText('\x03'); // Ctrl+C first for graceful shutdown
                terminal.dispose();
                killedCount++;
              } catch (e) { /* ignore */ }
              break; // don't double-dispose the same terminal
            }
          }
        });

        if (killedCount > 0) {
          this._logger.info(`Terminal sweep: Disposed ${killedCount} terminal(s) for task tree "${taskId}"`);
          stopped = true;
        }
      } catch (error) {
        this._logger.warn(`Terminal sweep failed for task ${taskId}:`, error);
      }
    }
    
    // Clean up tracking regardless of stop success
    this._runningTasks.delete(taskId);
    this._taskStartTimes.delete(taskId);
    this._taskHierarchy.delete(taskId);
    this._taskStates.delete(taskId);
    this._stoppingTasks.delete(taskId); // Remove from stopping set

    // Aggressively clear _cancelledTasks for all descendants.
    // handleTaskEnded may not fire for every child (race with terminal
    // disposal), leaving orphaned entries that would suppress
    // handleTaskStarted on the next run. Clean them all now.
    for (const descId of allDescendants) {
      this._cancelledTasks.delete(descId);
    }
    this._cancelledTasks.delete(taskId);
    
    this._view?.webview.postMessage({
      type: 'taskStateChanged',
      taskLabel: taskId,
      state: 'stopped',
      canStop: false,
      canFocus: false
    });
    
    // Send completion message
    this._view?.webview.postMessage({
      type: 'taskEnded',
      taskLabel: taskId,
      exitCode: stopped ? 130 : 0, // 130 = terminated by SIGINT
      duration: 0,
      subtasks: []
    });
    
    if (stopped) {
      this._logger.info(`Successfully stopped task "${taskId}"`);
    } else {
      this._logger.warn(`All stop methods failed for task "${taskId}", but cleaned up tracking`);
    }
  }

  // Brings task's terminal into focus
  // @param {string} labelOrId - The task name or ID
  async focusTaskTerminal(labelOrId) {
    const taskName = labelOrId.includes('|') ? labelOrId.split('|')[1] : labelOrId;
    
    // VS Code automatically creates terminals for tasks
    // We'll try to find the terminal by name
    const terminals = vscode.window.terminals;
    const terminal = terminals.find(t => t.name.includes(taskName));
    
    if (terminal) {
      terminal.show();
    } else {
      // Terminal doesn't exist or was closed
      this._view?.webview.postMessage({
        type: 'taskStateChanged',
        taskLabel: labelOrId,
        canFocus: false,
        message: 'Terminal not found'
      });
      vscode.window.showWarningMessage(`Terminal for task "${taskName}" not found. It may have been closed.`);
    }
  }

  // Opens the file where a task is defined
  // @param {string} labelOrId - The task name or ID
  async openTaskDefinition(labelOrId) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    let task = null;
    let searchLabel = labelOrId;

    try {
      const tasks = await vscode.tasks.fetchTasks();
      
      // Try ID
      task = tasks.find(t => this.getTaskId(t) === labelOrId);
      
      // Try label
      if (!task) {
         task = this._resolveTaskByName(tasks, labelOrId);
      }

      // Try legacy npm format
      if (!task && labelOrId.startsWith('npm: ')) {
        const scriptName = labelOrId.substring(5);
        task = tasks.find(t => t.source === 'npm' && t.name === scriptName);
      }
      
      if (task) {
          searchLabel = task.name;
      }
      
    } catch (error) {
      this._logger.warn('Failed to fetch tasks for openTaskDefinition:', error);
    }

    const source = task?.source;
    const definition = task?.definition || {};

    const openFileAtLabel = async (filePath, labelKey, labelField) => {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      let targetLine = -1;

      for (let i = 0; i < lines.length; i++) {
        if (labelField && lines[i].includes(labelField) && lines[i].includes(`"${labelKey}"`)) {
          targetLine = i;
          break;
        }
        if (!labelField && lines[i].includes(`"${labelKey}"`)) {
          targetLine = i;
          break;
        }
      }

      const document = await vscode.workspace.openTextDocument(filePath);
      const editor = await vscode.window.showTextDocument(document);

      if (targetLine >= 0) {
        const position = new vscode.Position(targetLine, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      }
    };

    try {
      if (source === 'npm') {
        const definitionPath = definition?.path;
        const basePath = definitionPath ? path.join(workspaceRoot, definitionPath) : workspaceRoot;
        const packageJsonPath = path.join(basePath, 'package.json');

        if (!fs.existsSync(packageJsonPath)) {
          vscode.window.showInformationMessage(`package.json not found. Task "${searchLabel}" may be defined elsewhere.`);
          return;
        }

        await openFileAtLabel(packageJsonPath, searchLabel, null);
        return;
      }

      const tasksJsonPath = path.join(workspaceRoot, '.vscode', 'tasks.json');
      if (!fs.existsSync(tasksJsonPath)) {
        vscode.window.showInformationMessage(`tasks.json not found. Task "${searchLabel}" may be defined elsewhere.`);
        return;
      }

      await openFileAtLabel(tasksJsonPath, searchLabel, '"label"');
    } catch (error) {
      this._logger.error(`Error opening task definition for "${searchLabel}":`, error);
      vscode.window.showErrorMessage(`Error opening task definition: ${error.message}`);
    }
  }

  handleTaskStarted(event) {
    // Serialize all task-start handling through a queue so that concurrent
    // onDidStartTaskProcess events (e.g. 3 parallel leaf tasks) don't
    // interleave and cause children to appear before their parents.
    this._taskStartQueue = (this._taskStartQueue || Promise.resolve())
      .then(() => this._handleTaskStartedImpl(event))
      .catch(err => this._logger.error('Error in handleTaskStarted:', err));
    return this._taskStartQueue;
  }

  async _handleTaskStartedImpl(event) {
    // Extract unique identifier
    const taskId = this.getTaskId(event.execution.task);
    const currentState = this._taskStates.get(taskId);
    const currentExecution = this._runningTasks.get(taskId);
    
    // Guard: skip if task is already running (prevents duplicate handling)
    if (currentState === 'running' && currentExecution) {
      this._logger.warn(`Task "${taskId}" is already running, ignoring duplicate start event`);
      return;
    }

    // Guard: skip if task was cancelled by stopTask (e.g., parent was stopped
    // while this dependency hadn't started yet)
    if (this._cancelledTasks.has(taskId)) {
      this._logger.info(`Task "${taskId}" was cancelled, ignoring start event`);
      this._cancelledTasks.delete(taskId);
      return;
    }
    
    const startTime = Date.now();
    this._logger.info(`Task started: "${taskId}"`);
    
    this._taskStartTimes.set(taskId, startTime);
    this._taskStates.set(taskId, 'running');
    this._runningTasks.set(taskId, event.execution);
    // Clear any previous result state
    this._taskResults.delete(taskId);
    // Clear persisted completion record
    this.clearCompletedTask(taskId);
    
    // Register this task's own dependencies (handles nested chains)
    try {
      await this.registerTaskDependencies(taskId);
    } catch (error) {
      this._logger.warn(`Failed to register dependencies for task ${taskId}:`, error);
    }

    // Discover parent tasks: if this task was started as a dependency of another
    // task (e.g. via VS Code's native task runner), the hierarchy may not be
    // populated yet. Scan active task executions to find parents that list this
    // task as a dependency and register the relationship.
    try {
      await this.discoverParentTasks(taskId);
    } catch (error) {
      this._logger.warn(`Failed to discover parent tasks for ${taskId}:`, error);
    }

    // Check if this task is a subtask of any running task.
    // We await ensureParentRunning so the parent's taskStarted message is
    // guaranteed to reach the webview before the child's.
    // Use label-part matching to handle source mismatches (e.g. hierarchy
    // registered "Workspace|package" but actual execution is "npm|package").
    const taskLabelPart = taskId.includes('|') ? taskId.split('|')[1] : taskId;
    let parentTaskId = null;
    for (const [parentId, subtasks] of this._taskHierarchy) {
      let isChild = subtasks.has(taskId);
      if (!isChild) {
        // Fallback: check if any subtask has the same label part
        for (const sub of subtasks) {
          const subLabel = sub.includes('|') ? sub.split('|')[1] : sub;
          if (subLabel === taskLabelPart) {
            isChild = true;
            // Also register the actual taskId so future lookups are direct
            subtasks.add(taskId);
            break;
          }
        }
      }
      if (isChild) {
        parentTaskId = parentId;
        try {
          await this.ensureParentRunning(parentId);
        } catch (err) {
          this._logger.warn(`Failed to ensure parent task running for ${parentId}:`, err);
        }
        // Notify webview that a subtask started
        this._view?.webview.postMessage({
          type: 'subtaskStarted',
          parentLabel: parentId,
          childLabel: taskId,
          parentStartTime: this._taskStartTimes.get(parentId) || Date.now()
        });
        break; // a task has at most one direct parent
      }
    }
    
    // Get task history for progress estimation
    const history = await this.getTaskHistory(taskId).catch(() => ({ count: 0, durations: [] }));
    const avgDuration = this.getAverageDuration(history.durations);
    
    this._view?.webview.postMessage({
      type: 'taskStarted',
      taskLabel: taskId,
      execution: event.execution,
      startTime,
      avgDuration,
      isFirstRun: history.count === 0,
      subtasks: this.getTaskHierarchy(taskId),
      parentTask: parentTaskId
    });
  }

  handleTaskEnded(event) {
    // Extract unique identifier
    const taskId = this.getTaskId(event.execution.task);
    const currentState = this._taskStates.get(taskId);
    
    // Guard: skip if task was already stopped (e.g., via stopTask) or has no state.
    // When a parent task is stopped, its children are added to _cancelledTasks so
    // that VS Code's subsequent onDidEndTaskProcess events are ignored.
    if (currentState === 'stopped' || currentState === 'stopping' || this._cancelledTasks.has(taskId)) {
      this._logger.info(`Task "${taskId}" is already ${currentState || 'cancelled'}, ignoring end event`);
      // Clean up any remaining state
      this._runningTasks.delete(taskId);
      this._taskStartTimes.delete(taskId);
      this._taskHierarchy.delete(taskId);
      this._taskStates.delete(taskId);
      this._taskResults.delete(taskId);
      this._cancelledTasks.delete(taskId);
      return;
    }
    
    const startTime = this._taskStartTimes.get(taskId);
    const endTime = Date.now();
    const duration = startTime ? endTime - startTime : 0;
    const exitCode = event.exitCode !== undefined ? event.exitCode : 0;
    const failed = exitCode !== 0;

    if (failed) {
      this._logger.error(`Task "${taskId}" failed with exit code ${exitCode} after ${duration}ms`);
    } else {
      this._logger.info(`Task "${taskId}" completed successfully in ${duration}ms`);
    }
    
    // Get subtasks and parent before cleaning up
    const subtasks = this.getTaskHierarchy(taskId);
    let parentId = null;
    this._taskHierarchy.forEach((children, parent) => {
      if (children.has(taskId)) {
        parentId = parent;
      }
    });
    
    // Create execution record for history
    const executionRecord = {
      id: `${taskId}-${startTime}`,
      taskLabel: taskId,
      startTime,
      endTime,
      duration,
      exitCode,
      failed,
      reason: failed ? (this._taskResults.get(taskId)?.reason || 'Task exited with non-zero code') : null,
      parentLabel: parentId,
      childLabels: subtasks
    };
    
    // Save to execution history (async, don't block)
    this.addExecutionRecord(executionRecord).catch(err => {
      this._logger.warn('Failed to save execution record:', err);
    });
    
    // Update task history with duration (only if successful)
    if (!failed) {
      this.updateTaskHistory(taskId, duration);
    }
    
    // Track result for all completed tasks (success or failure)
    const resultInfo = {
      exitCode,
      failed,
      reason: failed ? 'Task exited with non-zero code' : null,
      timestamp: Date.now(),
      duration,
      subtasks,
      parentTask: parentId
    };
    this._taskResults.set(taskId, resultInfo);
    // Persist so it survives view changes — user must explicitly dismiss
    this.saveCompletedTask(taskId, resultInfo);
    
    // Check if this task is a subtask of any running task
    const parentTasks = [];
    this._taskHierarchy.forEach((subtasks, parentId) => {
      if (subtasks.has(taskId)) {
        parentTasks.push(parentId);
        // Notify webview that a subtask ended
        this._view?.webview.postMessage({
          type: 'subtaskEnded',
          parentLabel: parentId,
          childLabel: taskId,
          exitCode,
          failed
        });
      }
    });
    
    // If this task failed, propagate failure to parent tasks
    if (failed && parentTasks.length > 0) {
      parentTasks.forEach(parentId => {
        this.propagateTaskFailure(parentId, taskId, exitCode);
      });
    }
    
    // Clean up
    this._runningTasks.delete(taskId);
    this._taskStartTimes.delete(taskId);
    this._taskHierarchy.delete(taskId);
    this._taskStates.delete(taskId);
    
    // Send unified completion message for both success and failure
    this._view?.webview.postMessage({
      type: 'taskCompleted',
      taskLabel: taskId,
      exitCode,
      failed,
      reason: this._taskResults.get(taskId)?.reason || null,
      duration,
      subtasks,
      parentTask: parentId
    });
  }

  propagateTaskFailure(parentId, failedSubtaskId, exitCode) {
    // Mark parent as failed due to dependency failure
    const parentExecution = this._runningTasks.get(parentId);

    // Compute duration and subtasks BEFORE using them in failureInfo
    const startTime = this._taskStartTimes.get(parentId) || Date.now();
    const duration = Date.now() - startTime;
    const subtasks = this.getTaskHierarchy(parentId);

    // Find grandparent early so we can include it in persisted info
    let parentOfParent = null;
    this._taskHierarchy.forEach((children, possibleParent) => {
      if (children.has(parentId)) {
        parentOfParent = possibleParent;
      }
    });

    // Set failure state for parent
    this._taskStates.set(parentId, 'failed');
    const failureInfo = {
      exitCode: -1, // Special code for dependency failure
      failed: true,
      reason: `Dependency failed: ${failedSubtaskId} (exit code ${exitCode})`,
      failedDependency: failedSubtaskId,
      timestamp: Date.now(),
      duration,
      subtasks,
      parentTask: parentOfParent
    };
    this._taskResults.set(parentId, failureInfo);
    // Persist so it survives view changes — user must explicitly dismiss
    this.saveCompletedTask(parentId, failureInfo);

    // Terminate the parent task if it actually started
    if (parentExecution) {
      try {
        parentExecution.terminate();
      } catch (error) {
        this._logger.warn(`Failed to terminate parent task ${parentId}:`, error);
      }
    }

    this._logger.error(`Task "${parentId}" failed: dependency "${failedSubtaskId}" exited with code ${exitCode}`);

    // Notify webview
    this._view?.webview.postMessage({
      type: 'taskCompleted',
      taskLabel: parentId,
      exitCode: -1,
      failed: true,
      reason: `Dependency failed: ${failedSubtaskId}`,
      failedDependency: failedSubtaskId,
      duration,
      subtasks,
      parentTask: parentOfParent
    });

    // Record failure in execution history even if parent never started

    const executionRecord = {
      id: `${parentId}-${startTime}`,
      taskLabel: parentId,
      startTime,
      endTime: Date.now(),
      duration,
      exitCode: -1,
      failed: true,
      reason: failureInfo.reason,
      parentLabel: parentOfParent,
      childLabels: subtasks
    };
    this.addExecutionRecord(executionRecord).catch(err => {
      this._logger.warn('Failed to save execution record for dependency failure:', err);
    });

    // Clean up
    this._runningTasks.delete(parentId);
    this._taskStartTimes.delete(parentId);
    this._taskHierarchy.delete(parentId);
    this._taskStates.delete(parentId);

    // Recursively propagate to grandparents
    this._taskHierarchy.forEach((subtasks, grandparentId) => {
      if (subtasks.has(parentId)) {
        this.propagateTaskFailure(grandparentId, parentId, -1);
      }
    });
  }

  _getHtmlForWebview(webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(this._context.extensionPath, 'dist', 'webview', 'webview.js'))
    );

    const htmlPath = path.join(this._context.extensionPath, 'dist', 'webview', 'webview.html');
    
    if (fs.existsSync(htmlPath)) {
      let html = fs.readFileSync(htmlPath, 'utf8');
      // Update script paths to use webview URIs
      html = html.replace(/src="([^"]+)"/g, (match, src) => {
        if (src.startsWith('http')) return match;
        const scriptPath = path.join(this._context.extensionPath, 'dist', 'webview', src);
        const scriptWebviewUri = webview.asWebviewUri(vscode.Uri.file(scriptPath));
        return `src="${scriptWebviewUri}"`;
      });
      return html;
    }

    // Fallback HTML if webpack bundle doesn't exist yet
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webview.cspSource} 'unsafe-inline'; style-src ${webview.cspSource} 'unsafe-inline';">
        <title>Control Panel</title>
    </head>
    <body>
        <div id="root"></div>
        <script src="${scriptUri}"></script>
    </body>
    </html>`;
  }
}

module.exports = MdxWebviewProvider;
