import React from 'react';
import TaskLink from './TaskLink';

function TaskList({ labelStartsWith, tasks, onRun, onStop, onFocus, onOpenDefinition, runningTasks, starredTasks, onToggleStar, npmPathColorMap, setNpmPathColorMap, disabled }) {

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
        onRun={onRun}
        onStop={onStop}
        onFocus={onFocus}
        onOpenDefinition={onOpenDefinition}
        taskState={runningTasks[task.id || task.label]}
        allRunningTasks={runningTasks}
        dependencySegments={task.dependsOn || []}
        dependsOrder={task.dependsOrder}
        tasks={tasks}
        starredTasks={starredTasks}
        onToggleStar={onToggleStar}
        npmPathColorMap={npmPathColorMap}
        setNpmPathColorMap={setNpmPathColorMap}
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
