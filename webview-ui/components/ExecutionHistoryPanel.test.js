import React from 'react';
import { renderWithTheme, screen, userEvent } from '../test-utils';
import ExecutionHistoryPanel from './ExecutionHistoryPanel';
import { TaskStateProvider } from '../context';
import { sampleTasks, executionHistory } from '../../test/fixtures/tasks';

describe('ExecutionHistoryPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    test('renders empty state when no history', () => {
      renderWithTheme(
        <TaskStateProvider>
          <ExecutionHistoryPanel
            executionHistory={[]}
            allTasks={sampleTasks}
          />
        </TaskStateProvider>
      );

      expect(screen.getByText(/no execution history/i)).toBeInTheDocument();
    });

    test('renders execution history list', () => {
      renderWithTheme(
        <TaskStateProvider>
          <ExecutionHistoryPanel
            executionHistory={executionHistory}
            allTasks={sampleTasks}
          />
        </TaskStateProvider>
      );

      expect(screen.getByText(/test/i)).toBeInTheDocument();
      expect(screen.getByText(/build/i)).toBeInTheDocument();
    });

    test('shows success icons for successful executions', () => {
      renderWithTheme(
        <TaskStateProvider>
          <ExecutionHistoryPanel
            executionHistory={[
              { id: '1', taskLabel: 'npm: test', success: true, exitCode: 0 }
            ]}
            allTasks={sampleTasks}
          />
        </TaskStateProvider>
      );

      const successIcon = screen.getByTestId('CheckCircleIcon');
      expect(successIcon).toBeInTheDocument();
    });

    test('shows error icons for failed executions', () => {
      renderWithTheme(
        <TaskStateProvider>
          <ExecutionHistoryPanel
            executionHistory={[
              { id: '1', taskLabel: 'npm: test', success: false, exitCode: 1 }
            ]}
            allTasks={sampleTasks}
          />
        </TaskStateProvider>
      );

      const errorIcon = screen.getByTestId('ErrorIcon');
      expect(errorIcon).toBeInTheDocument();
    });

    test('matches snapshot with execution history', () => {
      const { container } = renderWithTheme(
        <TaskStateProvider>
          <ExecutionHistoryPanel
            executionHistory={executionHistory}
            allTasks={sampleTasks}
          />
        </TaskStateProvider>
      );

      expect(container).toMatchSnapshot();
    });
  });

  describe('Timestamp Formatting', () => {
    test('displays relative timestamps', () => {
      const recentExecution = {
        id: '1',
        taskLabel: 'npm: test',
        startTime: Date.now() - 120000, // 2 minutes ago
        endTime: Date.now() - 110000,
        duration: 10000,
        success: true,
        exitCode: 0
      };

      renderWithTheme(
        <TaskStateProvider>
          <ExecutionHistoryPanel
            executionHistory={[recentExecution]}
            allTasks={sampleTasks}
          />
        </TaskStateProvider>
      );

      expect(screen.getByText(/2.*min.*ago/i)).toBeInTheDocument();
    });

    test('shows absolute time in tooltip on hover', async () => {
      const user = userEvent.setup({ delay: null });
      
      const execution = {
        id: '1',
        taskLabel: 'npm: test',
        startTime: Date.now() - 3600000, // 1 hour ago
        endTime: Date.now() - 3590000,
        duration: 10000,
        success: true,
        exitCode: 0
      };

      renderWithTheme(
        <TaskStateProvider>
          <ExecutionHistoryPanel
            executionHistory={[execution]}
            allTasks={sampleTasks}
          />
        </TaskStateProvider>
      );

      const timestamp = screen.getByText(/ago/i);
      await user.hover(timestamp);

      // Tooltip should show absolute time
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });
  });

  describe('Tree Expansion', () => {
    test('expands execution details when clicked', async () => {
      const user = userEvent.setup({ delay: null });
      
      const executionWithChildren = {
        id: '1',
        taskLabel: 'npm: deploy',
        startTime: Date.now() - 3600000,
        endTime: Date.now() - 3540000,
        duration: 60000,
        success: true,
        exitCode: 0,
        children: [
          {
            id: '2',
            taskLabel: 'npm: build',
            duration: 30000,
            success: true,
            exitCode: 0
          }
        ]
      };

      renderWithTheme(
        <TaskStateProvider>
          <ExecutionHistoryPanel
            executionHistory={[executionWithChildren]}
            allTasks={sampleTasks}
          />
        </TaskStateProvider>
      );

      const expandButton = screen.getByRole('button', { name: /expand/i });
      await user.click(expandButton);

      expect(screen.getByText(/build/i)).toBeInTheDocument();
    });

    test('collapses execution when clicked again', async () => {
      const user = userEvent.setup({ delay: null });
      
      const executionWithChildren = {
        id: '1',
        taskLabel: 'npm: deploy',
        children: [
          { id: '2', taskLabel: 'npm: build' }
        ]
      };

      renderWithTheme(
        <TaskStateProvider>
          <ExecutionHistoryPanel
            executionHistory={[executionWithChildren]}
            allTasks={sampleTasks}
          />
        </TaskStateProvider>
      );

      const expandButton = screen.getByRole('button', { name: /expand/i });
      
      // Expand
      await user.click(expandButton);
      expect(screen.getByText(/build/i)).toBeInTheDocument();

      // Collapse
      await user.click(expandButton);
      expect(screen.queryByText(/build/i)).not.toBeInTheDocument();
    });
  });

  describe('Duration Display', () => {
    test('displays execution duration', () => {
      const execution = {
        id: '1',
        taskLabel: 'npm: test',
        startTime: Date.now() - 3600000,
        endTime: Date.now() - 3550000,
        duration: 50000, // 50 seconds
        success: true,
        exitCode: 0
      };

      renderWithTheme(
        <TaskStateProvider>
          <ExecutionHistoryPanel
            executionHistory={[execution]}
            allTasks={sampleTasks}
          />
        </TaskStateProvider>
      );

      expect(screen.getByText(/50s/i)).toBeInTheDocument();
    });
  });

  describe('Exit Code Display', () => {
    test('displays exit code for failed executions', () => {
      const execution = {
        id: '1',
        taskLabel: 'npm: test',
        startTime: Date.now() - 3600000,
        endTime: Date.now() - 3590000,
        duration: 10000,
        success: false,
        exitCode: 127
      };

      renderWithTheme(
        <TaskStateProvider>
          <ExecutionHistoryPanel
            executionHistory={[execution]}
            allTasks={sampleTasks}
          />
        </TaskStateProvider>
      );

      expect(screen.getByText(/exit 127/i)).toBeInTheDocument();
    });
  });
});
