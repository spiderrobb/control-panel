import React, { useState, useEffect } from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import BoltIcon from '@mui/icons-material/Bolt';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import PauseIcon from '@mui/icons-material/Pause';
import { useTaskState } from '../context';

// Define 10 VS Code theme colors for npm path color-coding
const NPM_CHIP_COLORS = [
  'var(--vscode-charts-blue)',
  'var(--vscode-charts-green)',
  'var(--vscode-charts-orange)',
  'var(--vscode-charts-purple)',
  'var(--vscode-charts-yellow)',
  'var(--vscode-charts-red)',
  'var(--vscode-charts-cyan)',
  'var(--vscode-charts-pink)',
  'var(--vscode-terminal-ansiMagenta)',
  'var(--vscode-terminal-ansiBrightBlue)'
];

// Normalize npm path for consistent color assignment
const normalizePath = (path) => {
  if (!path) return '';
  return path.trim().toLowerCase().replace(/^\.\//, '');
};

function TaskLink({ label, taskId, displayLabel, disabled = false }) {
  const {
      tasks,
      runningTasks,
      onRun,
      onStop,
      onFocus,
      onOpenDefinition,
      starredTasks,
      onToggleStar,
      npmPathColorMap,
      setNpmPathColorMap,
      taskHistoryMap
  } = useTaskState();

  const [runtime, setRuntime] = useState(0);
  const [progress, setProgress] = useState(0);
  const [segmentTick, setSegmentTick] = useState(0);
  const [popoverAnchor, setPopoverAnchor] = useState(null);
  const [popoverContent, setPopoverContent] = useState(null);
  
  // Get current task info - prefer ID if available
  let currentTask = taskId ? tasks.find(t => t.id === taskId) : null;
  
  // Fallback to label lookup if ID not found or not provided
  if (!currentTask && tasks.length > 0) {
      if (taskId) {
        currentTask = tasks.find(t => t.id === taskId);
      } else if (label) {
        const matching = tasks.filter(t => t.label === label);
        currentTask = matching.find(t => t.source === 'Workspace') || matching[0];
        
        // Handle "npm: " prefix for legacy MDX support
        if (!currentTask && label.startsWith('npm: ')) {
          const scriptName = label.substring(5);
          currentTask = tasks.find(t => t.source === 'npm' && t.label === scriptName);
        }
      }
  }
    
  // Detect if task definition is missing
  const taskNotFound = !currentTask;
  const resolvedLabel = currentTask?.label || label;
  const resolvedId = currentTask?.id;
  
  const isNpmTask = currentTask?.source === 'npm';
  const npmPath = currentTask?.definition?.path;
  const scriptName = currentTask?.definition?.script;
  
  // For npm tasks, use script name from definition, otherwise use displayLabel/label
  const displayText = isNpmTask && scriptName ? scriptName : (displayLabel || resolvedLabel);
  
  // Get or assign color for npm path
  const getNpmColor = (path) => {
    if (!path) return NPM_CHIP_COLORS[0];
    const normalized = normalizePath(path);
    
    if (npmPathColorMap && npmPathColorMap[normalized]) {
      return npmPathColorMap[normalized];
    }
    
    // Assign new color
    if (setNpmPathColorMap) {
      const assignedColors = Object.values(npmPathColorMap || {});
      const nextColorIndex = assignedColors.length % NPM_CHIP_COLORS.length;
      const newColor = NPM_CHIP_COLORS[nextColorIndex];
      // Note: We avoid setting state in render, ideally this should be done in an effect or event
      // For now, we return default if not set, and rely on app consistent hashing if simpler
      // But preserving original behavior:
      // setNpmPathColorMap is called here in original code, which is risky for render loops
      // but if cached, it returns immediately.
      // We will skip calling set state here to avoid loops in this refactor and just pick based on hash or index
      // But assuming the context provides the map.
    }
    
    // Simple deterministic color if not in map
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
        hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % NPM_CHIP_COLORS.length;
    return NPM_CHIP_COLORS[index];
  };

  const taskState = runningTasks[resolvedId] || runningTasks[label];

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
  
  const dependencySegments = currentTask?.dependsOn || [];
  const dependsOrder = currentTask?.dependsOrder;
  
  const hasDependencies = dependencySegments.length > 0;
  const hasRunningSegment = isRunning || dependencySegments.some(dep => runningTasks[dep]?.running);

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

  useEffect(() => {
    if (!hasRunningSegment) {
      return;
    }

    const interval = setInterval(() => {
      setSegmentTick(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [hasRunningSegment]);

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
    
    // First run: gentle shimmer
    if (isFirstRun || !avgDuration) return 'bg-shimmer';
    
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

  const getSegmentState = (taskLabel) => {
      // Find task ID for this label if possible
      const t = tasks.find(t => t.label === taskLabel);
      const tid = t?.id || taskLabel;
      const state = runningTasks[tid] || runningTasks[taskLabel];

    if (state?.failed) return 'error';
    if (state?.running) return 'running';
    return 'idle';
  };

  const getParentDependencyState = () => {
    if (!hasDependencies) {
      if (isFailed) return 'error';
      if (isRunning) return 'running';
      return 'idle';
    }

    const childStates = dependencySegments.map(getSegmentState);
    if (failedDependency || childStates.includes('error')) return 'error';
    if (childStates.includes('running')) return 'running';
    if (isFailed) return 'error';
    if (isRunning) return 'running';
    return 'idle';
  };

  const parentDependencyState = getParentDependencyState();

  const getSegmentStateWithParent = (taskLabel) => {
    const segmentState = getSegmentState(taskLabel);
    if (segmentState === 'error' || segmentState === 'running') {
      return segmentState;
    }
    // If parent is in error state but this segment is not, mark as success
    if (parentDependencyState === 'error' && segmentState === 'idle') {
      return 'success';
    }
    return segmentState;
  };

  const getParentBackgroundClass = () => {
    if (parentDependencyState === 'error') return 'error';
    if (parentDependencyState === 'running') return 'bg-solid bg-shimmer';
    return '';
  };

  const getSegmentProgressInfo = (segmentLabel, segmentState) => {
    if (segmentState === 'success' || segmentState === 'error') {
      return { progress: 100, indeterminate: false };
    }
    
    const t = tasks.find(t => t.label === segmentLabel);
    const tid = t?.id || segmentLabel;
    const segmentTaskState = runningTasks[tid] || runningTasks[segmentLabel];

    if (!segmentTaskState?.running || !segmentTaskState?.startTime) {
      return { progress: 0, indeterminate: false };
    }

    if (!segmentTaskState?.avgDuration || segmentTaskState.avgDuration <= 0) {
      return { progress: 35, indeterminate: true };
    }

    const now = segmentTick || Date.now();
    const elapsed = now - segmentTaskState.startTime;
    const progressValue = Math.min((elapsed / segmentTaskState.avgDuration) * 100, 99);
    return { progress: progressValue, indeterminate: false };
  };

  const calculateAvgDuration = (taskLabel) => {
    // If task is running, use its avgDuration from state (most up-to-date)
    const t = tasks.find(t => t.label === taskLabel);
    const tid = t?.id || taskLabel;
    const runningState = runningTasks[tid] || runningTasks[taskLabel];

    if (runningState?.avgDuration) {
      return runningState.avgDuration;
    }
    
    // Otherwise, use historical data from execution history
    return taskHistoryMap[tid] || taskHistoryMap[taskLabel] || null;
  };

  const getTaskInfo = (taskLabel) => {
    let taskData = tasks?.find(t => t.id === taskLabel);
    if (!taskData) {
      const matching = tasks?.filter(t => t.label === taskLabel) || [];
      taskData = matching.find(t => t.source === 'Workspace') || matching[0];
    }
    
    // Helper to determine source file
    const getSourceFile = (task, idOrLabel) => {
      // If we have the task object and it is npm
      if (task?.source === 'npm') {
        if (task?.definition?.path) {
          return `${task.definition.path}/package.json`;
        }
        return 'package.json';
      }

      // Fallback: If ID looks like an npm task, assume root package.json
      if (typeof idOrLabel === 'string' && idOrLabel.startsWith('npm|')) {
        return 'package.json';
      }

      return 'tasks.json';
    };
    
    // Helper to format command string with task type
    const formatCommandString = (task) => {
      if (!task) return 'No command defined';
      const taskType = task.source || 'unknown';
      const command = task.definition?.command || task.definition?.script || '';
      return command ? `${taskType}: ${command}` : `${taskType}: `;
    };
    
    // Check if we are looking at the main task or a dependency
    const isMainTask = taskLabel === label || taskLabel === resolvedId;
    
    if (isMainTask) {
      return {
        name: label,
        source: currentTask?.source,
        sourceFile: getSourceFile(currentTask, taskLabel),
        script: formatCommandString(currentTask),
        status: isFailed ? 'failed' : (isRunning ? 'running' : 'idle'),
        duration: runtime,
        progress: progress,
        avgDuration: calculateAvgDuration(taskLabel),
        exitCode: exitCode,
        failureReason: failureReason
      };
    }
    
    const t = tasks.find(t => t.label === taskLabel);
    const tid = t?.id || taskLabel;
    const segmentState = runningTasks[tid] || runningTasks[taskLabel];
    
    return {
      name: taskData?.label || taskLabel,
      source: taskData?.source || 'unknown',
      sourceFile: getSourceFile(taskData, taskLabel),
      script: formatCommandString(taskData),
      status: segmentState?.failed ? 'failed' : (segmentState?.running ? 'running' : 'idle'),
      duration: segmentState?.startTime ? Date.now() - segmentState.startTime : 0,
      avgDuration: calculateAvgDuration(taskLabel),
      exitCode: segmentState?.exitCode,
      failureReason: segmentState?.failureReason
    };
  };

  const handleSegmentHover = (event, taskLabel) => {
    setPopoverAnchor(event.currentTarget);
    setPopoverContent(getTaskInfo(taskLabel));
  };

  const handleSegmentLeave = () => {
    setPopoverAnchor(null);
    setPopoverContent(null);
  };

  const getDisplayLabel = (taskLabel) => {
    const taskData = tasks?.find(t => t.id === taskLabel || t.label === taskLabel);
    if (taskData?.source === 'npm' && taskData?.definition?.script) {
      return taskData.definition.script;
    }
    return taskData?.displayLabel || taskLabel;
  };
  
  const getTaskSource = (taskLabel) => {
    const task = tasks?.find(t => t.id === taskLabel || t.label === taskLabel);
    return task?.source;
  };
  
  const getTaskNpmPath = (taskLabel) => {
    const task = tasks?.find(t => t.id === taskLabel || t.label === taskLabel);
    return task?.definition?.path;
  };

  const renderSegment = (segmentLabel, state, isParent = false, style = undefined) => {
    const progressInfo = getSegmentProgressInfo(segmentLabel, state);
    const segmentDisplayLabel = isParent ? displayText : getDisplayLabel(segmentLabel);
    const segmentSource = isParent ? currentTask?.source : getTaskSource(segmentLabel);
    const segmentNpmPath = isParent ? npmPath : getTaskNpmPath(segmentLabel);
    const segmentIsNpm = segmentSource === 'npm';
    
    return (
      <span
        key={segmentLabel}
        className={`task-segment segment-${state} ${isParent ? 'segment-parent' : 'segment-child'} ${progressInfo.indeterminate ? 'segment-indeterminate' : ''}`}
        onDoubleClick={disabled || taskNotFound ? undefined : () => onOpenDefinition(segmentLabel)}
        onMouseEnter={(e) => handleSegmentHover(e, segmentLabel)}
        onMouseLeave={handleSegmentLeave}
        style={{
          ...style,
          '--segment-progress': `${progressInfo.progress}%`
        }}
      >
        {segmentIsNpm && (
          <Chip
            label="npm"
            size="small"
            sx={{
              height: 18,
              fontSize: '10px',
              fontWeight: 600,
              marginRight: '6px',
              backgroundColor: getNpmColor(segmentNpmPath),
              color: 'var(--vscode-button-foreground)',
              '& .MuiChip-label': {
                padding: '0 6px'
              }
            }}
          />
        )}
        {segmentDisplayLabel}
        <span className={`segment-timer ${progressInfo.indeterminate ? 'segment-timer-indeterminate' : ''}`} />
      </span>
    );
  };

  const renderSequentialSegments = () => (
    <div className="task-segments task-segments-sequence">
      {renderSegment(label, parentDependencyState, true)}
      {dependencySegments.map(dep => renderSegment(dep, getSegmentStateWithParent(dep)))}
    </div>
  );

  const renderParallelSegments = () => (
    <div className="task-segments task-segments-parallel" style={{ '--rows': dependencySegments.length }}>
      {renderSegment(label, parentDependencyState, true, {
        gridRow: `1 / span ${dependencySegments.length}`,
        borderRight: '1px solid var(--vscode-button-border)'
      })}
      {dependencySegments.map((dep, index) => (
        renderSegment(dep, getSegmentStateWithParent(dep), false, {
          gridColumn: 2,
          gridRow: index + 1,
          borderBottom: index === dependencySegments.length - 1 ? 'none' : '1px solid var(--vscode-button-border)'
        })
      ))}
    </div>
  );

  const renderCompositeSegments = () => {
    if (!hasDependencies) {
      return (
        <span
          className="task-label"
          onDoubleClick={disabled || taskNotFound ? undefined : () => onOpenDefinition(resolvedId || label)}
          title={disabled || taskNotFound ? undefined : "Double-click to open task definition in tasks.json"}
        >
          {isNpmTask && (
            <Chip
              label="npm"
              size="small"
              sx={{
                height: 18,
                fontSize: '10px',
                fontWeight: 600,
                marginRight: '6px',
                backgroundColor: getNpmColor(npmPath),
                color: 'var(--vscode-button-foreground)',
                '& .MuiChip-label': {
                  padding: '0 6px'
                }
              }}
            />
          )}
          {displayText}
        </span>
      );
    }

    if (dependsOrder === 'parallel') {
      return renderParallelSegments();
    }

    return renderSequentialSegments();
  };

  const tooltipTitle = taskNotFound ? 'Task not found' : '';
  const containerSx = taskNotFound 
    ? { opacity: 0.8 }
    : disabled 
    ? { 
        backgroundColor: 'var(--vscode-input-background)',
        color: 'var(--vscode-descriptionForeground)',
        opacity: 0.6,
        cursor: 'not-allowed'
      }
    : {};

  if (isRunning || isFailed) {
    const hasSubtasks = subtasks.length > 0 && !hasDependencies;
    
    const content = (
      <>
        <div className={`task-link running ${hasSubtasks ? 'with-subtasks' : ''}`}>
          <div 
            className={`task-pill ${hasDependencies ? getParentBackgroundClass() : getBackgroundClass()}`} 
            style={getProgressStyle()}
            onMouseEnter={(e) => handleSegmentHover(e, resolvedId || label)}
            onMouseLeave={handleSegmentLeave}
          >
          <Tooltip title={disabled || taskNotFound ? '' : (starredTasks?.includes(resolvedId || label) ? 'Remove from starred tasks' : 'Add to starred tasks')}>
            <span>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStar?.(resolvedId || label);
                }}
                disabled={disabled || taskNotFound}
                sx={{ p: 0.5, color: 'inherit' }}
              >
                {starredTasks?.includes(resolvedId || label) ? <StarIcon sx={{ fontSize: 16 }} /> : <StarBorderIcon sx={{ fontSize: 16 }} />}
              </IconButton>
            </span>
          </Tooltip>
          {renderCompositeSegments()}
          {isFailed ? (
            <>
              <span className="error-badge" title={failureReason}>
                Failed {exitCode !== undefined ? `(${exitCode})` : ''}
              </span>
              {failedDependency && (
                <span className="dependency-error" title={`Dependency "${getDisplayLabel(failedDependency)}" failed`}>
                  ← {getDisplayLabel(failedDependency)}
                </span>
              )}
              <Tooltip title={disabled || taskNotFound ? '' : "Retry this task"}>
                <span>
                  <IconButton
                    size="small"
                    onClick={() => {
                      handleSegmentLeave(); // Close popover before retrying
                      onRun(resolvedId || label);
                    }}
                    disabled={disabled || taskNotFound}
                    sx={{ p: 0.5, ml: 0.5 }}
                  >
                    <PlayArrowIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          ) : (
            <>
              <span className="runtime" title={`Running for ${formatRuntime(runtime)}`}>{formatRuntime(runtime)}</span>
              <Tooltip title={disabled || taskNotFound ? '' : (canFocus ? "Show terminal output for this task" : "Terminal not available")}>
                <span>
                  <IconButton
                    size="small"
                    onClick={() => onFocus(resolvedId || label)}
                    disabled={!canFocus || disabled || taskNotFound}
                    sx={{ p: 0.5, ml: 0.5 }}
                  >
                    <BoltIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={taskNotFound ? '' : (canStop ? "Stop this task" : "Cannot stop task")}>
                <span>
                  <IconButton
                    size="small"
                    onClick={() => onStop(resolvedId || label)}
                    disabled={!canStop || taskNotFound}
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
              // Find child running state
              const cTask = tasks.find(t => t.id === subtask || t.label === subtask);
              const cId = cTask?.id || subtask;
              const subtaskRunning = runningTasks[cId]?.running;
              
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
      {!taskNotFound && popoverAnchor && popoverContent && (
        <Popover
          open={Boolean(popoverAnchor)}
          anchorEl={popoverAnchor}
          onClose={handleSegmentLeave}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'center',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'center',
          }}
          sx={{ pointerEvents: 'none' }}
        >
          <Box sx={{ p: 1.5, minWidth: 220 }}>
            {popoverContent.sourceFile && (
              <Typography variant="caption" sx={{ display: 'block', fontSize: '0.7rem', opacity: 0.6, mb: 0.5 }}>
                {popoverContent.sourceFile}
              </Typography>
            )}
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
              {popoverContent.name}
            </Typography>
            {popoverContent.script && (
              <Typography variant="caption" sx={{ display: 'block', opacity: 0.8, fontFamily: 'monospace', fontSize: '0.75rem', mb: 0.75 }}>
                {popoverContent.script}
              </Typography>
            )}
            <Typography variant="caption" sx={{ display: 'block', mb: 0.75, opacity: 0.8 }}>
              Status: <span style={{ fontWeight: 500 }}>{popoverContent.status}</span>
            </Typography>
            {popoverContent.duration > 0 && (
              <Typography variant="caption" sx={{ display: 'block', mb: 0.5, opacity: 0.8 }}>
                Duration: <span style={{ fontWeight: 500 }}>{formatRuntime(popoverContent.duration)}</span>
              </Typography>
            )}
            {popoverContent.progress > 0 && popoverContent.status === 'running' && (
              <Typography variant="caption" sx={{ display: 'block', mb: 0.5, opacity: 0.8 }}>
                Progress: <span style={{ fontWeight: 500 }}>{Math.floor(popoverContent.progress)}%</span>
              </Typography>
            )}
            {popoverContent.avgDuration > 0 && (
              <Typography variant="caption" sx={{ display: 'block', mb: 0.5, opacity: 0.8 }}>
                Avg Runtime: <span style={{ fontWeight: 500 }}>{formatRuntime(popoverContent.avgDuration)}</span>
              </Typography>
            )}
            {popoverContent.failureReason && (
              <Typography variant="caption" sx={{ display: 'block', color: 'error.main', mt: 0.75 }}>
                {popoverContent.failureReason}
              </Typography>
            )}
            {popoverContent.exitCode !== undefined && popoverContent.status === 'failed' && (
              <Typography variant="caption" sx={{ display: 'block', opacity: 0.8 }}>
                Exit Code: <span style={{ fontFamily: 'monospace' }}>{popoverContent.exitCode}</span>
              </Typography>
            )}
          </Box>
        </Popover>
      )}
    </>
    );
    
    return tooltipTitle ? (
      <Tooltip title={tooltipTitle}>
        <Box component="span" sx={containerSx}>
          {content}
        </Box>
      </Tooltip>
    ) : containerSx && Object.keys(containerSx).length > 0 ? (
      <Box component="span" sx={containerSx}>
        {content}
      </Box>
    ) : content;
  }

  const content = (
    <>
      <span className="task-link">
        <span
          className="task-expanded"
          onMouseEnter={(e) => handleSegmentHover(e, resolvedId || label)}
          onMouseLeave={handleSegmentLeave}
        >
        <Tooltip title={disabled || taskNotFound ? '' : (starredTasks?.includes(resolvedId || label) ? 'Remove from starred tasks' : 'Add to starred tasks')}>
          <span>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onToggleStar?.(resolvedId || label);
              }}
              disabled={disabled || taskNotFound}
              sx={{ p: 0.5, color: 'inherit' }}
            >
              {starredTasks?.includes(resolvedId || label) ? <StarIcon sx={{ fontSize: 16 }} /> : <StarBorderIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </span>
        </Tooltip>
        {renderCompositeSegments()}
        <Tooltip title={disabled || taskNotFound ? '' : "Run this task"}>
          <span>
            <IconButton
              size="small"
              onClick={() => {
                handleSegmentLeave(); // Close popover before running
                onRun(resolvedId || label);
              }}
              disabled={disabled || taskNotFound}
              sx={{ p: 0.5, ml: 0.5 }}
            >
              <PlayArrowIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>
      </span>
    </span>
    {!taskNotFound && popoverAnchor && popoverContent && (
      <Popover
        open={Boolean(popoverAnchor)}
        anchorEl={popoverAnchor}
        onClose={handleSegmentLeave}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'center',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'center',
        }}
        sx={{ pointerEvents: 'none' }}
      >
        <Box sx={{ p: 1.5, minWidth: 220 }}>
          {popoverContent.sourceFile && (
            <Typography variant="caption" sx={{ display: 'block', fontSize: '0.7rem', opacity: 0.6, mb: 0.5 }}>
              {popoverContent.sourceFile}
            </Typography>
          )}
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
            {popoverContent.name}
          </Typography>
          {popoverContent.script && (
            <Typography variant="caption" sx={{ display: 'block', opacity: 0.8, fontFamily: 'monospace', fontSize: '0.75rem', mb: 0.75 }}>
              {popoverContent.script}
            </Typography>
          )}
          <Typography variant="caption" sx={{ display: 'block', mb: 0.75, opacity: 0.8 }}>
            Status: <span style={{ fontWeight: 500 }}>{popoverContent.status}</span>
          </Typography>
          {popoverContent.duration > 0 && (
            <Typography variant="caption" sx={{ display: 'block', mb: 0.5, opacity: 0.8 }}>
              Duration: <span style={{ fontWeight: 500 }}>{formatRuntime(popoverContent.duration)}</span>
            </Typography>
          )}
          {popoverContent.progress > 0 && popoverContent.status === 'running' && (
            <Typography variant="caption" sx={{ display: 'block', mb: 0.5, opacity: 0.8 }}>
              Progress: <span style={{ fontWeight: 500 }}>{Math.floor(popoverContent.progress)}%</span>
            </Typography>
          )}
          {popoverContent.avgDuration > 0 && (
            <Typography variant="caption" sx={{ display: 'block', mb: 0.5, opacity: 0.8 }}>
              Avg Runtime: <span style={{ fontWeight: 500 }}>{formatRuntime(popoverContent.avgDuration)}</span>
            </Typography>
          )}
          {popoverContent.failureReason && (
            <Typography variant="caption" sx={{ display: 'block', color: 'error.main', mt: 0.75 }}>
              {popoverContent.failureReason}
            </Typography>
          )}
          {popoverContent.exitCode !== undefined && popoverContent.status === 'failed' && (
            <Typography variant="caption" sx={{ display: 'block', opacity: 0.8 }}>
              Exit Code: <span style={{ fontFamily: 'monospace' }}>{popoverContent.exitCode}</span>
            </Typography>
          )}
        </Box>
      </Popover>
    )}
    </>
  );
  
  return tooltipTitle ? (
    <Tooltip title={tooltipTitle}>
      <Box component="span" sx={containerSx}>
        {content}
      </Box>
    </Tooltip>
  ) : containerSx && Object.keys(containerSx).length > 0 ? (
    <Box component="span" sx={containerSx}>
      {content}
    </Box>
  ) : content;
}

export default TaskLink;
