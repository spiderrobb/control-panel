import { useState, useEffect } from 'react';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import LinearProgress from '@mui/material/LinearProgress';
import StopIcon from '@mui/icons-material/Stop';
import BoltIcon from '@mui/icons-material/Bolt';
import CloseIcon from '@mui/icons-material/Close';

function RunningTasksPanel({ runningTasks, onStop, onFocus, onOpenDefinition, onDismiss, onShowLogs, onRequestLogBuffer, logBuffer }) {
  const [showDebug, setShowDebug] = useState(false);
  const runningTasksList = Object.entries(runningTasks).filter(([_, state]) => state.running || state.failed);

  // Request fresh log buffer whenever debug panel is opened
  useEffect(() => {
    if (showDebug && onRequestLogBuffer) {
      onRequestLogBuffer();
      const interval = setInterval(onRequestLogBuffer, 2000);
      return () => clearInterval(interval);
    }
  }, [showDebug]);

  if (runningTasksList.length === 0) {
    return null;
  }

  // Filter to only show root-level tasks (those without a parent)
  const rootTasks = runningTasksList.filter(([_label, state]) => !state.parentTask);

  const getLevelColor = (level) => {
    switch (level) {
      case 'ERROR': return 'var(--vscode-errorForeground, #f44747)';
      case 'WARN':  return 'var(--vscode-editorWarning-foreground, #cca700)';
      case 'INFO':  return 'var(--vscode-foreground, #ccc)';
      case 'DEBUG': return 'var(--vscode-descriptionForeground, #888)';
      default:      return 'var(--vscode-foreground, #ccc)';
    }
  };

  return (
    <div className="running-tasks-panel">
      <div className="panel-header">
        <h3>Running Tasks ({runningTasksList.length})</h3>
        <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
          <Button
            variant="outlined"
            size="small"
            onClick={onShowLogs}
            sx={{ minWidth: 'auto' }}
          >
            Show Logs
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setShowDebug(!showDebug)}
            sx={{ minWidth: 'auto' }}
          >
            {showDebug ? 'Hide Debug' : 'Debug Info'}
          </Button>
        </div>
      </div>
      {showDebug && (
        <div style={{ padding: '10px', background: 'var(--vscode-editor-background)', borderBottom: '1px solid var(--vscode-panel-border)' }}>
            <p style={{ margin: '0 0 5px 0', fontSize: '11px', opacity: 0.8 }}>Task State (copy this JSON to share):</p>
            <textarea 
                readOnly
                style={{ 
                    width: '100%', 
                    height: '80px', 
                    background: 'var(--vscode-input-background)',
                    color: 'var(--vscode-input-foreground)',
                    fontFamily: 'monospace',
                    fontSize: '10px'
                }}
                value={JSON.stringify(runningTasks, null, 2)}
                onClick={(e) => e.target.select()}
            />
            <p style={{ margin: '10px 0 5px 0', fontSize: '11px', opacity: 0.8 }}>
              Recent Logs ({logBuffer?.length || 0} entries):
            </p>
            <div style={{
              maxHeight: '150px',
              overflowY: 'auto',
              background: 'var(--vscode-input-background)',
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: '3px',
              padding: '4px',
              fontFamily: 'monospace',
              fontSize: '10px',
              lineHeight: '1.5'
            }}>
              {(!logBuffer || logBuffer.length === 0) ? (
                <span style={{ opacity: 0.5 }}>No log entries yet</span>
              ) : (
                [...logBuffer].reverse().map((entry, i) => (
                  <div key={i} style={{ 
                    color: getLevelColor(entry.level),
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    borderBottom: '1px solid var(--vscode-panel-border)',
                    padding: '2px 0'
                  }}>
                    <span style={{ opacity: 0.6 }}>{entry.timestamp?.split(' ')[1] || ''}</span>
                    {' '}
                    <span style={{ fontWeight: entry.level === 'ERROR' ? 'bold' : 'normal' }}>
                      [{entry.level}]
                    </span>
                    {' '}{entry.message}
                  </div>
                ))
              )}
            </div>
        </div>
      )}
      <div className="panel-content">
        {rootTasks.map(([label, state]) => (
          <RunningTaskItem
            key={label}
            label={label}
            state={state}
            onStop={onStop}
            onFocus={onFocus}
            onOpenDefinition={onOpenDefinition}
            onDismiss={onDismiss}
            allRunningTasks={runningTasks}
            depth={0}
          />
        ))}
      </div>
    </div>
  );
}

