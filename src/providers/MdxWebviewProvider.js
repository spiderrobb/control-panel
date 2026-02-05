const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class MdxWebviewProvider {
  constructor(context) {
    this._context = context;
    this._view = undefined;
    this._runningTasks = new Map(); // Map<label, execution>
    this._taskHierarchy = new Map(); // Map<parentLabel, Set<childLabel>>
    this._taskStartTimes = new Map(); // Map<label, timestamp>
    this._taskTerminals = new Map(); // Map<label, terminal>
    this._taskFailures = new Map(); // Map<label, {exitCode, reason}>
    this._taskStates = new Map(); // Map<label, 'starting'|'running'|'stopping'|'stopped'|'failed'>
    this._stoppingTasks = new Set(); // Set<label> - tracks tasks currently being stopped to prevent circular dependencies
    
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

  // Task history storage management
  async getTaskHistory(label) {
    const history = this._context.globalState.get('taskHistory', {});
    return history[label] || { durations: [], count: 0 };
  }

  async updateTaskHistory(label, duration) {
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

  // Failed tasks persistence
  async getPersistedFailedTasks() {
    return this._context.globalState.get('failedTasks', {});
  }

  async saveFailedTask(label, failureInfo) {
    const failed = await this.getPersistedFailedTasks();
    failed[label] = failureInfo;
    await this._context.globalState.update('failedTasks', failed);
  }

  async clearFailedTask(label) {
    const failed = await this.getPersistedFailedTasks();
    delete failed[label];
    await this._context.globalState.update('failedTasks', failed);
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
    
    // Notify webview of new subtask
    this._view?.webview.postMessage({
      type: 'subtaskStarted',
      parentLabel,
      childLabel
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
    
    // Restore running tasks
    for (const [label, execution] of this._runningTasks.entries()) {
      const startTime = this._taskStartTimes.get(label);
      const state = this._taskStates.get(label);
      const failureInfo = this._taskFailures.get(label);
      
      if (!startTime) continue;

      const history = await this.getTaskHistory(label);
      const avgDuration = this.getAverageDuration(history.durations);
      const subtasks = this.getTaskHierarchy(label);

      // Send appropriate message based on current state
      if (failureInfo) {
        this._view?.webview.postMessage({
          type: 'taskFailed',
          taskLabel: label,
          exitCode: failureInfo.exitCode,
          reason: failureInfo.reason,
          duration: Date.now() - startTime,
          subtasks
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
          state: state || 'running'
        });
      }
    }

    // Restore persisted failed tasks
    const persistedFailures = await this.getPersistedFailedTasks();
    for (const [label, failureInfo] of Object.entries(persistedFailures)) {
      // Only restore if not currently running
      if (!this._runningTasks.has(label)) {
        this._view?.webview.postMessage({
          type: 'taskFailed',
          taskLabel: label,
          exitCode: failureInfo.exitCode,
          reason: failureInfo.reason,
          duration: failureInfo.duration || 0,
          subtasks: failureInfo.subtasks || [],
          failedDependency: failureInfo.failedDependency
        });
      }
    }
  }

  resolveWebviewView(webviewView, context, token) {
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

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          await this.loadDefaultMdx();
          await this.sendTasksToWebview();
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
        case 'getTaskLists':
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
        case 'dismissTask':
          await this.clearFailedTask(message.label);
          break;
      }
    });
  }

  async loadDefaultMdx() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

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
          
          // Limit to 20 items
          if (history.length > 20) {
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
    let currentIndex = await this.getNavigationIndex();
    
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
    const taskList = tasks.map(task => ({
      label: task.name,
      detail: task.detail || '',
      source: task.source
    }));

    this._view?.webview.postMessage({
      type: 'updateTasks',
      tasks: taskList
    });
  }

  async getTaskDependencies(task) {
    // 1. Check definition (extension provided tasks)
    if (task.definition && task.definition.dependsOn) {
      return Array.isArray(task.definition.dependsOn) 
        ? task.definition.dependsOn 
        : [task.definition.dependsOn];
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
            if (taskConfig && taskConfig.dependsOn) {
              return Array.isArray(taskConfig.dependsOn) 
                ? taskConfig.dependsOn 
                : [taskConfig.dependsOn];
            }
          }
        } catch (e) {
          console.warn('Failed to parse tasks.json dependencies:', e);
        }
      }
    }
    return [];
  }

  async runTask(label) {
    const tasks = await vscode.tasks.fetchTasks();
    const task = tasks.find(t => t.name === label);

    if (task) {
      // Clear any persisted failure when re-running
      await this.clearFailedTask(label);
      
      const startTime = Date.now();
      
      // Check if task has dependencies
      const dependencies = await this.getTaskDependencies(task);
      let subtasks = [];
      
      if (dependencies.length > 0) {
        // Register dependencies as subtasks
        dependencies.forEach(dep => {
          // Handle both string and object forms of dependsOn
          const depLabel = typeof dep === 'string' ? dep : dep.label || dep.task;
          if (depLabel) {
            this.addSubtask(label, depLabel);
            subtasks.push(depLabel);
          }
        });
      }
      
      // Immediately show parent task as running (before dependencies start)
      const history = await this.getTaskHistory(label);
      const avgDuration = this.getAverageDuration(history.durations);
      
      this._taskStartTimes.set(label, startTime);
      
      this._view?.webview.postMessage({
        type: 'taskStarted',
        taskLabel: label,
        execution: null,
        startTime,
        avgDuration,
        isFirstRun: history.count === 0,
        subtasks: subtasks
      });
      
      const execution = await vscode.tasks.executeTask(task);
      this._runningTasks.set(label, execution);
      await this.addRecentlyUsedTask(label);
    } else {
      vscode.window.showErrorMessage(`Task not found: ${label}`);
    }
  }

  async stopTask(label) {
    const execution = this._runningTasks.get(label);
    const state = this._taskStates.get(label);
    
    // Don't try to stop if already stopped, failed, or currently being stopped (circular dependency protection)
    if (!execution || state === 'stopped' || state === 'failed' || this._stoppingTasks.has(label)) {
      this._view?.webview.postMessage({
        type: 'taskStateChanged',
        taskLabel: label,
        state: state || 'stopped',
        canStop: false,
        canFocus: false
      });
      return;
    }
    
    // Mark this task as being stopped to prevent circular dependencies
    this._stoppingTasks.add(label);
    
    // Set stopping state and notify UI immediately
    this._taskStates.set(label, 'stopping');
    this._view?.webview.postMessage({
      type: 'taskStateChanged',
      taskLabel: label,
      state: 'stopping',
      canStop: false,
      canFocus: false
    });
    
    // Recursively stop all child tasks in parallel (faster termination)
    const children = this.getTaskHierarchy(label);
    if (children && children.length > 0) {
      console.log(`[ControlPanel] Stopping ${children.length} child task(s) of "${label}"...`);
      try {
        await Promise.all(children.map(childLabel => this.stopTask(childLabel)));
        
        // Clean up taskHierarchy after children are stopped
        for (const childLabel of children) {
          this.removeSubTask(label, childLabel);
        }
      } catch (error) {
        console.warn(`[ControlPanel] Error stopping children of task ${label}:`, error);
      }
    }
    
    let stopped = false;
    
    // Method 1: Try VS Code API terminate() - the standard way
    try {
      execution.terminate();
      console.log(`[ControlPanel] Method 1 (API terminate): Sent terminate signal to task "${label}"`);
      stopped = true;
    } catch (error) {
      console.warn(`[ControlPanel] Method 1 failed for task ${label}:`, error);
    }
    
    // Method 2: Try to find and dispose the terminal
    if (!stopped) {
      try {
        const terminals = vscode.window.terminals;
        const terminal = terminals.find(t => 
          t.name.includes(label) || 
          t.name === 'Task - ' + label ||
          t.name.startsWith('Task - ')
        );
        
        if (terminal) {
          terminal.dispose();
          console.log(`[ControlPanel] Method 2 (terminal dispose): Disposed terminal for task "${label}"`);
          stopped = true;
        }
      } catch (error) {
        console.warn(`[ControlPanel] Method 2 failed for task ${label}:`, error);
      }
    }
    
    // Method 3: Try to kill by process via terminal
    if (!stopped) {
      try {
        const terminals = vscode.window.terminals;
        const terminal = terminals.find(t => 
          t.name.includes(label) || 
          t.name === 'Task - ' + label ||
          t.name.startsWith('Task - ')
        );
        
        if (terminal) {
          // Send Ctrl+C signal to terminal
          terminal.sendText('\x03');
          console.log(`[ControlPanel] Method 3 (Ctrl+C): Sent SIGINT to terminal for task "${label}"`);
          
          // Wait briefly then kill if still alive
          setTimeout(() => {
            if (vscode.window.terminals.includes(terminal)) {
              terminal.dispose();
              console.log(`[ControlPanel] Method 3 (delayed dispose): Force disposed terminal for task "${label}"`);
            }
          }, 500);
          
          stopped = true;
        }
      } catch (error) {
        console.warn(`[ControlPanel] Method 3 failed for task ${label}:`, error);
      }
    }
    
    // Method 4: Force kill all terminals with similar name (nuclear option)
    if (!stopped) {
      try {
        const terminals = vscode.window.terminals;
        let killedCount = 0;
        
        terminals.forEach(terminal => {
          if (terminal.name.toLowerCase().includes(label.toLowerCase()) ||
              terminal.name.startsWith('Task - ')) {
            try {
              terminal.dispose();
              killedCount++;
            } catch (e) {
              // Ignore individual failures
            }
          }
        });
        
        if (killedCount > 0) {
          console.log(`[ControlPanel] Method 4 (force all): Disposed ${killedCount} terminal(s) for task "${label}"`);
          stopped = true;
        }
      } catch (error) {
        console.warn(`[ControlPanel] Method 4 failed for task ${label}:`, error);
      }
    }
    
    // Clean up tracking regardless of stop success
    this._runningTasks.delete(label);
    this._taskStates.set(label, 'stopped');
    this._stoppingTasks.delete(label); // Remove from stopping set
    
    this._view?.webview.postMessage({
      type: 'taskStateChanged',
      taskLabel: label,
      state: 'stopped',
      canStop: false,
      canFocus: false
    });
    
    // Send completion message
    this._view?.webview.postMessage({
      type: 'taskEnded',
      taskLabel: label,
      exitCode: stopped ? 130 : 0, // 130 = terminated by SIGINT
      duration: 0,
      subtasks: []
    });
    
    if (stopped) {
      console.log(`[ControlPanel] Successfully stopped task "${label}"`);
    } else {
      console.warn(`[ControlPanel] All stop methods failed for task "${label}", but cleaned up tracking`);
    }
  }

  async focusTaskTerminal(label) {
    // VS Code automatically creates terminals for tasks
    // We'll try to find the terminal by name
    const terminals = vscode.window.terminals;
    const terminal = terminals.find(t => t.name.includes(label));
    
    if (terminal) {
      terminal.show();
    } else {
      // Terminal doesn't exist or was closed
      this._view?.webview.postMessage({
        type: 'taskStateChanged',
        taskLabel: label,
        canFocus: false,
        message: 'Terminal not found'
      });
      vscode.window.showWarningMessage(`Terminal for task "${label}" not found. It may have been closed.`);
    }
  }

  async openTaskDefinition(label) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    // Look for tasks.json in .vscode folder
    const tasksJsonPath = path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'tasks.json');
    
    if (!fs.existsSync(tasksJsonPath)) {
      vscode.window.showInformationMessage(`tasks.json not found. Task "${label}" may be defined elsewhere.`);
      return;
    }

    try {
      // Read the tasks.json file
      const content = fs.readFileSync(tasksJsonPath, 'utf8');
      const lines = content.split('\n');
      
      // Find the line with the task label
      let targetLine = -1;
      for (let i = 0; i < lines.length; i++) {
        // Look for "label": "taskname" pattern
        if (lines[i].includes('"label"') && lines[i].includes(`"${label}"`)) {
          targetLine = i;
          break;
        }
      }
      
      // Open the document
      const document = await vscode.workspace.openTextDocument(tasksJsonPath);
      const editor = await vscode.window.showTextDocument(document);
      
      // If we found the task, move cursor to it
      if (targetLine >= 0) {
        const position = new vscode.Position(targetLine, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error opening task definition: ${error.message}`);
    }
  }

  handleTaskStarted(event) {
    const label = event.execution.task.name;
    const startTime = Date.now();
    
    this._taskStartTimes.set(label, startTime);
    this._taskStates.set(label, 'running');
    this._runningTasks.set(label, event.execution);
    // Clear any previous failure state
    this._taskFailures.delete(label);
    // Clear persisted failure
    this.clearFailedTask(label);
    
    // Check if this task is a subtask of any running task
    this._taskHierarchy.forEach((subtasks, parentLabel) => {
      if (subtasks.has(label)) {
        // Notify webview that a subtask started
        this._view?.webview.postMessage({
          type: 'subtaskStarted',
          parentLabel,
          childLabel: label
        });
      }
    });
    
    // Get task history for progress estimation
    this.getTaskHistory(label).then(history => {
      const avgDuration = this.getAverageDuration(history.durations);
      
      this._view?.webview.postMessage({
        type: 'taskStarted',
        taskLabel: label,
        execution: event.execution,
        startTime,
        avgDuration,
        isFirstRun: history.count === 0,
        subtasks: this.getTaskHierarchy(label)
      });
    });
  }

  handleTaskEnded(event) {
    const label = event.execution.task.name;
    const startTime = this._taskStartTimes.get(label);
    const duration = startTime ? Date.now() - startTime : 0;
    const exitCode = event.exitCode !== undefined ? event.exitCode : 0;
    const failed = exitCode !== 0;
    
    // Get subtasks before cleaning up
    const subtasks = this.getTaskHierarchy(label);
    
    // Update task history with duration (only if successful)
    if (!failed) {
      this.updateTaskHistory(label, duration);
    }
    
    // Update state
    this._taskStates.set(label, failed ? 'failed' : 'stopped');
    
    // Track failure if task failed
    if (failed) {
      const failureInfo = {
        exitCode,
        reason: 'Task exited with non-zero code',
        timestamp: Date.now(),
        duration,
        subtasks
      };
      this._taskFailures.set(label, failureInfo);
      // Persist failure so it survives view changes
      this.saveFailedTask(label, failureInfo);
    }
    
    // Check if this task is a subtask of any running task
    const parentTasks = [];
    this._taskHierarchy.forEach((subtasks, parentLabel) => {
      if (subtasks.has(label)) {
        parentTasks.push(parentLabel);
        // Notify webview that a subtask ended
        this._view?.webview.postMessage({
          type: 'subtaskEnded',
          parentLabel,
          childLabel: label,
          exitCode,
          failed
        });
      }
    });
    
    // If this task failed, propagate failure to parent tasks
    if (failed && parentTasks.length > 0) {
      parentTasks.forEach(parentLabel => {
        this.propagateTaskFailure(parentLabel, label, exitCode);
      });
    }
    
    // Clean up
    this._runningTasks.delete(label);
    this._taskStartTimes.delete(label);
    this._taskHierarchy.delete(label);
    
    // Send appropriate message based on success/failure
    if (failed) {
      this._view?.webview.postMessage({
        type: 'taskFailed',
        taskLabel: label,
        exitCode,
        reason: this._taskFailures.get(label)?.reason || 'Task failed',
        duration,
        subtasks
      });
    } else {
      this._view?.webview.postMessage({
        type: 'taskEnded',
        taskLabel: label,
        exitCode,
        duration,
        subtasks
      });
    }
  }

  propagateTaskFailure(parentLabel, failedSubtask, exitCode) {
    // Mark parent as failed due to dependency failure
    const parentExecution = this._runningTasks.get(parentLabel);
    if (!parentExecution) {
      return; // Parent already completed or doesn't exist
    }

    // Set failure state for parent
    this._taskStates.set(parentLabel, 'failed');
    const failureInfo = {
      exitCode: -1, // Special code for dependency failure
      reason: `Dependency failed: ${failedSubtask} (exit code ${exitCode})`,
      failedDependency: failedSubtask,
      timestamp: Date.now(),
      duration,
      subtasks
    };
    this._taskFailures.set(parentLabel, failureInfo);
    // Persist failure so it survives view changes
    this.saveFailedTask(parentLabel, failureInfo);

    // Terminate the parent task
    try {
      parentExecution.terminate();
    } catch (error) {
      console.warn(`Failed to terminate parent task ${parentLabel}:`, error);
    }

    const startTime = this._taskStartTimes.get(parentLabel);
    const duration = startTime ? Date.now() - startTime : 0;
    const subtasks = this.getTaskHierarchy(parentLabel);

    // Notify webview
    this._view?.webview.postMessage({
      type: 'taskFailed',
      taskLabel: parentLabel,
      exitCode: -1,
      reason: `Dependency failed: ${failedSubtask}`,
      failedDependency: failedSubtask,
      duration,
      subtasks
    });

    // Clean up
    this._runningTasks.delete(parentLabel);
    this._taskStartTimes.delete(parentLabel);
    this._taskHierarchy.delete(parentLabel);

    // Recursively propagate to grandparents
    this._taskHierarchy.forEach((subtasks, grandparentLabel) => {
      if (subtasks.has(parentLabel)) {
        this.propagateTaskFailure(grandparentLabel, parentLabel, -1);
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
