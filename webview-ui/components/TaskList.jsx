import React from 'react';
import TaskLink from './TaskLink';

function TaskList({ labelStartsWith, tasks, onRun, onStop, onFocus, onOpenDefinition, runningTasks, starredTasks, onToggleStar }) {
  const filteredTasks = tasks.filter(task => 
    task.label.startsWith(labelStartsWith)
  );

  if (filteredTasks.length === 0) {
    return (
      <div className="task-list empty">
        <p>No tasks found matching: <code>{labelStartsWith}</code></p>
      </div>
    );
  }

  // Build a map of task labels for quick lookup
  const taskMap = tasks.reduce((map, task) => {
    map[task.label] = task;
    return map;
  }, {});

  // Render a single task and its dependencies
  const renderTask = (task, depth = 0) => {
    const hasDependencies = task.dependsOn && task.dependsOn.length > 0;
    
    return (
      <li key={task.label} style={{ marginLeft: depth > 0 ? '20px' : '0' }}>
        <TaskLink
          label={task.label}
          onRun={onRun}
          onStop={onStop}
          onFocus={onFocus}
          onOpenDefinition={onOpenDefinition}
          taskState={runningTasks[task.label]}
          allRunningTasks={runningTasks}
          starredTasks={starredTasks}
          onToggleStar={onToggleStar}
        />
        {task.detail && <span className="task-detail"> — {task.detail}</span>}
        
        {hasDependencies && (
          <ul className="task-dependencies" style={{ marginTop: '4px', paddingLeft: '0' }}>
            {task.dependsOn.map(depLabel => {
              const depTask = taskMap[depLabel];
              if (depTask) {
                return renderTask(depTask, depth + 1);
              }
              return (
                <li key={depLabel} style={{ marginLeft: '20px', opacity: 0.6 }}>
                  <span>↳ {depLabel} (not found)</span>
                </li>
              );
            })}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="task-list">
      <ul>
        {filteredTasks.map((task) => renderTask(task))}
      </ul>
    </div>
  );
}

export default TaskList;
