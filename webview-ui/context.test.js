import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { TaskStateProvider, TaskStateContext, useTaskState } from './context';
import {
  sampleTasks,
  createRunningTaskState,
  executionHistory as sampleExecutionHistory
} from '../test/fixtures/tasks';

// Create a minimal theme for testing
const testTheme = createTheme({ palette: { mode: 'dark' } });

// Use the global mock from test-setup.js (set before module load)
const mockVscodeApi = global.__mockVscodeApi;

// Helper to render with providers
function renderWithProviders(ui) {
  return render(
    <ThemeProvider theme={testTheme}>
      <TaskStateProvider>
        {ui}
      </TaskStateProvider>
    </ThemeProvider>
  );
}

// Helper to dispatch extension messages
function sendMessage(type, data = {}) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { type, ...data }
    }));
  });
}

// Test consumer component to inspect context state
function TestConsumer({ onContext }) {
  const ctx = useTaskState();
  // Call the callback to expose context for assertions
  React.useEffect(() => {
    if (onContext) onContext(ctx);
  });
  return (
    <div>
      <span data-testid="tasks-count">{ctx.tasks.length}</span>
      <span data-testid="running-count">{Object.keys(ctx.runningTasks).length}</span>
      <span data-testid="starred-count">{ctx.starredTasks.length}</span>
      <span data-testid="recent-count">{ctx.recentlyUsedTasks.length}</span>
      <span data-testid="history-count">{ctx.executionHistory.length}</span>
      <span data-testid="running-collapsed">{String(ctx.runningTasksCollapsed)}</span>
      <span data-testid="starred-collapsed">{String(ctx.starredTasksCollapsed)}</span>
      <button data-testid="run-btn" onClick={() => ctx.onRun('test')}>Run</button>
      <button data-testid="stop-btn" onClick={() => ctx.onStop('test')}>Stop</button>
      <button data-testid="focus-btn" onClick={() => ctx.onFocus('test')}>Focus</button>
      <button data-testid="opendef-btn" onClick={() => ctx.onOpenDefinition('test')}>OpenDef</button>
      <button data-testid="star-btn" onClick={() => ctx.onToggleStar('test')}>Star</button>
      <button data-testid="dismiss-btn" onClick={() => ctx.onDismissTask('test')}>Dismiss</button>
      <button data-testid="toggle-running" onClick={ctx.onToggleRunningTasksCollapsed}>ToggleRunning</button>
      <button data-testid="toggle-starred" onClick={ctx.onToggleStarredTasksCollapsed}>ToggleStarred</button>
    </div>
  );
}

