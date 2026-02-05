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

  return (
    <div className="task-list">
      <ul>
        {filteredTasks.map((task) => (
          <li key={task.label}>
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
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TaskList;
