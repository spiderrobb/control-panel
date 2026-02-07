import React from 'react';
import { renderWithTheme, screen, waitFor, simulateExtensionMessage, setupVsCodeApiMock } from './test-utils';
import { TaskStateProvider, useTaskState } from './context';
import { sampleTasks, createRunningTaskState } from '../test/fixtures/tasks';

// Test component to access context
function TestConsumer() {
  const context = useTaskState();
  return (
    <div>
      <div data-testid="tasks-count">{context.tasks.length}</div>
      <div data-testid="running-count">{context.runningTasks.size}</div>
      <div data-testid="starred-count">{context.starredTasks.length}</div>
      <div data-testid="recent-count">{context.recentTasks.length}</div>
      <button onClick={() => context.runTask('npm: test')}>Run Task</button>
      <button onClick={() => context.stopTask('npm: test')}>Stop Task</button>
      <button onClick={() => context.toggleStar('npm: test')}>Toggle Star</button>
    </div>
  );
}

describe('TaskStateProvider', () => {
  let vscodeApi;

  beforeEach(() => {
    vscodeApi = setupVsCodeApiMock();
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    test('provides default empty state', () => {
      renderWithTheme(
        <TaskStateProvider>
          <TestConsumer />
        </TaskStateProvider>
      );

      expect(screen.getByTestId('tasks-count')).toHaveTextContent('0');
      expect(screen.getByTestId('running-count')).toHaveTextContent('0');
      expect(screen.getByTestId('starred-count')).toHaveTextContent('0');
      expect(screen.getByTestId('recent-count')).toHaveTextContent('0');
    });
  });

  describe('Message Handlers', () => {
    test('handles updateTasks message', async () => {
      renderWithTheme(
        <TaskStateProvider>
          <TestConsumer />
        </TaskStateProvider>
      );

      simulateExtensionMessage('updateTasks', { tasks: sampleTasks });

      await waitFor(() => {
        expect(screen.getByTestId('tasks-count')).toHaveTextContent('3');
      });
    });

    test('handles taskStarted message', async () => {
      renderWithTheme(
        <TaskStateProvider>
          <TestConsumer />
        </TaskStateProvider>
      );

      const taskState = createRunningTaskState('npm: test', { state: 'running' });
      simulateExtensionMessage('taskStarted', taskState);

      await waitFor(() => {
        expect(screen.getByTestId('running-count')).toHaveTextContent('1');
      });
    });

    test('handles taskEnded message', async () => {
      renderWithTheme(
        <TaskStateProvider>
          <TestConsumer />
        </TaskStateProvider>
      );

      // Start task
      const taskState = createRunningTaskState('npm: test');
      simulateExtensionMessage('taskStarted', taskState);

      await waitFor(() => {
        expect(screen.getByTestId('running-count')).toHaveTextContent('1');
      });

      // End task
      simulateExtensionMessage('taskEnded', { taskLabel: 'npm: test' });

      await waitFor(() => {
        expect(screen.getByTestId('running-count')).toHaveTextContent('0');
      });
    });

    test('handles taskFailed message', async () => {
      renderWithTheme(
        <TaskStateProvider>
          <TestConsumer />
        </TaskStateProvider>
      );

      const failedState = createRunningTaskState('npm: test', {
        state: 'failed',
        exitCode: 1,
        failureReason: 'Test failed'
      });
      simulateExtensionMessage('taskFailed', failedState);

      await waitFor(() => {
        expect(screen.getByTestId('running-count')).toHaveTextContent('1');
      });
    });

    test('handles taskStateChanged message', async () => {
      renderWithTheme(
        <TaskStateProvider>
          <TestConsumer />
        </TaskStateProvider>
      );

      // Start task
      simulateExtensionMessage('taskStarted', createRunningTaskState('npm: test'));
      await waitFor(() => {
        expect(screen.getByTestId('running-count')).toHaveTextContent('1');
      });

      // Change state to stopping
      simulateExtensionMessage('taskStateChanged', {
        taskLabel: 'npm: test',
        state: 'stopping'
      });

      await waitFor(() => {
        expect(screen.getByTestId('running-count')).toHaveTextContent('1');
      });
    });

    test('handles subtaskStarted message', async () => {
      renderWithTheme(
        <TaskStateProvider>
          <TestConsumer />
        </TaskStateProvider>
      );

      // Start parent task
      const parentState = createRunningTaskState('npm: deploy');
      simulateExtensionMessage('taskStarted', parentState);

      // Start subtask
      simulateExtensionMessage('subtaskStarted', {
        parentLabel: 'npm: deploy',
        taskLabel: 'npm: build',
        startTime: Date.now()
      });

      await waitFor(() => {
        expect(screen.getByTestId('running-count')).toHaveTextContent('1');
      });
    });

    test('handles subtaskEnded message', async () => {
      renderWithTheme(
        <TaskStateProvider>
          <TestConsumer />
        </TaskStateProvider>
      );

      // Start parent with subtask
      const parentState = createRunningTaskState('npm: deploy', {
        subtasks: [{ taskLabel: 'npm: build', startTime: Date.now(), state: 'running' }]
      });
      simulateExtensionMessage('taskStarted', parentState);

      // End subtask
      simulateExtensionMessage('subtaskEnded', {
        parentLabel: 'npm: deploy',
        taskLabel: 'npm: build'
      });

      await waitFor(() => {
        expect(screen.getByTestId('running-count')).toHaveTextContent('1');
      });
    });

    test('handles updateRecentlyUsed message', async () => {
      renderWithTheme(
        <TaskStateProvider>
          <TestConsumer />
        </TaskStateProvider>
      );

      simulateExtensionMessage('updateRecentlyUsed', {
        recentTasks: ['npm: test', 'npm: build']
      });

      await waitFor(() => {
        expect(screen.getByTestId('recent-count')).toHaveTextContent('2');
      });
    });

    test('handles updateStarred message', async () => {
      renderWithTheme(
        <TaskStateProvider>
          <TestConsumer />
        </TaskStateProvider>
      );

      simulateExtensionMessage('updateStarred', {
        starredTasks: ['npm: test', 'npm: build', 'npm: deploy']
      });

      await waitFor(() => {
        expect(screen.getByTestId('starred-count')).toHaveTextContent('3');
      });
    });

    test('handles executionHistory message', async () => {
      const TestHistoryConsumer = () => {
        const { executionHistory } = useTaskState();
        return <div data-testid="history-count">{executionHistory.length}</div>;
      };

      renderWithTheme(
        <TaskStateProvider>
          <TestHistoryConsumer />
        </TaskStateProvider>
      );

      simulateExtensionMessage('executionHistory', {
        history: [
          { id: '1', taskLabel: 'npm: test', success: true },
          { id: '2', taskLabel: 'npm: build', success: false }
        ]
      });

      await waitFor(() => {
        expect(screen.getByTestId('history-count')).toHaveTextContent('2');
      });
    });

    test('handles panelState message', async () => {
      const TestPanelConsumer = () => {
        const { starredPanelExpanded } = useTaskState();
        return <div data-testid="panel-expanded">{String(starredPanelExpanded)}</div>;
      };

      renderWithTheme(
        <TaskStateProvider>
          <TestPanelConsumer />
        </TaskStateProvider>
      );

      simulateExtensionMessage('panelState', {
        starredPanelExpanded: true
      });

      await waitFor(() => {
        expect(screen.getByTestId('panel-expanded')).toHaveTextContent('true');
      });
    });
  });

  describe('Action Functions', () => {
    test('runTask sends correct message', async () => {
      renderWithTheme(
        <TaskStateProvider>
          <TestConsumer />
        </TaskStateProvider>
      );

      const runButton = screen.getByText('Run Task');
      runButton.click();

      await waitFor(() => {
        expect(vscodeApi.postMessage).toHaveBeenCalledWith({
          type: 'runTask',
          taskLabel: 'npm: test'
        });
      });
    });

    test('stopTask sends correct message', async () => {
      renderWithTheme(
        <TaskStateProvider>
          <TestConsumer />
        </TaskStateProvider>
      );

      const stopButton = screen.getByText('Stop Task');
      stopButton.click();

      await waitFor(() => {
        expect(vscodeApi.postMessage).toHaveBeenCalledWith({
          type: 'stopTask',
          taskLabel: 'npm: test'
        });
      });
    });

    test('toggleStar sends correct message', async () => {
      renderWithTheme(
        <TaskStateProvider>
          <TestConsumer />
        </TaskStateProvider>
      );

      const toggleButton = screen.getByText('Toggle Star');
      toggleButton.click();

      await waitFor(() => {
        expect(vscodeApi.postMessage).toHaveBeenCalledWith({
          type: 'toggleStar',
          taskLabel: 'npm: test'
        });
      });
    });
  });

  describe('Computed State - averageDurations', () => {
    test('calculates average durations from execution history', async () => {
      const TestAverageDurationConsumer = () => {
        const { averageDurations } = useTaskState();
        return (
          <div>
            <div data-testid="avg-duration">
              {averageDurations.get('npm: test') || 0}
            </div>
          </div>
        );
      };

      renderWithTheme(
        <TaskStateProvider>
          <TestAverageDurationConsumer />
        </TaskStateProvider>
      );

      // Send history with multiple executions of same task
      simulateExtensionMessage('executionHistory', {
        history: [
          { id: '1', taskLabel: 'npm: test', duration: 10000, success: true },
          { id: '2', taskLabel: 'npm: test', duration: 20000, success: true },
          { id: '3', taskLabel: 'npm: test', duration: 30000, success: true }
        ]
      });

      await waitFor(() => {
        // Average should be (10000 + 20000 + 30000) / 3 = 20000
        expect(screen.getByTestId('avg-duration')).toHaveTextContent('20000');
      });
    });

    test('excludes failed executions from average duration', async () => {
      const TestAverageDurationConsumer = () => {
        const { averageDurations } = useTaskState();
        return (
          <div data-testid="avg-duration">
            {averageDurations.get('npm: test') || 0}
          </div>
        );
      };

      renderWithTheme(
        <TaskStateProvider>
          <TestAverageDurationConsumer />
        </TaskStateProvider>
      );

      simulateExtensionMessage('executionHistory', {
        history: [
          { id: '1', taskLabel: 'npm: test', duration: 10000, success: true },
          { id: '2', taskLabel: 'npm: test', duration: 5000, success: false }, // Should be excluded
          { id: '3', taskLabel: 'npm: test', duration: 20000, success: true }
        ]
      });

      await waitFor(() => {
        // Average should be (10000 + 20000) / 2 = 15000
        expect(screen.getByTestId('avg-duration')).toHaveTextContent('15000');
      });
    });
  });

  describe('State Updates', () => {
    test('updates running task state correctly', async () => {
      renderWithTheme(
        <TaskStateProvider>
          <TestConsumer />
        </TaskStateProvider>
      );

      // Start task
      simulateExtensionMessage('taskStarted', createRunningTaskState('npm: test'));
      await waitFor(() => {
        expect(screen.getByTestId('running-count')).toHaveTextContent('1');
      });

      // Update state
      simulateExtensionMessage('taskStateChanged', {
        taskLabel: 'npm: test',
        state: 'running'
      });

      await waitFor(() => {
        expect(screen.getByTestId('running-count')).toHaveTextContent('1');
      });

      // End task
      simulateExtensionMessage('taskEnded', { taskLabel: 'npm: test' });
      await waitFor(() => {
        expect(screen.getByTestId('running-count')).toHaveTextContent('0');
      });
    });
  });
});
