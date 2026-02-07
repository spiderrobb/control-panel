import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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

import { TaskStateProvider, useTaskState, vscode } from './context';

// Utility to generate heading IDs from text (slug generation)
function generateHeadingId(text) {
  if (typeof text !== 'string') {
    // If text is a React element or array, extract text content
    if (React.isValidElement(text)) {
      return generateHeadingId(text.props.children);
    }
    if (Array.isArray(text)) {
      return generateHeadingId(text.map(t => generateHeadingId(t)).join(''));
    }
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function TaskListWithState(props) {
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
    setNpmPathColorMap 
  } = useTaskState();

  return (
    <TaskList
      {...props}
      tasks={tasks}
      onRun={onRun}
      onStop={onStop}
      onFocus={onFocus}
      onOpenDefinition={onOpenDefinition}
      runningTasks={runningTasks}
      starredTasks={starredTasks}
      onToggleStar={onToggleStar}
      npmPathColorMap={npmPathColorMap}
      setNpmPathColorMap={setNpmPathColorMap}
    />
  );
}

function ControlPanel() {
  const {
      tasks, 
      runningTasks, 
      starredTasks, 
      recentlyUsedTasks, 
      executionHistory, 
      runningTasksCollapsed, 
      starredTasksCollapsed,
      onRun,
      onStop,
      onFocus,
      onOpenDefinition,
      onToggleStar,
      onDismissTask,
      onToggleRunningTasksCollapsed,
      onToggleStarredTasksCollapsed
  } = useTaskState();

  const [mdxContent, setMdxContent] = useState(null);
  const [currentFile, setCurrentFile] = useState('');
  const [logBuffer, setLogBuffer] = useState([]);
  const [navigationHistory, setNavigationHistory] = useState([]);
  const [navigationIndex, setNavigationIndex] = useState(-1);
  const [historyMenuAnchor, setHistoryMenuAnchor] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [lastViewedDocument, setLastViewedDocument] = useState('');
  
  // Local state for compilation
  const [MdxModule, setMdxModule] = useState(null);
  const [mdxError, setMdxError] = useState(null);
  const [isCompiling, setIsCompiling] = useState(false);
  
  const contentRef = useRef(null);

  useEffect(() => {
    // Listen for messages from the extension (only those not handled by context)
    const messageHandler = (event) => {
      const message = event.data;
      
      switch (message.type) {
        case 'loadMdx':
          setMdxContent(message.content);
          setCurrentFile(message.file);
          break;
        case 'updateNavigationHistory':
          setNavigationHistory(message.history);
          setNavigationIndex(message.index);
          break;
        case 'logBuffer':
          setLogBuffer(message.entries || []);
          break;
        case 'error':
          console.warn(message.message);
          break;
      }
    };

    window.addEventListener('message', messageHandler);
    
    // Request initial content (app specific)
    vscode.postMessage({ type: 'ready' });

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

  const handleShowLogs = () => {
    vscode.postMessage({ type: 'showLogs' });
  };

  const handleRequestLogBuffer = () => {
    vscode.postMessage({ type: 'getLogBuffer' });
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

  // Create MDX components object with all available components
  const mdxComponents = useMemo(() => ({
    // Custom task components
    TaskLink: TaskLink, // Uses context internally now
    TaskList: TaskListWithState,
    // Material UI components
    Button,
    IconButton,
    Typography,
    Chip,
    // All Material UI icons
    ...MuiIcons,
    // Custom heading components with ID attributes for anchor linking
    h1: (props) => {
      const id = generateHeadingId(props.children);
      return <h1 id={id} {...props} />;
    },
    h2: (props) => {
      const id = generateHeadingId(props.children);
      return <h2 id={id} {...props} />;
    },
    h3: (props) => {
      const id = generateHeadingId(props.children);
      return <h3 id={id} {...props} />;
    },
    h4: (props) => {
      const id = generateHeadingId(props.children);
      return <h4 id={id} {...props} />;
    },
    h5: (props) => {
      const id = generateHeadingId(props.children);
      return <h5 id={id} {...props} />;
    },
    h6: (props) => {
      const id = generateHeadingId(props.children);
      return <h6 id={id} {...props} />;
    },
    // Custom link handler for .mdx navigation and anchor links
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
      // Handle anchor links (internal page navigation)
      if (props.href?.startsWith('#')) {
        return (
          <a
            {...props}
            onClick={(e) => {
              e.preventDefault();
              const targetId = props.href.slice(1);
              const targetElement = document.getElementById(targetId);
              if (targetElement && contentRef.current) {
                const contentTop = contentRef.current.offsetTop;
                const elementTop = targetElement.offsetTop;
                contentRef.current.scrollTo({
                  top: elementTop - contentTop - 16, // 16px padding offset
                  behavior: 'smooth'
                });
                // Remove focus from the link to prevent scroll-to-top bug
                e.target.blur();
              }
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

  // Handle initial hash navigation (if URL contains #anchor)
  useEffect(() => {
    if (showHistory || !MdxModule || !contentRef.current) return;
    
    // Check if there's a hash in the message from extension
    // This would be used if we want to navigate to a specific section on load
    const hash = window.location.hash;
    if (hash) {
      const targetId = hash.slice(1);
      const targetElement = document.getElementById(targetId);
      if (targetElement) {
        const contentTop = contentRef.current.offsetTop;
        const elementTop = targetElement.offsetTop;
        requestAnimationFrame(() => {
          contentRef.current.scrollTo({
            top: elementTop - contentTop - 16,
            behavior: 'smooth'
          });
        });
      }
    }
  }, [showHistory, MdxModule]);

  if (!mdxContent) {
    return (
      <div className="loading">
        <p>Loading Control Panel...</p>
      </div>
    );
  }

  // If showing execution history
  if (showHistory) {
    return (
      <div className="app">
          <div className="breadcrumb">
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
          </div>
          <div className="content scrollable">
            <ExecutionHistoryPanel 
              history={executionHistory} 
              onRunTask={onRun}
              allTasks={tasks} 
            />
          </div>
      </div>
    );
  }

  return (
      <div className="app">
        {currentFile && (
          <div className="breadcrumb">
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
          </div>
        )}
        <div className="content" ref={contentRef} onScroll={handleContentScroll}>
            <>
              {mdxError && (
                <div style={{ color: 'var(--vscode-errorForeground)', padding: '20px' }}>
                  Error compiling MDX: {mdxError}
                </div>
              )}
              {isCompiling && <div style={{ padding: '20px' }}>Compiling MDX...</div>}
              {!mdxError && !isCompiling && MdxModule && <MdxModule />}
            </>
        </div>
        <RunningTasksPanel
          runningTasks={runningTasks}
          allTasks={tasks}
          onStop={onStop}
          onFocus={onFocus}
          onOpenDefinition={onOpenDefinition}
          onDismiss={onDismissTask}
          onShowLogs={handleShowLogs}
          onRequestLogBuffer={handleRequestLogBuffer}
          logBuffer={logBuffer}
          isCollapsed={runningTasksCollapsed}
          onToggleCollapsed={onToggleRunningTasksCollapsed}
        />
        <RecentTasksList 
          tasks={recentlyUsedTasks}
          allTasks={tasks}
          onRun={onRun}
          onToggleStar={onToggleStar}
          starredTasks={starredTasks}
        />
        <StarredTasksList 
          tasks={starredTasks}
          allTasks={tasks}
          onRun={onRun}
          onToggleStar={onToggleStar}
          isCollapsed={starredTasksCollapsed}
          onToggleCollapsed={onToggleStarredTasksCollapsed}
        />
      </div>
  );
}

export default function App() {
  return (
    <TaskStateProvider>
      <ControlPanel />
    </TaskStateProvider>
  );
}