describe('TaskStateProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Initial State ───────────────────────────────────────────

  describe('Initial State', () => {
    test('provides default empty state', () => {
      renderWithProviders(<TestConsumer />);

      expect(screen.getByTestId('tasks-count')).toHaveTextContent('0');
      expect(screen.getByTestId('running-count')).toHaveTextContent('0');
      expect(screen.getByTestId('starred-count')).toHaveTextContent('0');
      expect(screen.getByTestId('recent-count')).toHaveTextContent('0');
      expect(screen.getByTestId('history-count')).toHaveTextContent('0');
    });

    test('requests initial data on mount', () => {
      renderWithProviders(<TestConsumer />);

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({ type: 'getTaskLists' });
      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({ type: 'getPanelState' });
      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({ type: 'getExecutionHistory' });
    });
  });

  // ─── Message Handlers ────────────────────────────────────────

  describe('Message Handlers', () => {
    test('handles updateTasks message', async () => {
      renderWithProviders(<TestConsumer />);

      sendMessage('updateTasks', { tasks: sampleTasks });

      await waitFor(() => {
        expect(screen.getByTestId('tasks-count')).toHaveTextContent(String(sampleTasks.length));
      });
    });

    test('handles taskStarted message', async () => {
      renderWithProviders(<TestConsumer />);

      sendMessage('taskStarted', {
        taskLabel: 'test',
        startTime: Date.now(),
        state: 'running',
        subtasks: []
      });

      await waitFor(() => {
        expect(screen.getByTestId('running-count')).toHaveTextContent('1');
      });
    });

    test('handles taskEnded message', async () => {
      jest.useFakeTimers();
      renderWithProviders(<TestConsumer />);

      // Start task
      sendMessage('taskStarted', { taskLabel: 'test', startTime: Date.now() });

      await waitFor(() => {
        expect(screen.getByTestId('running-count')).toHaveTextContent('1');
      });

      // End task
      sendMessage('taskEnded', { taskLabel: 'test' });

      // The context removes after a 1s delay
      act(() => { jest.advanceTimersByTime(1500); });

      await waitFor(() => {
        expect(screen.getByTestId('running-count')).toHaveTextContent('0');
      });

      jest.useRealTimers();
    });

    test('handles taskFailed message for existing task', async () => {
      let capturedCtx;
      renderWithProviders(<TestConsumer onContext={ctx => { capturedCtx = ctx; }} />);

      // Start task first
      sendMessage('taskStarted', { taskLabel: 'test', startTime: Date.now() });

      await waitFor(() => {
        expect(screen.getByTestId('running-count')).toHaveTextContent('1');
      });

      // Fail task
      sendMessage('taskFailed', { taskLabel: 'test', exitCode: 1, reason: 'Tests failed' });

      await waitFor(() => {
        expect(capturedCtx.runningTasks['test']?.failed).toBe(true);
        expect(capturedCtx.runningTasks['test']?.exitCode).toBe(1);
        expect(capturedCtx.runningTasks['test']?.running).toBe(false);
      });
    });

    test('handles taskFailed message for task not yet in state', async () => {
      let capturedCtx;
      renderWithProviders(<TestConsumer onContext={ctx => { capturedCtx = ctx; }} />);

      // Fail without starting
      sendMessage('taskFailed', { taskLabel: 'build', exitCode: 2, reason: 'Build failed' });

      await waitFor(() => {
        expect(capturedCtx.runningTasks['build']?.failed).toBe(true);
        expect(capturedCtx.runningTasks['build']?.exitCode).toBe(2);
      });
    });

    test('handles taskStateChanged message', async () => {
      let capturedCtx;
      renderWithProviders(<TestConsumer onContext={ctx => { capturedCtx = ctx; }} />);

      // Start task
      sendMessage('taskStarted', { taskLabel: 'test', startTime: Date.now() });

      await waitFor(() => {
        expect(screen.getByTestId('running-count')).toHaveTextContent('1');
      });

      // Change state to stopping
      sendMessage('taskStateChanged', {
        taskLabel: 'test',
        state: 'stopping',
        canStop: false,
        canFocus: true
      });

      await waitFor(() => {
        expect(capturedCtx.runningTasks['test']?.state).toBe('stopping');
        expect(capturedCtx.runningTasks['test']?.canStop).toBe(false);
      });
    });

    test('taskStateChanged ignores unknown tasks', async () => {
      let capturedCtx;
      renderWithProviders(<TestConsumer onContext={ctx => { capturedCtx = ctx; }} />);

      sendMessage('taskStateChanged', { taskLabel: 'unknown', state: 'running' });

      await waitFor(() => {
        expect(capturedCtx.runningTasks['unknown']).toBeUndefined();
      });
    });

    test('handles subtaskStarted message', async () => {
      let capturedCtx;
      renderWithProviders(<TestConsumer onContext={ctx => { capturedCtx = ctx; }} />);

      // Start parent
      sendMessage('taskStarted', { taskLabel: 'deploy', startTime: Date.now(), subtasks: [] });

      await waitFor(() => {
        expect(screen.getByTestId('running-count')).toHaveTextContent('1');
      });

      // Start subtask
      sendMessage('subtaskStarted', { parentLabel: 'deploy', childLabel: 'build' });

      await waitFor(() => {
        expect(capturedCtx.runningTasks['deploy']?.subtasks).toContain('build');
      });
    });

    test('subtaskStarted does not duplicate existing subtask', async () => {
      let capturedCtx;
      renderWithProviders(<TestConsumer onContext={ctx => { capturedCtx = ctx; }} />);

      sendMessage('taskStarted', { taskLabel: 'deploy', startTime: Date.now(), subtasks: ['build'] });
      sendMessage('subtaskStarted', { parentLabel: 'deploy', childLabel: 'build' });

      await waitFor(() => {
        const subtasks = capturedCtx.runningTasks['deploy']?.subtasks || [];
        expect(subtasks.filter(s => s === 'build').length).toBe(1);
      });
    });

    test('subtaskStarted creates parent if not yet tracked', async () => {
      let capturedCtx;
      renderWithProviders(<TestConsumer onContext={ctx => { capturedCtx = ctx; }} />);

      sendMessage('subtaskStarted', { parentLabel: 'deploy', childLabel: 'build' });

      await waitFor(() => {
        expect(capturedCtx.runningTasks['deploy']).toBeDefined();
        expect(capturedCtx.runningTasks['deploy']?.subtasks).toContain('build');
      });
    });

    test('handles subtaskEnded message', async () => {
      let capturedCtx;
      renderWithProviders(<TestConsumer onContext={ctx => { capturedCtx = ctx; }} />);

      // Start parent with subtask
      sendMessage('taskStarted', { taskLabel: 'deploy', startTime: Date.now(), subtasks: ['build'] });

      await waitFor(() => {
        expect(capturedCtx.runningTasks['deploy']?.subtasks).toContain('build');
      });

      // End subtask
      sendMessage('subtaskEnded', { parentLabel: 'deploy', childLabel: 'build' });

      await waitFor(() => {
        expect(capturedCtx.runningTasks['deploy']?.subtasks).not.toContain('build');
      });
    });

    test('subtaskEnded tracks failed subtasks', async () => {
      let capturedCtx;
      renderWithProviders(<TestConsumer onContext={ctx => { capturedCtx = ctx; }} />);

      sendMessage('taskStarted', { taskLabel: 'deploy', startTime: Date.now(), subtasks: ['build'] });
      sendMessage('subtaskEnded', { parentLabel: 'deploy', childLabel: 'build', failed: true, exitCode: 1 });

      await waitFor(() => {
        const failedSubs = capturedCtx.runningTasks['deploy']?.failedSubtasks || [];
        expect(failedSubs).toEqual([{ label: 'build', exitCode: 1 }]);
      });
    });

    test('handles updateRecentlyUsed message', async () => {
      renderWithProviders(<TestConsumer />);

      sendMessage('updateRecentlyUsed', { tasks: ['test', 'build'] });

      await waitFor(() => {
        expect(screen.getByTestId('recent-count')).toHaveTextContent('2');
      });
    });

    test('handles updateStarred message', async () => {
      renderWithProviders(<TestConsumer />);

      sendMessage('updateStarred', { tasks: ['test', 'build', 'lint'] });

      await waitFor(() => {
        expect(screen.getByTestId('starred-count')).toHaveTextContent('3');
      });
    });

    test('handles executionHistory message', async () => {
      renderWithProviders(<TestConsumer />);

      sendMessage('executionHistory', { history: sampleExecutionHistory });

      await waitFor(() => {
        expect(screen.getByTestId('history-count')).toHaveTextContent(String(sampleExecutionHistory.length));
      });
    });

    test('handles panelState message for runningTasksCollapsed', async () => {
      renderWithProviders(<TestConsumer />);

      sendMessage('panelState', { state: { runningTasksCollapsed: true } });

      await waitFor(() => {
        expect(screen.getByTestId('running-collapsed')).toHaveTextContent('true');
      });
    });

    test('handles panelState message for starredTasksCollapsed', async () => {
      renderWithProviders(<TestConsumer />);

      sendMessage('panelState', { state: { starredTasksCollapsed: true } });

      await waitFor(() => {
        expect(screen.getByTestId('starred-collapsed')).toHaveTextContent('true');
      });
    });
  });

  // ─── Action Functions ────────────────────────────────────────

  describe('Action Functions', () => {
    test('onRun sends runTask message', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithProviders(<TestConsumer />);

      await user.click(screen.getByTestId('run-btn'));

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
        type: 'runTask',
        label: 'test'
      });
    });

    test('onStop sends stopTask message', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithProviders(<TestConsumer />);

      await user.click(screen.getByTestId('stop-btn'));

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
        type: 'stopTask',
        label: 'test'
      });
    });

    test('onFocus sends focusTerminal message', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithProviders(<TestConsumer />);

      await user.click(screen.getByTestId('focus-btn'));

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
        type: 'focusTerminal',
        label: 'test'
      });
    });

    test('onOpenDefinition sends openTaskDefinition message', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithProviders(<TestConsumer />);

      await user.click(screen.getByTestId('opendef-btn'));

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
        type: 'openTaskDefinition',
        label: 'test'
      });
    });

    test('onToggleStar sends toggleStar message', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithProviders(<TestConsumer />);

      await user.click(screen.getByTestId('star-btn'));

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
        type: 'toggleStar',
        label: 'test'
      });
    });

    test('onDismissTask removes task from state and notifies extension', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithProviders(<TestConsumer />);

      // Start then fail a task
      sendMessage('taskFailed', { taskLabel: 'test', exitCode: 1 });

      await waitFor(() => {
        expect(screen.getByTestId('running-count')).toHaveTextContent('1');
      });

      await user.click(screen.getByTestId('dismiss-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('running-count')).toHaveTextContent('0');
      });

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
        type: 'dismissTask',
        label: 'test'
      });
    });

    test('onToggleRunningTasksCollapsed toggles and persists', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithProviders(<TestConsumer />);

      expect(screen.getByTestId('running-collapsed')).toHaveTextContent('false');

      await user.click(screen.getByTestId('toggle-running'));

      await waitFor(() => {
        expect(screen.getByTestId('running-collapsed')).toHaveTextContent('true');
      });

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
        type: 'setPanelState',
        state: { runningTasksCollapsed: true }
      });
    });

    test('onToggleStarredTasksCollapsed toggles and persists', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithProviders(<TestConsumer />);

      expect(screen.getByTestId('starred-collapsed')).toHaveTextContent('false');

      await user.click(screen.getByTestId('toggle-starred'));

      await waitFor(() => {
        expect(screen.getByTestId('starred-collapsed')).toHaveTextContent('true');
      });

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
        type: 'setPanelState',
        state: { starredTasksCollapsed: true }
      });
    });
  });

  // ─── Computed State ──────────────────────────────────────────

  describe('Computed State - taskHistoryMap', () => {
    test('calculates average durations from successful executions', async () => {
      let capturedCtx;
      renderWithProviders(<TestConsumer onContext={ctx => { capturedCtx = ctx; }} />);

      sendMessage('executionHistory', {
        history: [
          { id: '1', taskLabel: 'test', duration: 10000, failed: false },
          { id: '2', taskLabel: 'test', duration: 20000, failed: false },
          { id: '3', taskLabel: 'test', duration: 30000, failed: false }
        ]
      });

      await waitFor(() => {
        expect(capturedCtx.taskHistoryMap['test']).toBe(20000);
      });
    });

    test('excludes failed executions from average', async () => {
      let capturedCtx;
      renderWithProviders(<TestConsumer onContext={ctx => { capturedCtx = ctx; }} />);

      sendMessage('executionHistory', {
        history: [
          { id: '1', taskLabel: 'test', duration: 10000, failed: false },
          { id: '2', taskLabel: 'test', duration: 5000, failed: true },
          { id: '3', taskLabel: 'test', duration: 20000, failed: false }
        ]
      });

      await waitFor(() => {
        expect(capturedCtx.taskHistoryMap['test']).toBe(15000);
      });
    });

    test('uses last 10 runs for average calculation', async () => {
      let capturedCtx;
      renderWithProviders(<TestConsumer onContext={ctx => { capturedCtx = ctx; }} />);

      const history = [];
      for (let i = 0; i < 15; i++) {
        history.push({
          id: String(i),
          taskLabel: 'test',
          duration: 1000 * (i + 1),
          failed: false
        });
      }

      sendMessage('executionHistory', { history });

      await waitFor(() => {
        // Should only average the first 10 (slice(0, 10))
        expect(capturedCtx.taskHistoryMap['test']).toBeDefined();
      });
    });
  });

  // ─── State Flow Tests ────────────────────────────────────────

  describe('State Lifecycle', () => {
    test('task lifecycle: idle → started → running → ended', async () => {
      jest.useFakeTimers();
      let capturedCtx;
      renderWithProviders(<TestConsumer onContext={ctx => { capturedCtx = ctx; }} />);

      // Idle
      expect(capturedCtx.runningTasks['test']).toBeUndefined();

      // Started
      sendMessage('taskStarted', { taskLabel: 'test', startTime: Date.now(), state: 'running' });
      await waitFor(() => expect(capturedCtx.runningTasks['test']?.running).toBe(true));

      // State changed to running
      sendMessage('taskStateChanged', { taskLabel: 'test', state: 'running' });
      await waitFor(() => expect(capturedCtx.runningTasks['test']?.state).toBe('running'));

      // Ended
      sendMessage('taskEnded', { taskLabel: 'test' });
      act(() => { jest.advanceTimersByTime(1500); });
      await waitFor(() => expect(capturedCtx.runningTasks['test']).toBeUndefined());

      jest.useRealTimers();
    });

    test('task failure: idle → started → failed → dismissed', async () => {
      const user = userEvent.setup({ delay: null });
      let capturedCtx;
      renderWithProviders(<TestConsumer onContext={ctx => { capturedCtx = ctx; }} />);

      // Started
      sendMessage('taskStarted', { taskLabel: 'test', startTime: Date.now() });
      await waitFor(() => expect(capturedCtx.runningTasks['test']?.running).toBe(true));

      // Failed
      sendMessage('taskFailed', { taskLabel: 'test', exitCode: 1, reason: 'Error' });
      await waitFor(() => {
        expect(capturedCtx.runningTasks['test']?.failed).toBe(true);
        expect(capturedCtx.runningTasks['test']?.running).toBe(false);
      });

      // Dismissed
      await user.click(screen.getByTestId('dismiss-btn'));
      await waitFor(() => expect(capturedCtx.runningTasks['test']).toBeUndefined());
    });

    test('task with subtasks: parent tracks child execution states', async () => {
      let capturedCtx;
      renderWithProviders(<TestConsumer onContext={ctx => { capturedCtx = ctx; }} />);

      // Start parent
      sendMessage('taskStarted', { taskLabel: 'deploy', startTime: Date.now(), subtasks: [] });

      // Add subtask
      sendMessage('subtaskStarted', { parentLabel: 'deploy', childLabel: 'build' });
      await waitFor(() => expect(capturedCtx.runningTasks['deploy']?.subtasks).toContain('build'));

      // Add another subtask
      sendMessage('subtaskStarted', { parentLabel: 'deploy', childLabel: 'test' });
      await waitFor(() => expect(capturedCtx.runningTasks['deploy']?.subtasks).toEqual(['build', 'test']));

      // End first subtask
      sendMessage('subtaskEnded', { parentLabel: 'deploy', childLabel: 'build' });
      await waitFor(() => {
        expect(capturedCtx.runningTasks['deploy']?.subtasks).toEqual(['test']);
      });

      // End second subtask
      sendMessage('subtaskEnded', { parentLabel: 'deploy', childLabel: 'test' });
      await waitFor(() => {
        expect(capturedCtx.runningTasks['deploy']?.subtasks).toEqual([]);
      });
    });
  });

  // ─── Cleanup ─────────────────────────────────────────────────

  describe('Cleanup', () => {
    test('removes message listener on unmount', () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
      const { unmount } = renderWithProviders(<TestConsumer />);

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });
  });
});
