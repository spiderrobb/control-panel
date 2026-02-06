import React, { useState } from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';

function ExecutionHistoryPanel({ history, allTasks }) {
  const [expandedItems, setExpandedItems] = useState(new Set());
  
  const getDisplayLabel = (taskLabel) => {
    const task = allTasks?.find(t => t.id === taskLabel || t.label === taskLabel);
    return task?.displayLabel || taskLabel;
  };

  const toggleExpanded = (id) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const formatDuration = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const formatRelativeTime = (timestamp) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  const formatAbsoluteTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const buildHierarchy = (history) => {
    // Find root executions (those without a parent in this history)
    const roots = history.filter(exec => {
      if (!exec.parentLabel) return true;
      // Check if parent exists in current history
      const parentExists = history.some(e => 
        e.taskLabel === exec.parentLabel && 
        e.endTime > exec.startTime - 5000 && // Parent should have ended around same time
        e.endTime <= exec.endTime
      );
      return !parentExists;
    });

    return roots;
  };

  const findChildren = (execution, allHistory) => {
    if (!execution.childLabels || execution.childLabels.length === 0) {
      return [];
    }

    // Find child executions that started after this parent and match the child labels
    return allHistory.filter(exec => 
      execution.childLabels.includes(exec.taskLabel) &&
      exec.startTime >= execution.startTime &&
      exec.startTime <= execution.endTime
    );
  };

  const renderExecution = (execution, allHistory, depth = 0) => {
    const isExpanded = expandedItems.has(execution.id);
    const children = findChildren(execution, allHistory);
    const hasChildren = children.length > 0;

    return (
      <div key={execution.id}>
        <div 
          className="execution-item" 
          style={{ paddingLeft: `${16 + depth * 20}px` }}
        >
          <div className="execution-row">
            <div className="execution-info">
              {hasChildren && (
                <IconButton
                  size="small"
                  onClick={() => toggleExpanded(execution.id)}
                  sx={{ p: 0.25, mr: 0.5 }}
                >
                  {isExpanded ? (
                    <ExpandLessIcon sx={{ fontSize: 16 }} />
                  ) : (
                    <ExpandMoreIcon sx={{ fontSize: 16 }} />
                  )}
                </IconButton>
              )}
              {!hasChildren && <span style={{ width: 24, display: 'inline-block' }}></span>}
              
              {execution.failed ? (
                <ErrorIcon sx={{ fontSize: 16, mr: 0.5, color: 'var(--vscode-errorForeground)' }} />
              ) : (
                <CheckCircleIcon sx={{ fontSize: 16, mr: 0.5, color: 'var(--vscode-testing-iconPassed)' }} />
              )}
              
              <span className="execution-label">{getDisplayLabel(execution.taskLabel)}</span>
              
              {hasChildren && !isExpanded && (
                <span className="child-count">
                  ↓ {children.length} child {children.length === 1 ? 'task' : 'tasks'}
                </span>
              )}
            </div>
            
            <div className="execution-meta">
              <Tooltip title={formatAbsoluteTime(execution.endTime)}>
                <span className="execution-time">{formatRelativeTime(execution.endTime)}</span>
              </Tooltip>
              <span className="execution-duration">{formatDuration(execution.duration)}</span>
              {execution.failed && (
                <Chip 
                  label={`Exit ${execution.exitCode}`}
                  size="small"
                  sx={{ 
                    height: 18, 
                    fontSize: '10px',
                    backgroundColor: 'var(--vscode-inputValidation-errorBackground)',
                    color: 'var(--vscode-errorForeground)'
                  }}
                />
              )}
            </div>
          </div>
          {execution.failed && execution.reason && (
            <div className="execution-error-message" style={{ paddingLeft: hasChildren ? '24px' : '0px' }}>
              {execution.reason}
            </div>
          )}
        </div>
        
        {hasChildren && isExpanded && (
          <div className="execution-children">
            {children.map(child => renderExecution(child, allHistory, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!history || history.length === 0) {
    return (
      <div className="execution-history-empty">
        <div className="empty-state">
          <p className="empty-title">No task executions recorded</p>
          <p className="empty-message">
            Task execution history will appear here as you run tasks from the Control Panel.
          </p>
        </div>
      </div>
    );
  }

  const rootExecutions = buildHierarchy(history);

  return (
    <div className="execution-history-panel">
      <div className="execution-list">
        {rootExecutions.map(execution => renderExecution(execution, history, 0))}
      </div>
    </div>
  );
}

export default ExecutionHistoryPanel;
