import React from 'react';
import TaskLink from './TaskLink';

function TaskList({ labelStartsWith, tasks, disabled }) {

  const filteredTasks = tasks
    .filter(task => task.label.startsWith(labelStartsWith))
    .sort((a, b) => {
      const aIsWorkspace = a.source === 'Workspace';
      const bIsWorkspace = b.source === 'Workspace';

      // tasks.json (Workspace) tasks come first
      if (aIsWorkspace && !bIsWorkspace) return -1;
      if (!aIsWorkspace && bIsWorkspace) return 1;

      // Within non-Workspace tasks, group by npm workspace path
      if (!aIsWorkspace && !bIsWorkspace) {
        const aPath = a.definition?.path || '';
        const bPath = b.definition?.path || '';
        if (aPath !== bPath) return aPath.localeCompare(bPath);
      }

      // Within each group, sort alphabetically
      return a.label.localeCompare(b.label);
    });

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
