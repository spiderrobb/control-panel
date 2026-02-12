import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import RunningTasksPanel from './RunningTasksPanel';
import { sampleTasks, runningTaskStates, createRunningTaskState, sampleLogBuffer } from '../../test/fixtures/tasks';

const testTheme = createTheme({ palette: { mode: 'dark' } });

const mockVscodeApi = {
  postMessage: jest.fn(),
  getState: jest.fn(() => ({})),
  setState: jest.fn()
};
global.acquireVsCodeApi = jest.fn(() => mockVscodeApi);

function renderPanel(props = {}) {
  const defaultProps = {
    runningTasks: {},
    allTasks: sampleTasks,
    onStop: jest.fn(),
    onFocus: jest.fn(),
    onOpenDefinition: jest.fn(),
    onDismiss: jest.fn(),
    onShowLogs: jest.fn(),
    onRequestLogBuffer: jest.fn(),
    logBuffer: [],
    isCollapsed: false,
    onToggleCollapsed: jest.fn()
  };

  return render(
    <ThemeProvider theme={testTheme}>
      <RunningTasksPanel {...defaultProps} {...props} />
    </ThemeProvider>
  );
}

describe('RunningTasksPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  // ─── Rendering ──────────────────────────────────────────────

  describe('Rendering', () => {
    test('empty state: returns null when no running tasks', () => {
      const { container } = renderPanel({ runningTasks: {} });

      expect(container.querySelector('.running-tasks-panel')).not.toBeInTheDocument();
    });

    test('displays running tasks with runtime', () => {
      const runningTasks = {
        test: createRunningTaskState('test', { state: 'running' })
      };

      renderPanel({ runningTasks });

      expect(screen.getByText('test')).toBeInTheDocument();
      expect(screen.getByText(/Running Tasks/)).toBeInTheDocument();
    });

    test('shows failed tasks with error details', () => {
      const runningTasks = {
        test: createRunningTaskState('test', {
          failed: true,
          exitCode: 1,
          failureReason: 'Test suite failed'
        })
      };

      renderPanel({ runningTasks });

      expect(screen.getByText(/Failed/)).toBeInTheDocument();
    });

    test('shows count of running tasks in header', () => {
      const runningTasks = {
        test: createRunningTaskState('test'),
        build: createRunningTaskState('build')
      };

      renderPanel({ runningTasks });

      expect(screen.getByText(/Running Tasks \(2\)/)).toBeInTheDocument();
    });

    test('snapshot: panel with running tasks', () => {
      const runningTasks = {
        test: createRunningTaskState('test')
      };

      const { container } = renderPanel({ runningTasks });

      expect(container).toMatchSnapshot();
    });
  });

  // ─── Hierarchy Rendering ────────────────────────────────────

  describe('Hierarchy', () => {
    test('renders parent task with nested subtasks', () => {
      const runningTasks = {
        deploy: createRunningTaskState('deploy', {
          subtasks: ['build'],
          canFocus: false
        }),
        build: createRunningTaskState('build', {
          parentTask: 'deploy'
        })
      };

      renderPanel({ runningTasks });

      // deploy appears in both the root task name and as parent-task-name in the subtask row
      const deployElements = screen.getAllByText('deploy');
      expect(deployElements.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('build')).toBeInTheDocument();
    });

    test('filters subtasks from root level (shows only root tasks)', () => {
      const runningTasks = {
        deploy: createRunningTaskState('deploy', {
          subtasks: ['build'],
          canFocus: false
        }),
        build: createRunningTaskState('build', {
          parentTask: 'deploy'
        })
      };

      renderPanel({ runningTasks });

      // Should show 2 tasks total but only "deploy" at root
      const header = screen.getByText(/Running Tasks \(2\)/);
      expect(header).toBeInTheDocument();
    });

    test('shows "waiting" state for queued subtasks', () => {
      const runningTasks = {
        deploy: createRunningTaskState('deploy', {
          subtasks: ['build', 'test'],
          canFocus: false
        })
        // 'build' and 'test' are NOT in runningTasks, so they show as waiting
      };

      renderPanel({ runningTasks });

      const waitingElements = screen.getAllByText('waiting');
      expect(waitingElements.length).toBe(2);
    });
  });

  // ─── User Interactions ──────────────────────────────────────

  describe('User Interactions', () => {
    test('toggle collapse/expand panel', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: jest.advanceTimersByTime });
      const onToggleCollapsed = jest.fn();

      const runningTasks = {
        test: createRunningTaskState('test')
      };

      renderPanel({ runningTasks, onToggleCollapsed });

      // Find collapse button
      const collapseIcon = screen.getByTestId('ExpandLessIcon');
      await user.click(collapseIcon.closest('button'));

      expect(onToggleCollapsed).toHaveBeenCalled();
    });

    test('click "Show Logs" → opens extension output', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: jest.advanceTimersByTime });
      const onShowLogs = jest.fn();

      const runningTasks = {
        test: createRunningTaskState('test')
      };

      renderPanel({ runningTasks, onShowLogs, debugMode: true });

      await user.click(screen.getByText('Show Logs'));

      expect(onShowLogs).toHaveBeenCalled();
    });

    test('click stop button → stops running task', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: jest.advanceTimersByTime });
      const onStop = jest.fn();

      const runningTasks = {
        test: createRunningTaskState('test')
      };

      renderPanel({ runningTasks, onStop });

      const stopIcon = screen.getByTestId('StopIcon');
      await user.click(stopIcon.closest('button'));

      expect(onStop).toHaveBeenCalledWith('test');
    });

    test('click focus button → shows task terminal', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: jest.advanceTimersByTime });
      const onFocus = jest.fn();

      const runningTasks = {
        test: createRunningTaskState('test')
      };

      renderPanel({ runningTasks, onFocus });

      const boltIcon = screen.getByTestId('BoltIcon');
      await user.click(boltIcon.closest('button'));

      expect(onFocus).toHaveBeenCalledWith('test');
    });

    test('click dismiss → removes failed task from view', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: jest.advanceTimersByTime });
      const onDismiss = jest.fn();

      const runningTasks = {
        test: createRunningTaskState('test', { failed: true, exitCode: 1 })
      };

      renderPanel({ runningTasks, onDismiss });

      const closeIcon = screen.getByTestId('CloseIcon');
      await user.click(closeIcon.closest('button'));

      expect(onDismiss).toHaveBeenCalledWith('test');
    });

    test('double-click task name → opens definition', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: jest.advanceTimersByTime });
      const onOpenDefinition = jest.fn();

      const runningTasks = {
        test: createRunningTaskState('test')
      };

      renderPanel({ runningTasks, onOpenDefinition });

      const taskName = screen.getByText('test');
      await user.dblClick(taskName);

      expect(onOpenDefinition).toHaveBeenCalledWith('test');
    });
  });

  // ─── Debug Panel ────────────────────────────────────────────

  describe('Debug Panel', () => {
    test('toggle debug info visibility', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: jest.advanceTimersByTime });

      const runningTasks = {
        test: createRunningTaskState('test')
      };

      renderPanel({ runningTasks, debugMode: true });

      // Click Debug Info button
      await user.click(screen.getByText('Debug Info'));

      // Should show debug panel
      await waitFor(() => {
        expect(screen.getByText(/Task State/)).toBeInTheDocument();
      });

      // Click again to hide
      await user.click(screen.getByText('Hide Debug'));

      await waitFor(() => {
        expect(screen.queryByText(/Task State/)).not.toBeInTheDocument();
      });
    });

    test('displays task state JSON', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: jest.advanceTimersByTime });

      const runningTasks = {
        test: createRunningTaskState('test')
      };

      renderPanel({ runningTasks, debugMode: true });

      await user.click(screen.getByText('Debug Info'));

      const textarea = screen.getByRole('textbox');
      expect(textarea.value).toContain('"test"');
    });

    test('shows recent log entries', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: jest.advanceTimersByTime });

      const runningTasks = {
        test: createRunningTaskState('test')
      };

      renderPanel({ runningTasks, logBuffer: sampleLogBuffer, debugMode: true });

      await user.click(screen.getByText('Debug Info'));

      await waitFor(() => {
        expect(screen.getByText(/Task started: test/)).toBeInTheDocument();
        expect(screen.getByText(/Test suite failed/)).toBeInTheDocument();
      });
    });

    test('auto-refreshes log buffer every 2 seconds', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: jest.advanceTimersByTime });
      const onRequestLogBuffer = jest.fn();

      const runningTasks = {
        test: createRunningTaskState('test')
      };

      renderPanel({ runningTasks, onRequestLogBuffer, debugMode: true });

      await user.click(screen.getByText('Debug Info'));

      // Should call immediately
      expect(onRequestLogBuffer).toHaveBeenCalledTimes(1);

      // Advance timer for auto-refresh
      act(() => { jest.advanceTimersByTime(2000); });
      expect(onRequestLogBuffer).toHaveBeenCalledTimes(2);

      act(() => { jest.advanceTimersByTime(2000); });
      expect(onRequestLogBuffer).toHaveBeenCalledTimes(3);
    });

    test('debug button disabled when panel is collapsed', () => {
      const runningTasks = {
        test: createRunningTaskState('test')
      };

      renderPanel({ runningTasks, isCollapsed: true, debugMode: true });

      const debugButton = screen.getByText('Debug Info');
      expect(debugButton.closest('button')).toBeDisabled();
    });
  });

  // ─── Collapsed State ───────────────────────────────────────

  describe('Collapsed State', () => {
    test('hides panel content when collapsed', () => {
      const runningTasks = {
        test: createRunningTaskState('test')
      };

      renderPanel({ runningTasks, isCollapsed: true });

      // Header should still show
      expect(screen.getByText(/Running Tasks/)).toBeInTheDocument();
      // But task name should not be visible in panel content
      expect(screen.queryByText('test')).not.toBeInTheDocument();
    });

    test('shows expand icon when collapsed', () => {
      const runningTasks = {
        test: createRunningTaskState('test')
      };

      renderPanel({ runningTasks, isCollapsed: true });

      expect(screen.getByTestId('ExpandMoreIcon')).toBeInTheDocument();
    });
  });

  // ─── Progress Display ──────────────────────────────────────

  describe('Progress Display', () => {
    test('shows progress bar for task with known duration', () => {
      const runningTasks = {
        test: createRunningTaskState('test', {
          avgDuration: 10000,
          startTime: Date.now() - 5000,
          isFirstRun: false
        })
      };

      const { container } = renderPanel({ runningTasks });

      act(() => { jest.advanceTimersByTime(1000); });

      // Should have a determinate progress bar
      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toBeInTheDocument();
    });

    test('shows indeterminate progress for first run', () => {
      const runningTasks = {
        test: createRunningTaskState('test', {
          isFirstRun: true,
          startTime: Date.now()
        })
      };

      const { container } = renderPanel({ runningTasks });

      // Should have an indeterminate progress bar (MUI LinearProgress without variant="determinate")
      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toBeInTheDocument();
    });
  });
});
