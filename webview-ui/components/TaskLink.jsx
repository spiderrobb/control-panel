import React, { useState, useEffect, useCallback } from 'react';
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
import { useTaskState } from '../context';
import Segment, { getNpmColor } from './Segment';

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
  if (!currentTask && tasks.length > 0 && label) {
    const matching = tasks.filter(t => t.label === label);
    currentTask = matching.find(t => t.source === 'Workspace') || matching[0];
    
    // Handle "npm: " prefix for legacy MDX support
    if (!currentTask && label.startsWith('npm: ')) {
      const scriptName = label.substring(5);
      currentTask = tasks.find(t => t.source === 'npm' && t.label === scriptName);
    }
  }
    
  // Detect if task definition is missing
  const taskNotFound = !currentTask;
  const resolvedLabel = currentTask?.label || label;
  const resolvedId = currentTask?.id;
  
  const isNpmTask = currentTask?.source === 'npm';
  const scriptName = currentTask?.definition?.script;
  
  // For npm tasks, use script name from definition, otherwise use displayLabel/label
  const displayText = isNpmTask && scriptName ? scriptName : (displayLabel || resolvedLabel);

  const taskState = runningTasks[resolvedId] || runningTasks[label];

  const isRunning = taskState?.running || false;
  const isFailed = taskState?.failed || false;
  const startTime = taskState?.startTime || null;
  const avgDuration = taskState?.avgDuration || null;
  const isFirstRun = taskState?.isFirstRun || false;
  const exitCode = taskState?.exitCode;
  const failureReason = taskState?.failureReason;
  const failedDependency = taskState?.failedDependency;
  const canStop = taskState?.canStop !== false;
  const canFocus = taskState?.canFocus !== false;
  
  // dependsOn is now a recursive tree of { label, id, source, definition, dependsOn, dependsOrder }
  const dependencyTree = currentTask?.dependsOn || [];
  const hasDependencies = dependencyTree.length > 0;

  // Check if any task in the tree is running (for segment tick timer)
  const hasAnyRunningInTree = useCallback((deps) => {
    for (const dep of deps) {
      const key = dep.id || dep.label;
      // Check by id first, then by extracted label
      let state = runningTasks[key];
      if (!state && key.includes('|')) {
        state = runningTasks[key.split('|')[1]];
      }
      if (state?.running) return true;
      if (dep.dependsOn && dep.dependsOn.length > 0 && hasAnyRunningInTree(dep.dependsOn)) return true;
    }
    return false;
  }, [runningTasks]);

  const hasRunningSegment = isRunning || hasAnyRunningInTree(dependencyTree);

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
      
      if (avgDuration && avgDuration > 0 && !isFailed) {
        const calculatedProgress = Math.min((currentRuntime / avgDuration) * 100, 99);
        setProgress(calculatedProgress);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, isFailed, startTime, avgDuration]);

  // Tick timer for segment progress updates
  useEffect(() => {
    if (!hasRunningSegment) return;

    const interval = setInterval(() => {
      setSegmentTick(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [hasRunningSegment]);

  const formatRuntime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  // Background style for task-pill (non-segmented tasks)
  const getBackgroundClass = () => {
    if (isFailed) return 'error';
    if (!isRunning) return '';
    if (runtime > 60000) return 'bg-solid';
    if (isFirstRun || !avgDuration) return 'bg-shimmer';
    return 'bg-progress';
  };

  const getProgressStyle = () => {
    if (!isRunning || isFirstRun || !avgDuration || runtime > 60000) return {};
    return { '--progress': `${progress}%` };
  };

  // --- Callbacks passed down to Segment ---

  // Resolve running state — context keys by label, but tree nodes use id
  const resolveRunningState = useCallback((taskIdOrLabel) => {
    if (!taskIdOrLabel) return undefined;
    // Try exact match first (works for labels and ids that match context keys)
    if (runningTasks[taskIdOrLabel]) return runningTasks[taskIdOrLabel];
    // If taskIdOrLabel looks like an id (source|label|path), extract label part
    const parts = taskIdOrLabel.split('|');
    if (parts.length >= 2) {
      const labelPart = parts[1];
      if (runningTasks[labelPart]) return runningTasks[labelPart];
    }
    return undefined;
  }, [runningTasks]);

  const getSegmentState = useCallback((taskIdOrLabel) => {
    const state = resolveRunningState(taskIdOrLabel);
    if (state?.failed) return 'error';
    if (state?.running) return 'running';
    if (state?.completed) return 'success';
    return 'idle';
  }, [resolveRunningState]);

  const getProgressInfo = useCallback((taskIdOrLabel) => {
    const state = resolveRunningState(taskIdOrLabel);
    if (state?.failed) return { progress: 100, indeterminate: false };
    if (!state?.running || !state?.startTime) return { progress: 0, indeterminate: false };
    if (!state?.avgDuration || state.avgDuration <= 0) return { progress: 35, indeterminate: true };

    const now = segmentTick || Date.now();
    const elapsed = now - state.startTime;
    const progressValue = Math.min((elapsed / state.avgDuration) * 100, 99);
    return { progress: progressValue, indeterminate: false };
  }, [runningTasks, segmentTick]);

  const getSegmentDisplayLabel = useCallback((task) => {
    if (!task) return '';
    // For the root task, use our pre-computed displayText
    const key = task.id || task.label;
    if (key === resolvedId || key === label) return displayText;
    // For npm tasks, show script name
    if (task.source === 'npm' && task.definition?.script) return task.definition.script;
    return task.displayLabel || task.label || '';
  }, [resolvedId, label, displayText]);

  // --- Popover helpers ---

  const calculateAvgDuration = (taskIdOrLabel) => {
    const state = resolveRunningState(taskIdOrLabel);
    if (state?.avgDuration) return state.avgDuration;
    return taskHistoryMap[taskIdOrLabel] || null;
  };

  const getSourceFile = (task, idOrLabel) => {
    if (task?.source === 'npm') {
      return task?.definition?.path ? `${task.definition.path}/package.json` : 'package.json';
    }
    if (typeof idOrLabel === 'string' && idOrLabel.startsWith('npm|')) return 'package.json';
    return 'tasks.json';
  };

  const formatCommandString = (task) => {
    if (!task) return 'No command defined';
    const taskType = task.source || 'unknown';
    const command = task.definition?.command || task.definition?.script || '';
    return command ? `${taskType}: ${command}` : `${taskType}: `;
  };

  const getTaskInfo = useCallback((taskIdOrLabel) => {
    const isMainTask = taskIdOrLabel === label || taskIdOrLabel === resolvedId;
    
    if (isMainTask) {
      return {
        name: resolvedLabel,
        source: currentTask?.source,
        sourceFile: getSourceFile(currentTask, taskIdOrLabel),
        script: formatCommandString(currentTask),
        status: isFailed ? 'failed' : (isRunning ? 'running' : 'idle'),
        duration: runtime,
        progress: progress,
        avgDuration: calculateAvgDuration(taskIdOrLabel),
        exitCode: exitCode,
        failureReason: failureReason
      };
    }
    
    let taskData = tasks?.find(t => t.id === taskIdOrLabel);
    if (!taskData) {
      const matching = tasks?.filter(t => t.label === taskIdOrLabel) || [];
      taskData = matching.find(t => t.source === 'Workspace') || matching[0];
    }

    const segState = resolveRunningState(taskIdOrLabel);
    
    return {
      name: taskData?.label || taskIdOrLabel,
      source: taskData?.source || 'unknown',
      sourceFile: getSourceFile(taskData, taskIdOrLabel),
      script: formatCommandString(taskData),
      status: segState?.failed ? 'failed' : (segState?.running ? 'running' : 'idle'),
      duration: segState?.startTime ? Date.now() - segState.startTime : 0,
      avgDuration: calculateAvgDuration(taskIdOrLabel),
      exitCode: segState?.exitCode,
      failureReason: segState?.failureReason
    };
  }, [tasks, resolveRunningState, runtime, progress, isRunning, isFailed, exitCode, failureReason, resolvedLabel, resolvedId, label, currentTask, taskHistoryMap]);

  const handleSegmentHover = useCallback((event, taskIdOrLabel) => {
    setPopoverAnchor(event.currentTarget);
    setPopoverContent(getTaskInfo(taskIdOrLabel));
  }, [getTaskInfo]);

  const handleSegmentLeave = useCallback(() => {
    setPopoverAnchor(null);
    setPopoverContent(null);
  }, []);

  // Build the root task node for the Segment tree
  const rootTaskNode = currentTask ? {
    label: currentTask.label,
    id: currentTask.id,
    source: currentTask.source,
    definition: currentTask.definition,
    dependsOn: dependencyTree,
    dependsOrder: currentTask.dependsOrder || 'parallel'
  } : {
    label: label,
    id: resolvedId,
    dependsOn: [],
    dependsOrder: 'parallel'
  };

  // --- Single Popover instance ---
  const renderPopover = () => {
    if (taskNotFound || !popoverAnchor || !popoverContent) return null;
    return (
      <Popover
        open={Boolean(popoverAnchor)}
        anchorEl={popoverAnchor}
        onClose={handleSegmentLeave}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
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
    );
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

  // --- Running / Failed state ---
  if (isRunning || isFailed) {
    const content = (
      <>
        <div className="task-link running">
          <div 
            className={`task-pill ${hasDependencies ? '' : getBackgroundClass()}`} 
            style={getProgressStyle()}
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
          
          {hasDependencies ? (
            <div className="segment-tree-container">
              <Segment
                task={rootTaskNode}
                getSegmentState={getSegmentState}
                getProgressInfo={getProgressInfo}
                getDisplayLabel={getSegmentDisplayLabel}
                onSegmentHover={handleSegmentHover}
                onSegmentLeave={handleSegmentLeave}
                onOpenDefinition={onOpenDefinition}
                disabled={disabled || taskNotFound}
                isRoot
              />
            </div>
          ) : (
            <span
              className="task-label"
              onDoubleClick={disabled || taskNotFound ? undefined : () => onOpenDefinition(resolvedId || label)}
              onMouseEnter={(e) => handleSegmentHover(e, resolvedId || label)}
              onMouseLeave={handleSegmentLeave}
              title={disabled || taskNotFound ? undefined : "Double-click to open task definition"}
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
                    backgroundColor: getNpmColor(currentTask?.definition?.path),
                    color: 'var(--vscode-button-foreground)',
                    '& .MuiChip-label': { padding: '0 6px' }
                  }}
                />
              )}
              {displayText}
            </span>
          )}

          {isFailed ? (
            <>
              <Tooltip title={disabled || taskNotFound ? '' : "Retry this task"}>
                <span>
                  <IconButton
                    size="small"
                    onClick={() => {
                      handleSegmentLeave();
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
                    onClick={() => {
                      handleSegmentLeave();
                      onStop(resolvedId || label);
                    }}
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
      </div>
      {renderPopover()}
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

  // --- Idle state ---
  const content = (
    <>
      <span className="task-link">
        <span className="task-expanded">
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

        {hasDependencies ? (
          <div className="segment-tree-container">
            <Segment
              task={rootTaskNode}
              getSegmentState={getSegmentState}
              getProgressInfo={getProgressInfo}
              getDisplayLabel={getSegmentDisplayLabel}
              onSegmentHover={handleSegmentHover}
              onSegmentLeave={handleSegmentLeave}
              onOpenDefinition={onOpenDefinition}
              disabled={disabled || taskNotFound}
              isRoot
            />
          </div>
        ) : (
          <span
            className="task-label"
            onDoubleClick={disabled || taskNotFound ? undefined : () => onOpenDefinition(resolvedId || label)}
            onMouseEnter={(e) => handleSegmentHover(e, resolvedId || label)}
            onMouseLeave={handleSegmentLeave}
            title={disabled || taskNotFound ? undefined : "Double-click to open task definition"}
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
                  backgroundColor: getNpmColor(currentTask?.definition?.path),
                  color: 'var(--vscode-button-foreground)',
                  '& .MuiChip-label': { padding: '0 6px' }
                }}
              />
            )}
            {displayText}
          </span>
        )}

        <Tooltip title={disabled || taskNotFound ? '' : "Run this task"}>
          <span>
            <IconButton
              size="small"
              onClick={() => {
                handleSegmentLeave();
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
    {renderPopover()}
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
