import { useState, useEffect } from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import BoltIcon from '@mui/icons-material/Bolt';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import PauseIcon from '@mui/icons-material/Pause';

function TaskLink({ label, onRun, onStop, onFocus, onOpenDefinition, taskState, allRunningTasks, starredTasks, onToggleStar }) {
  const [runtime, setRuntime] = useState(0);
  const [progress, setProgress] = useState(0);

  const isRunning = taskState?.running || false;
  const isFailed = taskState?.failed || false;
  const startTime = taskState?.startTime || null;
  const avgDuration = taskState?.avgDuration || null;
  const isFirstRun = taskState?.isFirstRun || false;
  const subtasks = taskState?.subtasks || [];
  const exitCode = taskState?.exitCode;
  const failureReason = taskState?.failureReason;
  const failedDependency = taskState?.failedDependency;
  const canStop = taskState?.canStop !== false;
  const canFocus = taskState?.canFocus !== false;

  // Update runtime and progress every second when task is running
  useEffect(() => {
    if ((!isRunning && !isFailed) || !startTime) {
      setRuntime(0);
      setProgress(0);
      return;
    }

    const interval = setInterval(() => {
      const currentRuntime = Date.now() - startTime;
      setRuntime(currentRuntime);
      
      // Calculate progress based on average duration
      if (avgDuration && avgDuration > 0 && !isFailed) {
        const calculatedProgress = Math.min((currentRuntime / avgDuration) * 100, 99);
        setProgress(calculatedProgress);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, isFailed, startTime, avgDuration]);

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
    if (isFailed) return 'error';
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

  if (isRunning || isFailed) {
    const hasSubtasks = subtasks.length > 0;
    
    return (
      <div className={`task-link running ${hasSubtasks ? 'with-subtasks' : ''}`}>
        <div 
          className={`task-pill ${getBackgroundClass()}`} 
          style={getProgressStyle()}
          title={isFailed 
            ? `Failed: ${failureReason || 'Task failed'} (exit code: ${exitCode})`
            : `Running for ${formatRuntime(runtime)}${avgDuration && !isFirstRun ? ` • ${Math.floor(progress)}% complete` : ''}`}
        >
          <Tooltip title={starredTasks?.includes(label) ? 'Remove from starred tasks' : 'Add to starred tasks'}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onToggleStar?.(label);
              }}
              sx={{ p: 0.5, color: 'inherit' }}
            >
              {starredTasks?.includes(label) ? <StarIcon sx={{ fontSize: 16 }} /> : <StarBorderIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </Tooltip>
          <span 
            className="task-label"
            onDoubleClick={() => onOpenDefinition(label)}
            title="Double-click to open task definition in tasks.json"
          >{label}</span>
          {isFailed ? (
            <>
              <span className="error-badge" title={failureReason}>
                Failed {exitCode !== undefined ? `(${exitCode})` : ''}
              </span>
              {failedDependency && (
                <span className="dependency-error" title={`Dependency "${failedDependency}" failed`}>
                  ← {failedDependency}
                </span>
              )}
              <Tooltip title="Retry this task">
                <IconButton
                  size="small"
                  onClick={() => onRun(label)}
                  sx={{ p: 0.5, ml: 0.5 }}
                >
                  <PlayArrowIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </>
          ) : (
            <>
              <span className="runtime" title={`Running for ${formatRuntime(runtime)}`}>{formatRuntime(runtime)}</span>
              <Tooltip title={canFocus ? "Show terminal output for this task" : "Terminal not available"}>
                <span>
                  <IconButton
                    size="small"
                    onClick={() => onFocus(label)}
                    disabled={!canFocus}
                    sx={{ p: 0.5, ml: 0.5 }}
                  >
                    <BoltIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={canStop ? "Stop this task" : "Cannot stop task"}>
                <span>
                  <IconButton
                    size="small"
                    onClick={() => onStop(label)}
                    disabled={!canStop}
                    sx={{ p: 0.5 }}
                  >
                    <StopIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          )}
        </div>
        
        {hasSubtasks && (
          <div className="subtasks-container">
            {subtasks.map((subtask, index) => {
              const subtaskRunning = allRunningTasks?.[subtask]?.running;
              return (
                <div key={index} className="subtask-item">
                  <span className={`subtask-indicator ${subtaskRunning ? 'running' : 'waiting'}`}>
                    {subtaskRunning ? <FiberManualRecordIcon sx={{ fontSize: 12, color: '#89d185' }} /> : <PauseIcon sx={{ fontSize: 12 }} />}
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
    <span className="task-link">
      <span className="task-expanded" title={`Task: ${label}`}>
        <Tooltip title={starredTasks?.includes(label) ? 'Remove from starred tasks' : 'Add to starred tasks'}>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar?.(label);
            }}
            sx={{ p: 0.5, color: 'inherit' }}
          >
            {starredTasks?.includes(label) ? <StarIcon sx={{ fontSize: 16 }} /> : <StarBorderIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>
        <span 
          className="task-label"
          onDoubleClick={() => onOpenDefinition(label)}
          title="Double-click to open task definition in tasks.json"
        >{label}</span>
        <Tooltip title="Run this task">
          <IconButton
            size="small"
            onClick={() => onRun(label)}
            sx={{ p: 0.5, ml: 0.5 }}
          >
            <PlayArrowIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </span>
    </span>
  );
}

export default TaskLink;
