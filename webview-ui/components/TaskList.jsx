import React from 'react';
import TaskLink from './TaskLink';

function TaskList({ labelStartsWith, tasks, disabled }) {

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

  // Render a single task with composite dependency segments
  const renderTask = (task) => (
    <li key={task.id || task.label}>
      <TaskLink
        taskId={task.id}
        label={task.label}
        displayLabel={task.displayLabel}
        disabled={disabled}
      />
    </li>
  );

  return (
    <div className="task-list">
      <ul>
        {filteredTasks.map((task) => renderTask(task))}
      </ul>
    </div>
  );
}

export default TaskList;
