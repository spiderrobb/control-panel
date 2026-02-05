import React, { useState, useEffect } from 'react';
import TaskLink from './components/TaskLink';
import TaskList from './components/TaskList';
import RunningTasksPanel from './components/RunningTasksPanel';

// VS Code API
const vscode = acquireVsCodeApi();

function App() {
  const [contentBlocks, setContentBlocks] = useState(null);
  const [currentFile, setCurrentFile] = useState('');
  const [tasks, setTasks] = useState([]);
  const [runningTasks, setRunningTasks] = useState({});

  useEffect(() => {
    // Listen for messages from the extension
    const messageHandler = (event) => {
      const message = event.data;
      
      switch (message.type) {
        case 'loadMdx':
          setContentBlocks(message.content);
          setCurrentFile(message.file);
          break;
        case 'updateTasks':
          setTasks(message.tasks);
          break;
        case 'taskStarted':
          setRunningTasks(prev => ({
            ...prev,
            [message.taskLabel]: {
              running: true,
              startTime: message.startTime || Date.now(),
              execution: message.execution,
              avgDuration: message.avgDuration,
              isFirstRun: message.isFirstRun,
              subtasks: message.subtasks || []
            }
          }));
          break;
        case 'taskEnded':
          setRunningTasks(prev => {
            const updated = { ...prev };
            if (updated[message.taskLabel]) {
              updated[message.taskLabel].running = false;
              // Remove after a short delay for smooth transition
              setTimeout(() => {
                setRunningTasks(current => {
                  const copy = { ...current };
                  delete copy[message.taskLabel];
                  return copy;
                });
              }, 1000);
            }
            return updated;
          });
          break;
        case 'subtaskStarted':
          setRunningTasks(prev => {
            if (!prev[message.parentLabel]) return prev;
            
            const updated = { ...prev };
            const subtasks = [...(updated[message.parentLabel].subtasks || [])];
            if (!subtasks.includes(message.childLabel)) {
              subtasks.push(message.childLabel);
              updated[message.parentLabel] = {
                ...updated[message.parentLabel],
                subtasks
              };
            }
            return updated;
          });
          break;
        case 'subtaskEnded':
          setRunningTasks(prev => {
            if (!prev[message.parentLabel]) return prev;
            
            const updated = { ...prev };
            const subtasks = (updated[message.parentLabel].subtasks || [])
              .filter(label => label !== message.childLabel);
            updated[message.parentLabel] = {
              ...updated[message.parentLabel],
              subtasks
            };
            return updated;
          });
          break;
      }
    };

    window.addEventListener('message', messageHandler);
    
    // Request initial content
    vscode.postMessage({ type: 'ready' });

    return () => window.removeEventListener('message', messageHandler);
  }, []);

  const handleNavigate = (file) => {
    vscode.postMessage({ type: 'navigate', file });
  };

  const handleRunTask = (label) => {
    vscode.postMessage({ type: 'runTask', label });
  };

  const handleStopTask = (label) => {
    vscode.postMessage({ type: 'stopTask', label });
  };

  const handleFocusTerminal = (label) => {
    vscode.postMessage({ type: 'focusTerminal', label });
  };

  const handleOpenDefinition = (label) => {
    vscode.postMessage({ type: 'openTaskDefinition', label });
  };

  const renderMarkdown = (markdown) => {
    // Simple markdown to HTML conversion
    let html = markdown
      // Headers
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      // Bold and italic
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Code inline
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Lists
      .replace(/^\- (.+)$/gim, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      // Paragraphs
      .replace(/\n\n/g, '</p><p>')
      // Blockquotes
      .replace(/^> (.+)$/gim, '<blockquote>$1</blockquote>');

    // Handle links with navigation
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, href) => {
      if (href.endsWith('.mdx')) {
        return `<a href="#" data-navigate="${href}">${text}</a>`;
      }
      return `<a href="${href}" target="_blank">${text}</a>`;
    });

    // Wrap in paragraph if not already wrapped
    if (!html.startsWith('<h') && !html.startsWith('<ul') && !html.startsWith('<blockquote')) {
      html = '<p>' + html + '</p>';
    }
    
    // Fix broken tags
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p>(<h[1-6]>)/g, '$1');
    html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)<\/p>/g, '$1');
    html = html.replace(/<p>(<blockquote>)/g, '$1');
    html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');
    
    return html;
  };

  const renderContentBlock = (block, index) => {
    switch (block.type) {
      case 'TaskLink':
        return (
          <TaskLink
            key={index}
            label={block.label}
            onRun={handleRunTask}
            onStop={handleStopTask}
            onFocus={handleFocusTerminal}
            onOpenDefinition={handleOpenDefinition}
            taskState={runningTasks[block.label]}
            allRunningTasks={runningTasks}
          />
        );
      
      case 'TaskList':
        return (
          <TaskList
            key={index}
            labelStartsWith={block.labelStartsWith}
            tasks={tasks}
            onRun={handleRunTask}
            onStop={handleStopTask}
            onFocus={handleFocusTerminal}
            onOpenDefinition={handleOpenDefinition}
            runningTasks={runningTasks}
          />
        );
      
      case 'text':
      default:
        const html = renderMarkdown(block.content);
        return (
          <div
            key={index}
            dangerouslySetInnerHTML={{ __html: html }}
            onClick={(e) => {
              // Handle navigation links
              if (e.target.tagName === 'A' && e.target.dataset.navigate) {
                e.preventDefault();
                handleNavigate(e.target.dataset.navigate);
              }
            }}
          />
        );
    }
  };

  if (!contentBlocks) {
    return (
      <div className="loading">
        <p>Loading Control Panel...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {currentFile && (
        <div className="breadcrumb">
          <span className="current-file">📄 {currentFile}</span>
        </div>
      )}
      <div className="content">
        {contentBlocks.map((block, index) => renderContentBlock(block, index))}
      </div>
      <RunningTasksPanel
        runningTasks={runningTasks}
        onStop={handleStopTask}
        onFocus={handleFocusTerminal}
        onOpenDefinition={handleOpenDefinition}
      />
    </div>
  );
}

export default App;
