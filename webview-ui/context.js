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
      // Also remove all child tasks that belong to this parent
      const subtasks = updated[label]?.subtasks || [];
      subtasks.forEach(childLabel => {
        delete updated[childLabel];
      });
      // Remove any other entry whose parentTask points to this label
      Object.keys(updated).forEach(key => {
        if (updated[key]?.parentTask === label) {
          delete updated[key];
        }
      });
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
            // Determine parentTask: prefer the value from the message (set by
            // the extension), then check if subtaskStarted already set it on
            // an existing entry, then fall back to scanning other entries.
            let parentTask = message.parentTask || null;
            if (!parentTask && prev[message.taskLabel]?.parentTask) {
              parentTask = prev[message.taskLabel].parentTask;
            }
            if (!parentTask) {
              const parentEntry = Object.entries(prev).find(([_parentLabel, state]) => 
                state.subtasks?.includes(message.taskLabel) &&
                state.running // only re-attach to a parent that is still running
              );
              if (parentEntry) parentTask = parentEntry[0];
            }
            
            return {
              ...prev,
              [message.taskLabel]: {
                // Only preserve subtasks and parentTask from previous entry;
                // all other fields are reset to prevent stale completed/failed
                // state from bleeding through via spread.
                subtasks: message.subtasks || prev[message.taskLabel]?.subtasks || [],
                parentTask,
                running: true,
                startTime: message.startTime || Date.now(),
                execution: message.execution,
                avgDuration: message.avgDuration,
                isFirstRun: message.isFirstRun,
                state: message.state || 'running',
                completed: false,
                failed: false,
                exitCode: undefined,
                failureReason: null,
                failedDependency: undefined,
                duration: undefined
              }
            };
          });
          break;
        case 'taskEnded': {
          // taskEnded is sent for manually stopped tasks.
          // Mark as completed so it stays visible until the user dismisses it.
          setRunningTasks(prev => {
            if (!prev[message.taskLabel]) return prev;
            return {
              ...prev,
              [message.taskLabel]: {
                ...prev[message.taskLabel],
                running: false,
                completed: true,
                state: 'stopped'
              }
            };
          });
          break;
        }
        case 'taskCompleted':
          // Unified handler for all naturally completed tasks (success or failure).
          // The task stays visible until the user explicitly dismisses it.
          setRunningTasks(prev => {
            const updated = { ...prev };
            const existing = updated[message.taskLabel];
            const isFailed = message.failed || false;
            if (existing) {
              updated[message.taskLabel] = {
                ...existing,
                running: false,
                completed: true,
                failed: isFailed,
                exitCode: message.exitCode,
                failureReason: message.reason,
                failedDependency: message.failedDependency,
                duration: message.duration,
                state: isFailed ? 'failed' : 'completed',
                // Preserve parentTask from existing entry, or accept from message
                parentTask: existing.parentTask || message.parentTask || null
              };
            } else {
              // Task might not be in state yet (e.g. restored from persistence)
              updated[message.taskLabel] = {
                running: false,
                completed: true,
                failed: isFailed,
                exitCode: message.exitCode,
                failureReason: message.reason,
                failedDependency: message.failedDependency,
                startTime: Date.now() - (message.duration || 0),
                duration: message.duration,
                subtasks: message.subtasks || [],
                state: isFailed ? 'failed' : 'completed',
                parentTask: message.parentTask || null
              };
            }
            return updated;
          });
          break;
        case 'taskFailed':
          // Legacy handler — kept for backwards compatibility
          setRunningTasks(prev => {
            const updated = { ...prev };
            if (updated[message.taskLabel]) {
              updated[message.taskLabel].running = false;
              updated[message.taskLabel].completed = true;
              updated[message.taskLabel].failed = true;
              updated[message.taskLabel].exitCode = message.exitCode;
              updated[message.taskLabel].failureReason = message.reason;
              updated[message.taskLabel].failedDependency = message.failedDependency;
            } else {
              updated[message.taskLabel] = {
                running: false,
                completed: true,
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
               // Parent entry may not exist yet — create a placeholder
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

            // Eagerly set parentTask on the child entry so it doesn't
            // depend on message ordering in the taskStarted handler.
            if (updated[message.childLabel]) {
              updated[message.childLabel] = {
                ...updated[message.childLabel],
                parentTask: message.parentLabel
              };
            } else {
              // Child hasn't started yet — create a minimal placeholder
              updated[message.childLabel] = {
                running: false,
                parentTask: message.parentLabel,
                state: 'waiting'
              };
            }

            return updated;
          });
          break;
        case 'subtaskEnded':
          setRunningTasks(prev => {
            if (!prev[message.parentLabel]) return prev;
            
            const updated = { ...prev };

            // Keep the child in the parent's subtasks array so it remains
            // visible under the parent until the user dismisses the group.
            // Ensure the child is listed (defensive — it should already be).
            const subtasks = [...(updated[message.parentLabel].subtasks || [])];
            if (!subtasks.includes(message.childLabel)) {
              subtasks.push(message.childLabel);
            }
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
        case 'dismissTaskGroup':
          // Extension sends this before re-running a task to clear the
          // entire previous task group (topmost parent + all descendants)
          // from RunningTasksPanel so stale entries don't linger.
          setRunningTasks(prev => {
            const updated = { ...prev };
            const toRemove = new Set();
            const collect = (label) => {
              if (!label || toRemove.has(label)) return;
              toRemove.add(label);
              // Walk children via subtasks array
              const entry = updated[label];
              if (entry?.subtasks) {
                entry.subtasks.forEach(child => collect(child));
              }
            };
            collect(message.label);
            // Also catch any entry whose parentTask points into the removed set
            Object.keys(updated).forEach(key => {
              if (updated[key]?.parentTask && toRemove.has(updated[key].parentTask)) {
                toRemove.add(key);
              }
            });
            toRemove.forEach(label => delete updated[label]);
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
