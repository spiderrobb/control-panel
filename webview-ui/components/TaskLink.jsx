import React, { useState, useEffect } from 'react';

function TaskLink({ label, onRun, onStop, onFocus, onOpenDefinition, taskState, allRunningTasks }) {
  const [isHovered, setIsHovered] = useState(false);
  const [runtime, setRuntime] = useState(0);
  const [progress, setProgress] = useState(0);

  const isRunning = taskState?.running || false;
  const startTime = taskState?.startTime || null;
  const avgDuration = taskState?.avgDuration || null;
  const isFirstRun = taskState?.isFirstRun || false;
  const subtasks = taskState?.subtasks || [];

  // Update runtime and progress every second when task is running
  useEffect(() => {
    if (!isRunning || !startTime) {
      setRuntime(0);
      setProgress(0);
      return;
    }

    const interval = setInterval(() => {
      const currentRuntime = Date.now() - startTime;
      setRuntime(currentRuntime);
      
      // Calculate progress based on average duration
      if (avgDuration && avgDuration > 0) {
        const calculatedProgress = Math.min((currentRuntime / avgDuration) * 100, 99);
        setProgress(calculatedProgress);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, startTime, avgDuration]);

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

  // Determine background style based on state
  const getBackgroundClass = () => {
    if (!isRunning) return '';
    
    // Solid blue for tasks over 1 minute
    if (runtime > 60000) return 'bg-solid';
    
    // First run: diagonal stripes
    if (isFirstRun || !avgDuration) return 'bg-stripes';
    
    // Subsequent runs: progress gradient
    return 'bg-progress';
  };

  const getProgressStyle = () => {
    if (!isRunning || isFirstRun || !avgDuration || runtime > 60000) {
      return {};
    }
    return {
      '--progress': `${progress}%`
    };
  };

  if (isRunning) {
    const hasSubtasks = subtasks.length > 0;
    
    return (
      <div className={`task-link running ${hasSubtasks ? 'with-subtasks' : ''}`}>
        <div className={`task-pill ${getBackgroundClass()}`} style={getProgressStyle()}>
          <span className="status-indicator running"></span>
          <span 
            className="task-label"
            onDoubleClick={() => onOpenDefinition(label)}
            title="Double-click to open task definition"
          >{label}</span>
          <span className="runtime">{formatRuntime(runtime)}</span>
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
        
        {hasSubtasks && (
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

  return (
    <span
      className={`task-link ${isHovered ? 'hovered' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isHovered ? (
        <span className="task-expanded">
          <span className="status-indicator idle"></span>
          <span 
            className="task-label"
            onDoubleClick={() => onOpenDefinition(label)}
            title="Double-click to open task definition"
          >{label}</span>
          <button
            className="task-button run"
            onClick={() => onRun(label)}
            title="Run task"
          >
            ▶
          </button>
        </span>
      ) : (
        <span className="task-label-simple">{label}</span>
      )}
    </span>
  );
}

export default TaskLink;
