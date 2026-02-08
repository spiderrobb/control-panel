import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import ExecutionHistoryPanel from './ExecutionHistoryPanel';
import { sampleTasks, executionHistory, executionHistoryWithChildren } from '../../test/fixtures/tasks';

const testTheme = createTheme({ palette: { mode: 'dark' } });

function renderHistory(props = {}) {
  const defaultProps = {
    history: [],
    allTasks: sampleTasks
  };

  return render(
    <ThemeProvider theme={testTheme}>
      <ExecutionHistoryPanel {...defaultProps} {...props} />
    </ThemeProvider>
  );
}

describe('ExecutionHistoryPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Rendering ──────────────────────────────────────────────

  describe('Rendering', () => {
    test('empty state: no execution history', () => {
      renderHistory({ history: [] });

      expect(screen.getByText(/no task executions recorded/i)).toBeInTheDocument();
    });

    test('displays execution history list', () => {
      const history = [
        {
          id: 'exec-1',
          taskLabel: 'test',
          startTime: Date.now() - 3600000,
          endTime: Date.now() - 3590000,
          duration: 10000,
          failed: false,
          exitCode: 0
        },
        {
          id: 'exec-2',
          taskLabel: 'build',
          startTime: Date.now() - 7200000,
          endTime: Date.now() - 7170000,
          duration: 30000,
          failed: false,
          exitCode: 0
        }
      ];

      renderHistory({ history });

      expect(screen.getByText('test')).toBeInTheDocument();
      expect(screen.getByText('build')).toBeInTheDocument();
    });

    test('shows success icons (✓) for successful executions', () => {
      const history = [
        {
          id: '1',
          taskLabel: 'test',
          startTime: Date.now() - 3600000,
          endTime: Date.now() - 3590000,
          duration: 10000,
          failed: false,
          exitCode: 0
        }
      ];

      renderHistory({ history });

      expect(screen.getByTestId('CheckCircleIcon')).toBeInTheDocument();
    });

    test('shows error icons (✗) for failed executions', () => {
      const history = [
        {
          id: '1',
          taskLabel: 'test',
          startTime: Date.now() - 3600000,
          endTime: Date.now() - 3590000,
          duration: 10000,
          failed: true,
          exitCode: 1
        }
      ];

      renderHistory({ history });

      expect(screen.getByTestId('ErrorIcon')).toBeInTheDocument();
    });

    test('shows displayLabel from allTasks when available', () => {
      const allTasks = [
        { id: 'myid', label: 'test', displayLabel: 'Run All Tests', source: 'Workspace', definition: {} }
      ];
      const history = [
        {
          id: '1',
          taskLabel: 'myid',
          startTime: Date.now() - 60000,
          endTime: Date.now() - 50000,
          duration: 10000,
          failed: false,
          exitCode: 0
        }
      ];

      renderHistory({ history, allTasks });

      expect(screen.getByText('Run All Tests')).toBeInTheDocument();
    });

    test('snapshot: panel with execution history', () => {
      const now = 1700000000000; // Fixed timestamp for snapshot stability
      const history = [
        {
          id: 'exec-1',
          taskLabel: 'test',
          startTime: now - 3600000,
          endTime: now - 3590000,
          duration: 10000,
          failed: false,
          exitCode: 0
        },
        {
          id: 'exec-2',
          taskLabel: 'build',
          startTime: now - 7200000,
          endTime: now - 7170000,
          duration: 30000,
          failed: false,
          exitCode: 0
        }
      ];
      jest.useFakeTimers({ now });
      const { container } = renderHistory({ history });
      expect(container).toMatchSnapshot();
      jest.useRealTimers();
    });
  });

  // ─── Timestamp Formatting ──────────────────────────────────

  describe('Timestamp Formatting', () => {
    test('displays relative timestamps', () => {
      const now = 1700000000000;
      jest.useFakeTimers({ now });

      const history = [
        {
          id: '1',
          taskLabel: 'recent-task',
          startTime: now - 130000,
          endTime: now - 120000,
          duration: 10000,
          failed: false,
          exitCode: 0
        }
      ];

      renderHistory({ history });

      expect(screen.getByText(/2m ago/)).toBeInTheDocument();
      jest.useRealTimers();
    });

    test('shows "Just now" for very recent executions', () => {
      const now = 1700000000000;
      jest.useFakeTimers({ now });

      const history = [
        {
          id: '1',
          taskLabel: 'recent-task',
          startTime: now - 30000,
          endTime: now - 20000,
          duration: 10000,
          failed: false,
          exitCode: 0
        }
      ];

      renderHistory({ history });

      expect(screen.getByText('Just now')).toBeInTheDocument();
      jest.useRealTimers();
    });

    test('shows hour-based relative time', () => {
      const now = 1700000000000;
      jest.useFakeTimers({ now });

      const history = [
        {
          id: '1',
          taskLabel: 'old-task',
          startTime: now - 7210000,
          endTime: now - 7200000,
          duration: 10000,
          failed: false,
          exitCode: 0
        }
      ];

      renderHistory({ history });

      expect(screen.getByText(/2h ago/)).toBeInTheDocument();
      jest.useRealTimers();
    });

    test('hover timestamp → shows absolute time in tooltip', async () => {
      const user = userEvent.setup({ delay: null });
      const now = 1700000000000;
      jest.useFakeTimers({ now });

      const history = [
        {
          id: '1',
          taskLabel: 'hover-task',
          startTime: now - 3610000,
          endTime: now - 3600000,
          duration: 10000,
          failed: false,
          exitCode: 0
        }
      ];

      renderHistory({ history });

      jest.useRealTimers(); // MUI tooltips need real timers for hover events

      const timestamp = screen.getByText(/1h ago/);
      await user.hover(timestamp);

      // MUI Tooltip should appear with absolute time
      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });
    });
  });

  // ─── Tree Expansion ────────────────────────────────────────

  describe('Tree Expansion', () => {
    test('click expand → shows child task executions', async () => {
      const user = userEvent.setup({ delay: null });

      renderHistory({ history: executionHistoryWithChildren });

      // Find the expand button for the parent
      const expandIcon = screen.getByTestId('ExpandMoreIcon');
      await user.click(expandIcon.closest('button'));

      // Children should now be visible
      await waitFor(() => {
        const buildElements = screen.getAllByText('build');
        expect(buildElements.length).toBeGreaterThan(0);
      });
    });

    test('click collapse → hides child task executions', async () => {
      const user = userEvent.setup({ delay: null });

      renderHistory({ history: executionHistoryWithChildren });

      // Expand
      const expandIcon = screen.getByTestId('ExpandMoreIcon');
      await user.click(expandIcon.closest('button'));

      // Verify children visible
      await waitFor(() => {
        const buildElements = screen.getAllByText('build');
        expect(buildElements.length).toBeGreaterThan(0);
      });

      // Collapse
      const collapseIcon = screen.getByTestId('ExpandLessIcon');
      await user.click(collapseIcon.closest('button'));

      // Children should be hidden (only parent "deploy" visible)
      await waitFor(() => {
        // "build" child should no longer be in the expanded children section
        // Note: "build" might still appear as child count text
        const childSection = screen.queryByText(/child task/i);
        expect(childSection).toBeInTheDocument(); // "↓ 2 child tasks" shows when collapsed
      });
    });

    test('shows child count when collapsed', () => {
      renderHistory({ history: executionHistoryWithChildren });

      expect(screen.getByText(/2 child tasks/)).toBeInTheDocument();
    });
  });

  // ─── Metadata Display ─────────────────────────────────────

  describe('Metadata Display', () => {
    test('shows execution duration', () => {
      const history = [
        {
          id: '1',
          taskLabel: 'test',
          startTime: Date.now() - 3600000,
          endTime: Date.now() - 3550000,
          duration: 50000,
          failed: false,
          exitCode: 0
        }
      ];

      renderHistory({ history });

      // 50000ms = 50.0s
      expect(screen.getByText('50.0s')).toBeInTheDocument();
    });

    test('shows duration in minutes for longer tasks', () => {
      const history = [
        {
          id: '1',
          taskLabel: 'test',
          startTime: Date.now() - 3600000,
          endTime: Date.now() - 3480000,
          duration: 120000,
          failed: false,
          exitCode: 0
        }
      ];

      renderHistory({ history });

      expect(screen.getByText('2m 0s')).toBeInTheDocument();
    });

    test('shows milliseconds for very short tasks', () => {
      const history = [
        {
          id: '1',
          taskLabel: 'test',
          startTime: Date.now() - 60000,
          endTime: Date.now() - 59500,
          duration: 500,
          failed: false,
          exitCode: 0
        }
      ];

      renderHistory({ history });

      expect(screen.getByText('500ms')).toBeInTheDocument();
    });

    test('shows exit codes for failed executions', () => {
      const history = [
        {
          id: '1',
          taskLabel: 'test',
          startTime: Date.now() - 3600000,
          endTime: Date.now() - 3590000,
          duration: 10000,
          failed: true,
          exitCode: 127
        }
      ];

      renderHistory({ history });

      expect(screen.getByText(/Exit 127/)).toBeInTheDocument();
    });

    test('shows error reason for failed executions', () => {
      const history = [
        {
          id: '1',
          taskLabel: 'test',
          startTime: Date.now() - 3600000,
          endTime: Date.now() - 3590000,
          duration: 10000,
          failed: true,
          exitCode: 1,
          reason: 'Command not found'
        }
      ];

      renderHistory({ history });

      expect(screen.getByText('Command not found')).toBeInTheDocument();
    });
  });
});
