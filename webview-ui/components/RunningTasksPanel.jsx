import React, { useState, useEffect } from 'react';

function RunningTasksPanel({ runningTasks, onStop, onFocus, onOpenDefinition }) {
  const runningTasksList = Object.entries(runningTasks).filter(([_, state]) => state.running);

  if (runningTasksList.length === 0) {
    return null;
  }

  return (
    <div className="running-tasks-panel">
      <div className="panel-header">
        <h3>Running Tasks ({runningTasksList.length})</h3>
      </div>
      <div className="panel-content">
        {runningTasksList.map(([label, state]) => (
          <RunningTaskItem
            key={label}
            label={label}
            state={state}
            onStop={onStop}
            onFocus={onFocus}
            onOpenDefinition={onOpenDefinition}
            allRunningTasks={runningTasks}
          />
        ))}
      </div>
    </div>
  );
}

function RunningTaskItem({ label, state, onStop, onFocus, onOpenDefinition, allRunningTasks }) {
  const [runtime, setRuntime] = useState(0);
  const [progress, setProgress] = useState(0);

  const startTime = state?.startTime || null;
  const avgDuration = state?.avgDuration || null;
  const isFirstRun = state?.isFirstRun || false;
  const subtasks = state?.subtasks || [];

  useEffect(() => {
    if (!startTime) return;

    const interval = setInterval(() => {
      const currentRuntime = Date.now() - startTime;
      setRuntime(currentRuntime);
      
      if (avgDuration && avgDuration > 0) {
        const calculatedProgress = Math.min((currentRuntime / avgDuration) * 100, 99);
        setProgress(calculatedProgress);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, avgDuration]);

  const formatRuntime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const getBackgroundClass = () => {
    if (runtime > 60000) return 'bg-solid';
    if (isFirstRun || !avgDuration) return 'bg-stripes';
    return 'bg-progress';
  };

  const getProgressStyle = () => {
    if (isFirstRun || !avgDuration || runtime > 60000) {
      return {};
    }
    return {
      '--progress': `${progress}%`
    };
  };

  return (
    <div className="running-task-item">
      <div className={`task-pill ${getBackgroundClass()}`} style={getProgressStyle()}>
        <span className="status-indicator running"></span>
        <span 
          className="task-label"
          onDoubleClick={() => onOpenDefinition(label)}
          title="Double-click to open task definition"
        >{label}</span>
        <span className="runtime">{formatRuntime(runtime)}</span>
        {avgDuration && !isFirstRun && runtime <= 60000 && (
          <span className="progress-text">{Math.floor(progress)}%</span>
        )}
        <button
          className="task-button focus"
          onClick={() => onFocus(label)}
          title="Focus terminal"
        >
          ⚡
        </button>
        <button
          className="task-button stop"
          onClick={() => onStop(label)}
          title="Stop task"
        >
          ■
        </button>
      </div>
      
      {subtasks.length > 0 && (
        <div className="subtasks-container">
          {subtasks.map((subtask, index) => {
            const subtaskRunning = allRunningTasks?.[subtask]?.running;
            return (
              <div key={index} className="subtask-item">
                <span className={`subtask-indicator ${subtaskRunning ? 'running' : 'waiting'}`}>
                  {subtaskRunning ? '🟢' : '⏸'}
                </span>
                <span className="subtask-label">{subtask}</span>
                {subtaskRunning && (
                  <span className="subtask-status">running</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default RunningTasksPanel;
