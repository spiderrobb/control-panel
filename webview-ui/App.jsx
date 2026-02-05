import React, { useState, useEffect, useMemo } from 'react';
import { evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import DescriptionIcon from '@mui/icons-material/Description';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import * as MuiIcons from '@mui/icons-material';
import TaskLink from './components/TaskLink';
import TaskList from './components/TaskList';
import RunningTasksPanel from './components/RunningTasksPanel';
import RecentTasksList from './components/RecentTasksList';
import StarredTasksList from './components/StarredTasksList';

// VS Code API
const vscode = acquireVsCodeApi();

function App() {
  const [mdxContent, setMdxContent] = useState(null);
  const [currentFile, setCurrentFile] = useState('');
  const [tasks, setTasks] = useState([]);
  const [runningTasks, setRunningTasks] = useState({});
  const [recentlyUsedTasks, setRecentlyUsedTasks] = useState([]);
  const [starredTasks, setStarredTasks] = useState([]);

  useEffect(() => {
    // Listen for messages from the extension
    const messageHandler = (event) => {
      const message = event.data;
      
      switch (message.type) {
        case 'loadMdx':
          setMdxContent(message.content);
          setCurrentFile(message.file);
          break;
        case 'updateTasks':
          setTasks(message.tasks);
          break;
        case 'taskStarted':
          setRunningTasks(prev => {
            // Check if this task is already a subtask of another running task
            const parentEntry = Object.entries(prev).find(([parentLabel, state]) => 
              state.subtasks?.includes(message.taskLabel)
            );
            
            return {
              ...prev,
              [message.taskLabel]: {
                running: true,
                startTime: message.startTime || Date.now(),
                execution: message.execution,
                avgDuration: message.avgDuration,
                isFirstRun: message.isFirstRun,
                subtasks: message.subtasks || [],
                parentTask: parentEntry ? parentEntry[0] : null
              }
            };
          });
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
        case 'taskFailed':
          setRunningTasks(prev => {
            const updated = { ...prev };
            if (updated[message.taskLabel]) {
              updated[message.taskLabel].running = false;
              updated[message.taskLabel].failed = true;
              updated[message.taskLabel].exitCode = message.exitCode;
              updated[message.taskLabel].failureReason = message.reason;
              updated[message.taskLabel].failedDependency = message.failedDependency;
            } else {
              // Task might not be in state yet, add it as failed
              updated[message.taskLabel] = {
                running: false,
                failed: true,
                exitCode: message.exitCode,
                failureReason: message.reason,
                failedDependency: message.failedDependency,
                startTime: Date.now() - (message.duration || 0),
                subtasks: message.subtasks || []
              };
            }
            // Keep failed tasks visible longer (5 seconds)
            setTimeout(() => {
              setRunningTasks(current => {
                const copy = { ...current };
                delete copy[message.taskLabel];
                return copy;
              });
            }, 5000);
            return updated;
          });
          break;
        case 'taskStateChanged':
          setRunningTasks(prev => {
            if (!prev[message.taskLabel]) return prev;
            const updated = { ...prev };
            updated[message.taskLabel] = {
              ...updated[message.taskLabel],
              state: message.state,
              canStop: message.canStop !== undefined ? message.canStop : true,
              canFocus: message.canFocus !== undefined ? message.canFocus : true
            };
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
            
            // If subtask failed, mark it in parent's state
            if (message.failed) {
              if (!updated[message.parentLabel].failedSubtasks) {
                updated[message.parentLabel].failedSubtasks = [];
              }
              updated[message.parentLabel].failedSubtasks.push({
                label: message.childLabel,
                exitCode: message.exitCode
              });
            }
            
            return updated;
          });
          break;
        case 'updateRecentlyUsed':
          setRecentlyUsedTasks(message.tasks);
          break;
        case 'updateStarred':
          setStarredTasks(message.tasks);
          break;
        case 'error':
          console.warn(message.message);
          break;
      }
    };

    window.addEventListener('message', messageHandler);
    
    // Request initial content
    vscode.postMessage({ type: 'ready' });
    vscode.postMessage({ type: 'getTaskLists' });

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

  const handleToggleStar = (label) => {
    vscode.postMessage({ type: 'toggleStar', label });
  };

  // State for compiled MDX component
  const [MdxModule, setMdxModule] = useState(null);
  const [mdxError, setMdxError] = useState(null);
  const [isCompiling, setIsCompiling] = useState(false);

  // Create MDX components object with all available components
  const mdxComponents = useMemo(() => ({
    // Custom task components
    TaskLink: (props) => (
      <TaskLink
        {...props}
        onRun={handleRunTask}
        onStop={handleStopTask}
        onFocus={handleFocusTerminal}
        onOpenDefinition={handleOpenDefinition}
        taskState={runningTasks[props.label]}
        allRunningTasks={runningTasks}
        starredTasks={starredTasks}
        onToggleStar={handleToggleStar}
      />
    ),
    TaskList: (props) => (
      <TaskList
        {...props}
        tasks={tasks}
        onRun={handleRunTask}
        onStop={handleStopTask}
        onFocus={handleFocusTerminal}
        onOpenDefinition={handleOpenDefinition}
        runningTasks={runningTasks}
        starredTasks={starredTasks}
        onToggleStar={handleToggleStar}
      />
    ),
    // Material UI components
    Button,
    IconButton,
    Typography,
    Chip,
    // All Material UI icons
    ...MuiIcons,
    // Custom link handler for .mdx navigation
    a: (props) => {
      if (props.href?.endsWith('.mdx')) {
        return (
          <a
            {...props}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              handleNavigate(props.href);
            }}
          />
        );
      }
      return <a {...props} target="_blank" rel="noopener noreferrer" />;
    }
  }), [tasks, runningTasks, starredTasks]);

  // Compile MDX content when it changes
  useEffect(() => {
    if (!mdxContent) {
      setMdxModule(null);
      return;
    }

    async function compileMDX() {
      setIsCompiling(true);
      setMdxError(null);
      
      try {
        // Evaluate MDX with components available
        const { default: MDXComponent } = await evaluate(mdxContent, {
          ...runtime,
          development: false,
          useMDXComponents: () => mdxComponents
        });
        setMdxModule(() => MDXComponent);
      } catch (err) {
        console.error('MDX compilation error:', err);
        setMdxError(err.message);
      } finally {
        setIsCompiling(false);
      }
    }

    compileMDX();
  }, [mdxContent, mdxComponents]);

  if (!mdxContent) {
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
          <DescriptionIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
          <span className="current-file">{currentFile}</span>
        </div>
      )}
      <div className="content">
        {mdxError && (
          <div style={{ color: 'var(--vscode-errorForeground)', padding: '20px' }}>
            Error compiling MDX: {mdxError}
          </div>
        )}
        {isCompiling && <div style={{ padding: '20px' }}>Compiling MDX...</div>}
        {!mdxError && !isCompiling && MdxModule && <MdxModule />}
      </div>
      <RunningTasksPanel
        runningTasks={runningTasks}
        onStop={handleStopTask}
        onFocus={handleFocusTerminal}
        onOpenDefinition={handleOpenDefinition}
      />
      <RecentTasksList 
        tasks={recentlyUsedTasks}
        onRun={handleRunTask}
        onToggleStar={handleToggleStar}
        starredTasks={starredTasks}
      />
      <StarredTasksList 
        tasks={starredTasks}
        onRun={handleRunTask}
        onToggleStar={handleToggleStar}
      />
    </div>
  );
}

export default App;
