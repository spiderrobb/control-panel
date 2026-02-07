/* eslint-disable react-hooks/exhaustive-deps */
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

// VS Code API wrapper ensures it is only acquired once
const vscode = (function() {
    try {
        return acquireVsCodeApi();
    } catch {
        // Fallback for development outside VS Code
        return {
            postMessage: (msg) => console.log('VS Code message:', msg),
            getState: () => ({}),
            setState: () => {}
        };
    }
})();

export { vscode };

export const TaskStateContext = createContext(null);

export function useTaskState() {
  return useContext(TaskStateContext);
}

export function TaskStateProvider({ children }) {
  const [tasks, setTasks] = useState([]);
  const [runningTasks, setRunningTasks] = useState({});
  const [starredTasks, setStarredTasks] = useState([]);
  const [recentlyUsedTasks, setRecentlyUsedTasks] = useState([]);
  const [executionHistory, setExecutionHistory] = useState([]);
  const [npmPathColorMap, setNpmPathColorMap] = useState({});
  const [runningTasksCollapsed, setRunningTasksCollapsed] = useState(false);
  const [starredTasksCollapsed, setStarredTasksCollapsed] = useState(false);

  // Compute average durations from execution history
  const taskHistoryMap = useMemo(() => {
    const map = {};
    
    // Group successful executions by task
    const byTask = {};
    executionHistory.forEach(exec => {
      if (!exec.failed && exec.duration) {
        if (!byTask[exec.taskLabel]) {
          byTask[exec.taskLabel] = [];
        }
        byTask[exec.taskLabel].push(exec.duration);
      }
    });
    
    // Calculate average for each task (last 10 runs)
    Object.keys(byTask).forEach(taskLabel => {
      const durations = byTask[taskLabel].slice(0, 10);
      if (durations.length > 0) {
        const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
        map[taskLabel] = avg;
      }
    });
    
    return map;
  }, [executionHistory]);

  const handleRunTask = useCallback((label) => {
    vscode.postMessage({ type: 'runTask', label });
  }, []);

  const handleStopTask = useCallback((label) => {
    vscode.postMessage({ type: 'stopTask', label });
  }, []);

  const handleFocusTerminal = useCallback((label) => {
    vscode.postMessage({ type: 'focusTerminal', label });
  }, []);

  const handleOpenDefinition = useCallback((label) => {
    vscode.postMessage({ type: 'openTaskDefinition', label });
  }, []);

  const handleToggleStar = useCallback((label) => {
    vscode.postMessage({ type: 'toggleStar', label });
  }, []);

  const handleDismissTask = useCallback((label) => {
    setRunningTasks(prev => {
      const updated = { ...prev };
      delete updated[label];
      return updated;
    });
    // Notify extension to clear persisted failure
    vscode.postMessage({ type: 'dismissTask', label });
  }, []);

  const handleToggleRunningTasksCollapsed = useCallback(() => {
    setRunningTasksCollapsed(prev => {
        const next = !prev;
        vscode.postMessage({
            type: 'setPanelState',
            state: { runningTasksCollapsed: next }
        });
        return next;
    });
  }, []);

  const handleToggleStarredTasksCollapsed = useCallback(() => {
    setStarredTasksCollapsed(prev => {
        const next = !prev;
        vscode.postMessage({
            type: 'setPanelState',
            state: { starredTasksCollapsed: next }
        });
        return next;
    });
  }, []);

  useEffect(() => {
    const messageHandler = (event) => {
      const message = event.data;
      
      switch (message.type) {
        case 'updateTasks':
          setTasks(message.tasks);
          break;
        case 'taskStarted':
          setRunningTasks(prev => {
            // Check if this task is already a subtask of another running task
            const parentEntry = Object.entries(prev).find(([_parentLabel, state]) => 
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
                parentTask: parentEntry ? parentEntry[0] : null,
                state: message.state || 'running'
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
                   // Ensure we don't remove if it started again
                   if (!current[message.taskLabel] || current[message.taskLabel].running) return current;
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
            const updated = { ...prev };
            if (!updated[message.parentLabel]) {
               // Should not happen usually if parent is running
               updated[message.parentLabel] = {
                running: true,
                startTime: message.parentStartTime || Date.now(),
                subtasks: [],
                state: 'running',
                canFocus: false
               };
            }

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
        case 'executionHistory':
          setExecutionHistory(message.history || []);
          break;
        case 'panelState':
          if (message.state?.runningTasksCollapsed !== undefined) {
              setRunningTasksCollapsed(Boolean(message.state.runningTasksCollapsed));
          }
          if (message.state?.starredTasksCollapsed !== undefined) {
              setStarredTasksCollapsed(Boolean(message.state.starredTasksCollapsed));
          }
          break;
      }
    };

    window.addEventListener('message', messageHandler);
    
    // Request initial content
    vscode.postMessage({ type: 'getTaskLists' });
    vscode.postMessage({ type: 'getPanelState' });
    vscode.postMessage({ type: 'getExecutionHistory' });

    return () => window.removeEventListener('message', messageHandler);
  }, []);

  const value = {
    tasks,
    runningTasks,
    starredTasks,
    recentlyUsedTasks,
    executionHistory,
    taskHistoryMap,
    npmPathColorMap,
    setNpmPathColorMap,
    runningTasksCollapsed,
    starredTasksCollapsed,
    onRun: handleRunTask,
    onStop: handleStopTask,
    onFocus: handleFocusTerminal,
    onOpenDefinition: handleOpenDefinition,
    onToggleStar: handleToggleStar,
    onDismissTask: handleDismissTask,
    onToggleRunningTasksCollapsed: handleToggleRunningTasksCollapsed,
    onToggleStarredTasksCollapsed: handleToggleStarredTasksCollapsed,
  };

  return (
    <TaskStateContext.Provider value={value}>
      {children}
    </TaskStateContext.Provider>
  );
}
