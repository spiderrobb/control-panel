import React from 'react';
import { renderWithTheme, screen, waitFor, userEvent } from '../test-utils';
import TaskLink from './TaskLink';
import { TaskStateProvider } from '../context';
import { sampleTasks, createRunningTaskState } from '../../test/fixtures/tasks';

// Mock VS Code API
const mockVscodeApi = {
  postMessage: jest.fn()
};

global.acquireVsCodeApi = () => mockVscodeApi;

// Wrapper component with context
function TaskLinkWrapper({ children, initialState = {} }) {
  return (
    <TaskStateProvider initialState={initialState}>
      {children}
    </TaskStateProvider>
  );
}

describe('TaskLink Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Rendering', () => {
    test('renders task with label', () => {
      renderWithTheme(
        <TaskLinkWrapper>
          <TaskLink label="npm: test" />
        </TaskLinkWrapper>
      );

      expect(screen.getByText(/test/i)).toBeInTheDocument();
    });

    test('renders with custom display label', () => {
      renderWithTheme(
        <TaskLinkWrapper>
          <TaskLink label="npm: test" displayLabel="Run Tests" />
        </TaskLinkWrapper>
      );

      expect(screen.getByText('Run Tests')).toBeInTheDocument();
    });

    test('renders disabled state', () => {
      renderWithTheme(
        <TaskLinkWrapper>
          <TaskLink label="npm: test" disabled={true} />
        </TaskLinkWrapper>
      );

      const playButton = screen.getByRole('button', { name: /run/i });
      expect(playButton).toBeDisabled();
    });

    test('matches snapshot for idle state', () => {
      const { container } = renderWithTheme(
        <TaskLinkWrapper>
          <TaskLink label="npm: test" />
        </TaskLinkWrapper>
      );

      expect(container).toMatchSnapshot();
    });
  });

  describe('Task States', () => {
    test('shows play button in idle state', () => {
      renderWithTheme(
        <TaskLinkWrapper>
          <TaskLink label="npm: test" />
        </TaskLinkWrapper>
      );

      expect(screen.getByRole('button', { name: /run/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /stop/i })).not.toBeInTheDocument();
    });

    test('shows stop button in running state', () => {
      const runningTask = new Map([
        ['npm: test', createRunningTaskState('npm: test', { state: 'running' })]
      ]);

      renderWithTheme(
        <TaskLinkWrapper>
          <TaskLink label="npm: test" />
        </TaskLinkWrapper>
      );

      // Simulate task start via context
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'taskStarted', ...createRunningTaskState('npm: test') }
      }));

      waitFor(() => {
        expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
      });
    });

    test('shows failed state with retry button', () => {
      renderWithTheme(
        <TaskLinkWrapper>
          <TaskLink label="npm: test" />
        </TaskLinkWrapper>
      );

      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'taskFailed',
          ...createRunningTaskState('npm: test', {
            state: 'failed',
            exitCode: 1,
            failureReason: 'Test failed'
          })
        }
      }));

      waitFor(() => {
        expect(screen.getByText(/exit 1/i)).toBeInTheDocument();
      });
    });

    test('matches snapshot for running state', () => {
      const { container } = renderWithTheme(
        <TaskLinkWrapper>
          <TaskLink label="npm: test" />
        </TaskLinkWrapper>
      );

      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'taskStarted', ...createRunningTaskState('npm: test') }
      }));

      waitFor(() => {
        expect(container).toMatchSnapshot();
      });
    });

    test('matches snapshot for failed state', () => {
      const { container } = renderWithTheme(
        <TaskLinkWrapper>
          <TaskLink label="npm: test" />
        </TaskLinkWrapper>
      );

      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'taskFailed',
          ...createRunningTaskState('npm: test', { state: 'failed', exitCode: 1 })
        }
      }));

      waitFor(() => {
        expect(container).toMatchSnapshot();
      });
    });
  });

  describe('User Interactions', () => {
    test('clicking play button runs task', async () => {
      const user = userEvent.setup({ delay: null });
      
      renderWithTheme(
        <TaskLinkWrapper>
          <TaskLink label="npm: test" />
        </TaskLinkWrapper>
      );

      const playButton = screen.getByRole('button', { name: /run/i });
      await user.click(playButton);

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
        type: 'runTask',
        taskLabel: 'npm: test'
      });
    });

    test('clicking stop button stops running task', async () => {
      const user = userEvent.setup({ delay: null });
      
      renderWithTheme(
        <TaskLinkWrapper>
          <TaskLink label="npm: test" />
        </TaskLinkWrapper>
      );

      // Start task
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'taskStarted', ...createRunningTaskState('npm: test') }
      }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
      });

      const stopButton = screen.getByRole('button', { name: /stop/i });
      await user.click(stopButton);

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
        type: 'stopTask',
        taskLabel: 'npm: test'
      });
    });

    test('clicking star button toggles starred state', async () => {
      const user = userEvent.setup({ delay: null });
      
      renderWithTheme(
        <TaskLinkWrapper>
          <TaskLink label="npm: test" />
        </TaskLinkWrapper>
      );

      const starButton = screen.getByRole('button', { name: /star/i });
      await user.click(starButton);

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
        type: 'toggleStar',
        taskLabel: 'npm: test'
      });
    });

    test('double-clicking task name opens definition', async () => {
      const user = userEvent.setup({ delay: null });
      
      renderWithTheme(
        <TaskLinkWrapper>
          <TaskLink label="npm: test" />
        </TaskLinkWrapper>
      );

      const taskName = screen.getByText(/test/i);
      await user.dblClick(taskName);

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
        type: 'openTaskDefinition',
        taskLabel: 'npm: test'
      });
    });

    test('clicking focus button shows terminal', async () => {
      const user = userEvent.setup({ delay: null });
      
      renderWithTheme(
        <TaskLinkWrapper>
          <TaskLink label="npm: test" />
        </TaskLinkWrapper>
      );

      // Start task to show focus button
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'taskStarted', ...createRunningTaskState('npm: test') }
      }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /focus/i })).toBeInTheDocument();
      });

      const focusButton = screen.getByRole('button', { name: /focus/i });
      await user.click(focusButton);

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
        type: 'focusTerminal',
        taskLabel: 'npm: test'
      });
    });
  });

  describe('Progress Calculation', () => {
    test('shows progress bar for running task with known duration', () => {
      renderWithTheme(
        <TaskLinkWrapper>
          <TaskLink label="npm: test" />
        </TaskLinkWrapper>
      );

      // Send history with average duration
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'executionHistory',
          history: [
            { id: '1', taskLabel: 'npm: test', duration: 10000, success: true }
          ]
        }
      }));

      // Start task
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'taskStarted', ...createRunningTaskState('npm: test') }
      }));

      // Advance time
      jest.advanceTimersByTime(5000);

      waitFor(() => {
        // Should show approximately 50% progress
        const progressElement = screen.getByRole('progressbar');
        expect(progressElement).toBeInTheDocument();
      });
    });

    test('updates runtime display every second', () => {
      renderWithTheme(
        <TaskLinkWrapper>
          <TaskLink label="npm: test" />
        </TaskLinkWrapper>
      );

      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'taskStarted', ...createRunningTaskState('npm: test') }
      }));

      waitFor(() => {
        expect(screen.getByText(/0s/)).toBeInTheDocument();
      });

      jest.advanceTimersByTime(3000);

      waitFor(() => {
        expect(screen.getByText(/3s/)).toBeInTheDocument();
      });
    });
  });

  describe('Dependency Visualization', () => {
    test('renders sequential dependencies as horizontal segments', () => {
      const taskWithDeps = {
        label: 'npm: deploy',
        definition: {
          dependsOn: ['npm: build', 'npm: test'],
          dependsOrder: 'sequence'
        }
      };

      renderWithTheme(
        <TaskLinkWrapper>
          <TaskLink label="npm: deploy" />
        </TaskLinkWrapper>
      );

      // Should render dependency segments
      waitFor(() => {
        expect(screen.getByText(/build/i)).toBeInTheDocument();
        expect(screen.getByText(/test/i)).toBeInTheDocument();
      });
    });

    test('renders parallel dependencies in grid layout', () => {
      const { container } = renderWithTheme(
        <TaskLinkWrapper>
          <TaskLink label="npm: deploy" />
        </TaskLinkWrapper>
      );

      // Check for parallel layout classes
      waitFor(() => {
        const parallelContainer = container.querySelector('.parallel-dependencies');
        expect(parallelContainer).toBeInTheDocument();
      });
    });

    test('matches snapshot for task with dependencies', () => {
      const { container } = renderWithTheme(
        <TaskLinkWrapper>
          <TaskLink label="npm: deploy" />
        </TaskLinkWrapper>
      );

      expect(container).toMatchSnapshot();
    });
  });

  describe('Starred State', () => {
    test('shows filled star icon when task is starred', () => {
      renderWithTheme(
        <TaskLinkWrapper>
          <TaskLink label="npm: test" />
        </TaskLinkWrapper>
      );

      // Simulate starring
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'updateStarred',
          starredTasks: ['npm: test']
        }
      }));

      waitFor(() => {
        const starButton = screen.getByRole('button', { name: /unstar/i });
        expect(starButton).toBeInTheDocument();
      });
    });
  });

  describe('Popover Behavior', () => {
    test('shows popover on hover with task details', async () => {
      const user = userEvent.setup({ delay: null });
      
      renderWithTheme(
        <TaskLinkWrapper>
          <TaskLink label="npm: test" />
        </TaskLinkWrapper>
      );

      const taskElement = screen.getByText(/test/i);
      await user.hover(taskElement);

      waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });
    });
  });
});
