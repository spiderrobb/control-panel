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

  resolveWebviewView(webviewView, context, token) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this._context.extensionPath, 'dist'))
      ]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

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

  async loadMdxFile(fileName) {
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
      const parsedContent = this.parseMdxContent(content);
      
      this._view?.webview.postMessage({
        type: 'loadMdx',
        content: parsedContent,
        file: fileName
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Error loading MDX: ${error.message}`);
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

  async runTask(label) {
    const tasks = await vscode.tasks.fetchTasks();
    const task = tasks.find(t => t.name === label);

    if (task) {
      const startTime = Date.now();
      
      // Check if task has dependencies
      const definition = task.definition;
      let subtasks = [];
      
      if (definition && definition.dependsOn) {
        // Register dependencies as subtasks
        const dependencies = Array.isArray(definition.dependsOn) 
          ? definition.dependsOn 
          : [definition.dependsOn];
        
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
    } else {
      vscode.window.showErrorMessage(`Task not found: ${label}`);
    }
  }

  async stopTask(label) {
    const execution = this._runningTasks.get(label);
    if (execution) {
      execution.terminate();
      this._runningTasks.delete(label);
    }
  }

  async focusTaskTerminal(label) {
    // VS Code automatically creates terminals for tasks
    // We'll try to find the terminal by name
    const terminals = vscode.window.terminals;
    const terminal = terminals.find(t => t.name.includes(label));
    
    if (terminal) {
      terminal.show();
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
    
    // Update task history with duration
    this.updateTaskHistory(label, duration);
    
    this._runningTasks.delete(label);
    this._taskStartTimes.delete(label);
    
    // Check if this task is a subtask of any running task
    this._taskHierarchy.forEach((subtasks, parentLabel) => {
      if (subtasks.has(label)) {
        // Notify webview that a subtask ended
        this._view?.webview.postMessage({
          type: 'subtaskEnded',
          parentLabel,
          childLabel: label,
          exitCode: event.exitCode
        });
      }
    });
    
    // Get subtasks before cleaning up
    const subtasks = this.getTaskHierarchy(label);
    
    // Clean up subtasks for this task
    this._taskHierarchy.delete(label);
    
    this._view?.webview.postMessage({
      type: 'taskEnded',
      taskLabel: label,
      exitCode: event.exitCode,
      duration,
      subtasks
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
