import { useState } from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StarIcon from '@mui/icons-material/Star';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

function StarredTasksList({ tasks, onRun, onToggleStar }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="starred-tasks-panel">
      <div className="panel-header">
        <h3>Starred Tasks ({tasks.length}/20)</h3>
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
            <div className="empty-state">No starred tasks yet</div>
          ) : (
            tasks.map(label => (
              <div key={label} className="task-list-item">
                <Tooltip title="Unstar">
                  <IconButton
                    size="small"
                    onClick={() => onToggleStar(label)}
                    sx={{ p: 0.5 }}
                  >
                    <StarIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <span className="task-label">{label}</span>
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

export default StarredTasksList;
