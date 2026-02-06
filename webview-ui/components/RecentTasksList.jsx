import React, { useState } from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

function RecentTasksList({ tasks, allTasks, onRun, onToggleStar, starredTasks }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  const getDisplayLabel = (label) => {
    const task = allTasks?.find(t => t.id === label || t.label === label);
    return task?.displayLabel || label;
  };

  return (
    <div className="recent-tasks-panel">
      <div className="panel-header">
        <h3>Recently Used ({tasks.length})</h3>
        <Tooltip title={isCollapsed ? 'Expand' : 'Collapse'}>
          <IconButton
            size="small"
            onClick={() => setIsCollapsed(!isCollapsed)}
            sx={{ p: 0.5 }}
          >
            {isCollapsed ? <ExpandMoreIcon sx={{ fontSize: 18 }} /> : <ExpandLessIcon sx={{ fontSize: 18 }} />}
          </IconButton>
        </Tooltip>
      </div>
      {!isCollapsed && (
        <div className="panel-content">
          {tasks.length === 0 ? (
            <div className="empty-state">No recently used tasks</div>
          ) : (
            tasks.map(label => (
              <div key={label} className="task-list-item">
                <Tooltip title={starredTasks.includes(label) ? 'Unstar' : 'Star'}>
                  <IconButton
                    size="small"
                    onClick={() => onToggleStar(label)}
                    sx={{ p: 0.5 }}
                  >
                    {starredTasks.includes(label) ? <StarIcon sx={{ fontSize: 16 }} /> : <StarBorderIcon sx={{ fontSize: 16 }} />}
                  </IconButton>
                </Tooltip>
                <span className="task-label">{getDisplayLabel(label)}</span>
                <Tooltip title="Run task">
                  <IconButton
                    size="small"
                    onClick={() => onRun(label)}
                    sx={{ p: 0.5 }}
                  >
                    <PlayArrowIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default RecentTasksList;