function RunningTaskItem({ label, state, onStop, onFocus, onOpenDefinition, onDismiss, allRunningTasks, depth = 0 }) {
  const [runtime, setRuntime] = useState(0);
  const [progress, setProgress] = useState(0);

  const startTime = state?.startTime || null;
  const avgDuration = state?.avgDuration || null;
  const isFirstRun = state?.isFirstRun || false;
  const subtasks = state?.subtasks || [];
  const parentTaskLabel = state?.parentTask || null;
  const isFailed = state?.failed || false;
  const exitCode = state?.exitCode;
  const failureReason = state?.failureReason;
  const failedDependency = state?.failedDependency;
  const canStop = state?.canStop !== false;
  const canFocus = state?.canFocus !== false;
  const taskState = state?.state; // 'starting'|'running'|'stopping'|'stopped'|'failed'
  const isStopping = taskState === 'stopping';

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

  return (
    <>
      <div className="running-task-row" style={{ paddingLeft: `${16 + depth * 20}px` }}>
        <div className="task-row-content">
          <div className="task-info">
            <span className={`status-dot ${isFailed ? 'failed' : ''}`}></span>
            <div className="task-name-container">
              {parentTaskLabel && (
                <span className="parent-task-name">{parentTaskLabel}</span>
              )}
              <span 
                className="task-name"
                onDoubleClick={() => onOpenDefinition(label)}
                title="Double-click to open task definition"
              >{label}</span>
            </div>
            {isFailed ? (
              <>
                <span className="task-error-badge" title={failureReason}>
                  Failed {exitCode !== undefined ? `(${exitCode})` : ''}
                </span>
                {failedDependency && (
                  <span className="task-dependency-error" title={`Dependency "${failedDependency}" failed`}>
                    ← {failedDependency}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="task-runtime">{formatRuntime(runtime)}</span>
                {avgDuration && !isFirstRun && runtime <= 60000 && (
                  <span className="task-progress-text">{Math.floor(progress)}%</span>
                )}
              </>
            )}
          </div>
          <div className="task-actions">
            <Tooltip title={canFocus ? "Focus terminal" : "Terminal not available"}>
              <span>
                <IconButton
                  size="small"
                  onClick={() => onFocus(label)}
                  disabled={!canFocus || isFailed}
                  sx={{ p: 0.5 }}
                >
                  <BoltIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </span>
            </Tooltip>
            {isFailed ? (
              <Tooltip title="Dismiss failed task">
                <span>
                  <IconButton
                    size="small"
                    onClick={() => onDismiss(label)}
                    sx={{ p: 0.5 }}
                  >
                    <CloseIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </span>
              </Tooltip>
            ) : (
              <Tooltip title={isStopping ? "Stopping..." : (canStop ? "Stop task" : "Cannot stop task")}>
                <span>
                  <IconButton
                    size="small"
                    onClick={() => onStop(label)}
                    disabled={!canStop || isFailed || isStopping}
                    sx={{ p: 0.5 }}
                  >
                    <StopIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </div>
        </div>
        {!isFailed && avgDuration && !isFirstRun && runtime <= 60000 && (
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{ width: '100%', height: 4, mt: 0.5 }}
          />
        )}
        {!isFailed && isFirstRun && (
          <LinearProgress
            sx={{ width: '100%', height: 4, mt: 0.5 }}
          />
        )}
      </div>
      
      {subtasks.map((subtask, index) => {
        const subtaskState = allRunningTasks?.[subtask];
        if (!subtaskState?.running) {
          // Show waiting subtask
          return (
            <div key={index} className="running-task-row waiting" style={{ paddingLeft: `${16 + (depth + 1) * 20}px` }}>
              <div className="task-info">
                <span className="status-dot waiting"></span>
                <div className="task-name-container">
                  <span className="parent-task-name">{label}</span>
                  <span className="task-name">{subtask}</span>
                </div>
                <span className="task-status-text">waiting</span>
              </div>
            </div>
          );
        }
        // Show running subtask recursively
        return (
          <RunningTaskItem
            key={subtask}
            label={subtask}
            state={subtaskState}
            onStop={onStop}
            onFocus={onFocus}
            onOpenDefinition={onOpenDefinition}
            onDismiss={onDismiss}
            allRunningTasks={allRunningTasks}
            depth={depth + 1}
          />
        );
      })}
    </>
  );
}

export default RunningTasksPanel;
