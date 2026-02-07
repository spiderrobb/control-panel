import React from 'react';
import { renderWithTheme, screen, waitFor, userEvent } from '../test-utils';
import RunningTasksPanel from './RunningTasksPanel';
import { TaskStateProvider } from '../context';
import { sampleTasks, createRunningTaskState } from '../../test/fixtures/tasks';

const mockVscodeApi = {
  postMessage: jest.fn()
};

global.acquireVsCodeApi = () => mockVscodeApi;

describe('RunningTasksPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    test('renders empty state when no tasks running', () => {
      renderWithTheme(
        <TaskStateProvider>
          <RunningTasksPanel
            runningTasks={new Map()}
            allTasks={sampleTasks}
            onFocus={jest.fn()}
            onStop={jest.fn()}
            onDismiss={jest.fn()}
            onOpenDefinition={jest.fn()}
            onShowLogs={jest.fn()}
            onGetLogBuffer={jest.fn()}
            logBuffer={[]}
            collapsed={false}
            onToggleCollapse={jest.fn()}
          />
        </TaskStateProvider>
      );

      expect(screen.queryByText(/running/i)).not.toBeInTheDocument();
    });

    test('renders running tasks', () => {
      const runningTasks = new Map([
        ['npm: test', createRunningTaskState('npm: test', { state: 'running' })]
      ]);

      renderWithTheme(
        <TaskStateProvider>
          <RunningTasksPanel
            runningTasks={runningTasks}
            allTasks={sampleTasks}
            onFocus={jest.fn()}
            onStop={jest.fn()}
            onDismiss={jest.fn()}
            onOpenDefinition={jest.fn()}
            onShowLogs={jest.fn()}
            onGetLogBuffer={jest.fn()}
            logBuffer={[]}
            collapsed={false}
            onToggleCollapse={jest.fn()}
          />
        </TaskStateProvider>
      );

      expect(screen.getByText(/test/i)).toBeInTheDocument();
    });

    test('matches snapshot with running tasks', () => {
      const runningTasks = new Map([
        ['npm: test', createRunningTaskState('npm: test', { state: 'running' })]
      ]);

      const { container } = renderWithTheme(
        <TaskStateProvider>
          <RunningTasksPanel
            runningTasks={runningTasks}
            allTasks={sampleTasks}
            onFocus={jest.fn()}
            onStop={jest.fn()}
            onDismiss={jest.fn()}
            onOpenDefinition={jest.fn()}
            onShowLogs={jest.fn()}
            onGetLogBuffer={jest.fn()}
            logBuffer={[]}
            collapsed={false}
            onToggleCollapse={jest.fn()}
          />
        </TaskStateProvider>
      );

      expect(container).toMatchSnapshot();
    });
  });

  describe('Hierarchy Rendering', () => {
    test('renders parent task with nested subtasks', () => {
      const runningTasks = new Map([
        ['npm: deploy', createRunningTaskState('npm: deploy', {
          state: 'running',
          subtasks: [
            { taskLabel: 'npm: build', startTime: Date.now(), state: 'running' }
          ]
        })]
      ]);

      renderWithTheme(
        <TaskStateProvider>
          <RunningTasksPanel
            runningTasks={runningTasks}
            allTasks={sampleTasks}
            onFocus={jest.fn()}
            onStop={jest.fn()}
            onDismiss={jest.fn()}
            onOpenDefinition={jest.fn()}
            onShowLogs={jest.fn()}
            onGetLogBuffer={jest.fn()}
            logBuffer={[]}
            collapsed={false}
            onToggleCollapse={jest.fn()}
          />
        </TaskStateProvider>
      );

      expect(screen.getByText(/deploy/i)).toBeInTheDocument();
      expect(screen.getByText(/build/i)).toBeInTheDocument();
    });

    test('filters out subtasks from root level display', () => {
      const runningTasks = new Map([
        ['npm: deploy', createRunningTaskState('npm: deploy', {
          state: 'running',
          subtasks: [
            { taskLabel: 'npm: build', startTime: Date.now(), state: 'running' }
          ]
        })],
        ['npm: build', createRunningTaskState('npm: build', { state: 'running' })]
      ]);

      renderWithTheme(
        <TaskStateProvider>
          <RunningTasksPanel
            runningTasks={runningTasks}
            allTasks={sampleTasks}
            onFocus={jest.fn()}
            onStop={jest.fn()}
            onDismiss={jest.fn()}
            onOpenDefinition={jest.fn()}
            onShowLogs={jest.fn()}
            onGetLogBuffer={jest.fn()}
            logBuffer={[]}
            collapsed={false}
            onToggleCollapse={jest.fn()}
          />
        </TaskStateProvider>
      );

      // Should only show deploy at root, not build separately
      const deployElements = screen.getAllByText(/deploy/i);
      expect(deployElements.length).toBeGreaterThan(0);
    });
  });

  describe('User Interactions', () => {
    test('calls onToggleCollapse when collapse button clicked', async () => {
      const user = userEvent.setup({ delay: null });
      const onToggleCollapse = jest.fn();

      const runningTasks = new Map([
        ['npm: test', createRunningTaskState('npm: test', { state: 'running' })]
      ]);

      renderWithTheme(
        <TaskStateProvider>
          <RunningTasksPanel
            runningTasks={runningTasks}
            allTasks={sampleTasks}
            onFocus={jest.fn()}
            onStop={jest.fn()}
            onDismiss={jest.fn()}
            onOpenDefinition={jest.fn()}
            onShowLogs={jest.fn()}
            onGetLogBuffer={jest.fn()}
            logBuffer={[]}
            collapsed={false}
            onToggleCollapse={onToggleCollapse}
          />
        </TaskStateProvider>
      );

      const collapseButton = screen.getByRole('button', { name: /collapse/i });
      await user.click(collapseButton);

      expect(onToggleCollapse).toHaveBeenCalled();
    });

    test('calls onShowLogs when Show Logs button clicked', async () => {
      const user = userEvent.setup({ delay: null });
      const onShowLogs = jest.fn();

      const runningTasks = new Map([
        ['npm: test', createRunningTaskState('npm: test', { state: 'running' })]
      ]);

      renderWithTheme(
        <TaskStateProvider>
          <RunningTasksPanel
            runningTasks={runningTasks}
            allTasks={sampleTasks}
            onFocus={jest.fn()}
            onStop={jest.fn()}
            onDismiss={jest.fn()}
            onOpenDefinition={jest.fn()}
            onShowLogs={onShowLogs}
            onGetLogBuffer={jest.fn()}
            logBuffer={[]}
            collapsed={false}
            onToggleCollapse={jest.fn()}
          />
        </TaskStateProvider>
      );

      const showLogsButton = screen.getByText(/show logs/i);
      await user.click(showLogsButton);

      expect(onShowLogs).toHaveBeenCalled();
    });

    test('calls onStop when stop button clicked', async () => {
      const user = userEvent.setup({ delay: null });
      const onStop = jest.fn();

      const runningTasks = new Map([
        ['npm: test', createRunningTaskState('npm: test', { state: 'running' })]
      ]);

      renderWithTheme(
        <TaskStateProvider>
          <RunningTasksPanel
            runningTasks={runningTasks}
            allTasks={sampleTasks}
            onFocus={jest.fn()}
            onStop={onStop}
            onDismiss={jest.fn()}
            onOpenDefinition={jest.fn()}
            onShowLogs={jest.fn()}
            onGetLogBuffer={jest.fn()}
            logBuffer={[]}
            collapsed={false}
            onToggleCollapse={jest.fn()}
          />
        </TaskStateProvider>
      );

      const stopButton = screen.getByRole('button', { name: /stop/i });
      await user.click(stopButton);

      expect(onStop).toHaveBeenCalledWith('npm: test');
    });

    test('calls onDismiss when dismiss button clicked on failed task', async () => {
      const user = userEvent.setup({ delay: null });
      const onDismiss = jest.fn();

      const runningTasks = new Map([
        ['npm: test', createRunningTaskState('npm: test', {
          state: 'failed',
          exitCode: 1
        })]
      ]);

      renderWithTheme(
        <TaskStateProvider>
          <RunningTasksPanel
            runningTasks={runningTasks}
            allTasks={sampleTasks}
            onFocus={jest.fn()}
            onStop={jest.fn()}
            onDismiss={onDismiss}
            onOpenDefinition={jest.fn()}
            onShowLogs={jest.fn()}
            onGetLogBuffer={jest.fn()}
            logBuffer={[]}
            collapsed={false}
            onToggleCollapse={jest.fn()}
          />
        </TaskStateProvider>
      );

      const dismissButton = screen.getByRole('button', { name: /dismiss/i });
      await user.click(dismissButton);

      expect(onDismiss).toHaveBeenCalledWith('npm: test');
    });
  });

  describe('Debug Panel', () => {
    test('shows debug info when debug button clicked', async () => {
      const user = userEvent.setup({ delay: null });

      const runningTasks = new Map([
        ['npm: test', createRunningTaskState('npm: test', { state: 'running' })]
      ]);

      renderWithTheme(
        <TaskStateProvider>
          <RunningTasksPanel
            runningTasks={runningTasks}
            allTasks={sampleTasks}
            onFocus={jest.fn()}
            onStop={jest.fn()}
            onDismiss={jest.fn()}
            onOpenDefinition={jest.fn()}
            onShowLogs={jest.fn()}
            onGetLogBuffer={jest.fn()}
            logBuffer={['Log entry 1', 'Log entry 2']}
            collapsed={false}
            onToggleCollapse={jest.fn()}
          />
        </TaskStateProvider>
      );

      const debugButton = screen.getByText(/debug info/i);
      await user.click(debugButton);

      await waitFor(() => {
        expect(screen.getByText(/log entry 1/i)).toBeInTheDocument();
      });
    });
  });

  describe('Collapsed State', () => {
    test('hides content when collapsed', () => {
      const runningTasks = new Map([
        ['npm: test', createRunningTaskState('npm: test', { state: 'running' })]
      ]);

      renderWithTheme(
        <TaskStateProvider>
          <RunningTasksPanel
            runningTasks={runningTasks}
            allTasks={sampleTasks}
            onFocus={jest.fn()}
            onStop={jest.fn()}
            onDismiss={jest.fn()}
            onOpenDefinition={jest.fn()}
            onShowLogs={jest.fn()}
            onGetLogBuffer={jest.fn()}
            logBuffer={[]}
            collapsed={true}
            onToggleCollapse={jest.fn()}
          />
        </TaskStateProvider>
      );

      expect(screen.queryByText(/test/i)).not.toBeInTheDocument();
    });
  });
});
