import React, { useState, useEffect, useMemo, useRef, useCallback, useContext } from 'react';
import { evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import DescriptionIcon from '@mui/icons-material/Description';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import HistoryIcon from '@mui/icons-material/History';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import * as MuiIcons from '@mui/icons-material';
import TaskLink from './components/TaskLink';
import TaskList from './components/TaskList';
import RunningTasksPanel from './components/RunningTasksPanel';
import RecentTasksList from './components/RecentTasksList';
import StarredTasksList from './components/StarredTasksList';
import ExecutionHistoryPanel from './components/ExecutionHistoryPanel';

// VS Code API
const vscode = acquireVsCodeApi();

const TaskStateContext = React.createContext(null);

function TaskLinkWithState(props) {
  const ctx = useContext(TaskStateContext);
  if (!ctx) return null;

  // Resolve task to get ID
  let task = ctx.tasks?.find(t => t.id === props.label || t.label === props.label);
  
  // Handle "npm: " prefix for legacy MDX support
  if (!task && props.label && props.label.startsWith('npm: ')) {
    const scriptName = props.label.substring(5);
    task = ctx.tasks?.find(t => t.source === 'npm' && t.label === scriptName);
  }

  const taskId = task?.id;
  const taskState = taskId ? ctx.runningTasks[taskId] : ctx.runningTasks[props.label];

  return (
    <TaskLink
      {...props}
      taskId={taskId}
      displayLabel={task?.displayLabel}
      onRun={ctx.onRun}
      onStop={ctx.onStop}
      onFocus={ctx.onFocus}
      onOpenDefinition={ctx.onOpenDefinition}
      taskState={taskState}
      allRunningTasks={ctx.runningTasks}
      dependencySegments={task?.dependsOn || []}
      dependsOrder={task?.dependsOrder}
      tasks={ctx.tasks}
      starredTasks={ctx.starredTasks}
      onToggleStar={ctx.onToggleStar}
      npmPathColorMap={ctx.npmPathColorMap}
      setNpmPathColorMap={ctx.setNpmPathColorMap}
    />
  );
}

function TaskListWithState(props) {
  const ctx = useContext(TaskStateContext);
  if (!ctx) return null;
  return (
    <TaskList
      {...props}
      tasks={ctx.tasks}
      onRun={ctx.onRun}
      onStop={ctx.onStop}
      onFocus={ctx.onFocus}
      onOpenDefinition={ctx.onOpenDefinition}
      runningTasks={ctx.runningTasks}
      starredTasks={ctx.starredTasks}
      onToggleStar={ctx.onToggleStar}
      npmPathColorMap={ctx.npmPathColorMap}
      setNpmPathColorMap={ctx.setNpmPathColorMap}
    />
  );
}

function App() {
  const [mdxContent, setMdxContent] = useState(null);
  const [currentFile, setCurrentFile] = useState('');
  const [tasks, setTasks] = useState([]);
  const [runningTasks, setRunningTasks] = useState({});
  const [logBuffer, setLogBuffer] = useState([]);
  const [recentlyUsedTasks, setRecentlyUsedTasks] = useState([]);
  const [starredTasks, setStarredTasks] = useState([]);
  const [navigationHistory, setNavigationHistory] = useState([]);
  const [navigationIndex, setNavigationIndex] = useState(-1);
  const [historyMenuAnchor, setHistoryMenuAnchor] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [lastViewedDocument, setLastViewedDocument] = useState('');
  const [executionHistory, setExecutionHistory] = useState([]);
  const [runningTasksCollapsed, setRunningTasksCollapsed] = useState(false);
  const [starredTasksCollapsed, setStarredTasksCollapsed] = useState(false);
  const [npmPathColorMap, setNpmPathColorMap] = useState({});
  const contentRef = useRef(null);

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
            // Keep failed tasks visible until dismissed or re-run
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
        case 'updateNavigationHistory':
          setNavigationHistory(message.history);
          setNavigationIndex(message.index);
          break;
        case 'logBuffer':
          setLogBuffer(message.entries || []);
          break;
        case 'executionHistory':
          setExecutionHistory(message.history || []);
          break;
        case 'panelState':
          setRunningTasksCollapsed(Boolean(message.state?.runningTasksCollapsed));
          setStarredTasksCollapsed(Boolean(message.state?.starredTasksCollapsed));
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
    vscode.postMessage({ type: 'getPanelState' });

    return () => window.removeEventListener('message', messageHandler);
  }, []);

  const handleNavigate = useCallback((file) => {
    vscode.postMessage({ type: 'navigate', file });
  }, []);

  const handleNavigateBack = () => {
    vscode.postMessage({ type: 'navigateBack' });
  };

  const handleNavigateForward = () => {
    vscode.postMessage({ type: 'navigateForward' });
  };

  const handleNavigateToHistory = (index) => {
    vscode.postMessage({ type: 'navigateToHistoryItem', index });
    setHistoryMenuAnchor(null);
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

  const handleDismissTask = (label) => {
    setRunningTasks(prev => {
      const updated = { ...prev };
      delete updated[label];
      return updated;
    });
    // Notify extension to clear persisted failure
    vscode.postMessage({ type: 'dismissTask', label });
  };

  const handleShowLogs = () => {
    vscode.postMessage({ type: 'showLogs' });
  };

  const handleRequestLogBuffer = () => {
    vscode.postMessage({ type: 'getLogBuffer' });
  };

  const handleToggleRunningTasksCollapsed = () => {
    const next = !runningTasksCollapsed;
    setRunningTasksCollapsed(next);
    vscode.postMessage({
      type: 'setPanelState',
      state: { runningTasksCollapsed: next }
    });
  };

  const handleToggleStarredTasksCollapsed = () => {
    const next = !starredTasksCollapsed;
    setStarredTasksCollapsed(next);
    vscode.postMessage({
      type: 'setPanelState',
      state: { starredTasksCollapsed: next }
    });
  };

  const handleToggleHistory = () => {
    if (!showHistory) {
      // Switching to history view - save current document and request history
      setLastViewedDocument(currentFile);
      setShowHistory(true);
      vscode.postMessage({ type: 'getExecutionHistory' });
    } else {
      // Switching back to document view - restore last viewed document
      setShowHistory(false);
      if (lastViewedDocument && lastViewedDocument !== currentFile) {
        handleNavigate(lastViewedDocument);
      }
    }
  };

  const handleCopyTasksJson = () => {
    vscode.postMessage({ type: 'copyTasksJson' });
  };

  // State for compiled MDX component
  const [MdxModule, setMdxModule] = useState(null);
  const [mdxError, setMdxError] = useState(null);
  const [isCompiling, setIsCompiling] = useState(false);

  // Create MDX components object with all available components
  const mdxComponents = useMemo(() => ({
    // Custom task components
    TaskLink: TaskLinkWithState,
    TaskList: TaskListWithState,
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
  }), [handleNavigate]);

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

  const taskContextValue = useMemo(() => ({
    tasks,
    runningTasks,
    starredTasks,
    onRun: handleRunTask,
    onStop: handleStopTask,
    onFocus: handleFocusTerminal,
    onOpenDefinition: handleOpenDefinition,
    onToggleStar: handleToggleStar
  }), [
    tasks,
    runningTasks,
    starredTasks,
    handleRunTask,
    handleStopTask,
    handleFocusTerminal,
    handleOpenDefinition,
    handleToggleStar
  ]);

  const handleContentScroll = useCallback((event) => {
    if (showHistory || !currentFile) return;
    const scrollTop = event.currentTarget.scrollTop;
    const state = vscode.getState() || {};
    const scrollPositions = state.scrollPositions || {};
    scrollPositions[currentFile] = scrollTop;
    vscode.setState({
      ...state,
      scrollPositions,
      lastFile: currentFile
    });
  }, [showHistory, currentFile]);

  useEffect(() => {
    if (showHistory || !currentFile) return;
    const state = vscode.getState() || {};
    const scrollPositions = state.scrollPositions || {};
    const target = scrollPositions[currentFile];
    if (target === undefined) return;

    const el = contentRef.current;
    if (!el) return;

    requestAnimationFrame(() => {
      el.scrollTop = target;
    });
  }, [showHistory, currentFile, mdxContent, MdxModule]);

  if (!mdxContent) {
    return (
      <div className="loading">
        <p>Loading Control Panel...</p>
      </div>
    );
  }

  return (
    <TaskStateContext.Provider value={taskContextValue}>
      <div className="app">
        {currentFile && (
          <div className="breadcrumb">
            {showHistory ? (
              <>
                <div className="breadcrumb-trail">
                  <HistoryIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
                  <span className="current-file">Task Execution History</span>
                </div>
                <div className="breadcrumb-actions">
                  <Tooltip title="Close execution history">
                    <IconButton
                      size="small"
                      onClick={handleToggleHistory}
                      sx={{ p: 0.5 }}
                    >
                      <CloseIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                </div>
              </>
            ) : (
              <>
                <div className="breadcrumb-navigation">
                  <Tooltip title="Back">
                    <span>
                      <IconButton
                        size="small"
                        onClick={handleNavigateBack}
                        disabled={navigationIndex <= 0}
                        sx={{ p: 0.5, mr: 0.5 }}
                      >
                        <ArrowBackIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Forward">
                    <span>
                      <IconButton
                        size="small"
                        onClick={handleNavigateForward}
                        disabled={navigationIndex >= navigationHistory.length - 1}
                        sx={{ p: 0.5, mr: 0.5 }}
                      >
                        <ArrowForwardIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  {navigationHistory.length > 0 && (
                    <>
                      <Tooltip title="History & Recent Documents">
                        <IconButton
                          size="small"
                          onClick={(e) => setHistoryMenuAnchor(e.currentTarget)}
                          sx={{ p: 0.5, mr: 0.5 }}
                        >
                          <MoreVertIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Menu
                        anchorEl={historyMenuAnchor}
                        open={Boolean(historyMenuAnchor)}
                        onClose={() => setHistoryMenuAnchor(null)}
                        anchorOrigin={{
                          vertical: 'bottom',
                          horizontal: 'left',
                        }}
                        slotProps={{
                          paper: {
                            sx: { maxHeight: '50vh', minWidth: 180 }
                          }
                        }}
                      >
                        <ListSubheader sx={{ fontSize: '11px', lineHeight: '24px', py: 0, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.7 }}>
                          History
                        </ListSubheader>
                        {navigationHistory.map((file, index) => (
                          <MenuItem
                            key={`hist-${index}`}
                            onClick={() => handleNavigateToHistory(index)}
                            selected={index === navigationIndex}
                            sx={{ fontSize: '12px', py: 0.25, minHeight: 28 }}
                          >
                            {file}
                          </MenuItem>
                        ))}
                        {(() => {
                          const recentDocs = [...new Set(navigationHistory)].filter(f => f !== currentFile).slice(0, 8);
                          if (recentDocs.length === 0) return null;
                          return (
                            <>
                              <Divider sx={{ my: 0.5 }} />
                              <ListSubheader sx={{ fontSize: '11px', lineHeight: '24px', py: 0, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.7 }}>
                                Recent Documents
                              </ListSubheader>
                              {recentDocs.map((file) => (
                                <MenuItem
                                  key={`recent-${file}`}
                                  onClick={() => {
                                    handleNavigate(file);
                                    setHistoryMenuAnchor(null);
                                  }}
                                  sx={{ fontSize: '12px', py: 0.25, minHeight: 28 }}
                                >
                                  <DescriptionIcon sx={{ fontSize: 14, mr: 1, opacity: 0.6 }} />
                                  {file}
                                </MenuItem>
                              ))}
                            </>
                          );
                        })()}
                      </Menu>
                    </>
                  )}
                </div>
                <div className="breadcrumb-trail">
                  <DescriptionIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
                  {navigationHistory.length > 1 && navigationIndex > 0 && (
                    <>
                      <span
                        className="previous-file"
                        onClick={() => handleNavigateToHistory(navigationIndex - 1)}
                        style={{ cursor: 'pointer' }}
                        title="Go back"
                      >
                        {navigationHistory[navigationIndex - 1]}
                      </span>
                      <span className="breadcrumb-separator"> &gt; </span>
                    </>
                  )}
                  <span 
                    className="current-file" 
                    onClick={() => vscode.postMessage({ type: 'openCurrentFile', file: currentFile })}
                    style={{ cursor: 'pointer' }}
                    title="Click to open in editor"
                  >
                    {currentFile}
                  </span>
                </div>
                <div className="breadcrumb-actions">
                  <Tooltip title="Copy fetchTasks() JSON">
                    <IconButton
                      size="small"
                      onClick={handleCopyTasksJson}
                      sx={{ p: 0.5, ml: 0.5 }}
                    >
                      <ContentCopyIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Show execution history">
                    <IconButton
                      size="small"
                      onClick={handleToggleHistory}
                      sx={{ p: 0.5 }}
                    >
                      <HistoryIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                </div>
              </>
            )}
          </div>
        )}
        <div className="content" ref={contentRef} onScroll={handleContentScroll}>
          {showHistory ? (
            <ExecutionHistoryPanel history={executionHistory} allTasks={tasks} />
          ) : (
            <>
              {mdxError && (
                <div style={{ color: 'var(--vscode-errorForeground)', padding: '20px' }}>
                  Error compiling MDX: {mdxError}
                </div>
              )}
              {isCompiling && <div style={{ padding: '20px' }}>Compiling MDX...</div>}
              {!mdxError && !isCompiling && MdxModule && <MdxModule />}
            </>
          )}
        </div>
        <RunningTasksPanel
          runningTasks={runningTasks}
          allTasks={tasks}
          onStop={handleStopTask}
          onFocus={handleFocusTerminal}
          onOpenDefinition={handleOpenDefinition}
          onDismiss={handleDismissTask}
          onShowLogs={handleShowLogs}
          onRequestLogBuffer={handleRequestLogBuffer}
          logBuffer={logBuffer}
          isCollapsed={runningTasksCollapsed}
          onToggleCollapsed={handleToggleRunningTasksCollapsed}
        />
        <RecentTasksList 
          tasks={recentlyUsedTasks}
          allTasks={tasks}
          onRun={handleRunTask}
          onToggleStar={handleToggleStar}
          starredTasks={starredTasks}
        />
        <StarredTasksList 
          tasks={starredTasks}
          allTasks={tasks}
          onRun={handleRunTask}
          onToggleStar={handleToggleStar}
          isCollapsed={starredTasksCollapsed}
          onToggleCollapsed={handleToggleStarredTasksCollapsed}
        />
      </div>
    </TaskStateContext.Provider>
  );
}

export default App;
