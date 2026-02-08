import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import StarredTasksList from './StarredTasksList';
import { sampleTasks } from '../../test/fixtures/tasks';

const testTheme = createTheme({ palette: { mode: 'dark' } });

// Use the global mock from test-setup.js (set before module load)
const mockVscodeApi = global.__mockVscodeApi;

function renderStarredTasks(props = {}) {
  const defaultProps = {
    tasks: [],
    allTasks: sampleTasks,
    onRun: jest.fn(),
    onToggleStar: jest.fn(),
    isCollapsed: false,
    onToggleCollapsed: jest.fn()
  };

  return render(
    <ThemeProvider theme={testTheme}>
      <StarredTasksList {...defaultProps} {...props} />
    </ThemeProvider>
  );
}

describe('StarredTasksList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Rendering ──────────────────────────────────────────────

  describe('Rendering', () => {
    test('empty state: no starred tasks', () => {
      renderStarredTasks({ tasks: [] });

      expect(screen.getByText(/Starred Tasks \(0\/20\)/)).toBeInTheDocument();
      expect(screen.getByText(/no starred tasks yet/i)).toBeInTheDocument();
    });

    test('displays starred tasks list', () => {
      renderStarredTasks({ tasks: ['test', 'build'] });

      expect(screen.getByText('test')).toBeInTheDocument();
      expect(screen.getByText('build')).toBeInTheDocument();
    });

    test('shows filled star icons for starred tasks', () => {
      renderStarredTasks({ tasks: ['test', 'build'] });

      const starIcons = screen.getAllByTestId('StarIcon');
      expect(starIcons.length).toBe(2);
    });

    test('shows count with max in header', () => {
      renderStarredTasks({ tasks: ['test', 'build'] });

      expect(screen.getByText(/Starred Tasks \(2\/20\)/)).toBeInTheDocument();
    });

    test('shows displayLabel from allTasks when available', () => {
      const allTasks = [
        { id: 'myid', label: 'test', displayLabel: 'Run Tests', source: 'Workspace', definition: {} }
      ];

      renderStarredTasks({ tasks: ['myid'], allTasks });

      expect(screen.getByText('Run Tests')).toBeInTheDocument();
    });

    test('snapshot: panel with starred tasks', () => {
      const { container } = renderStarredTasks({ tasks: ['test', 'build'] });

      expect(container).toMatchSnapshot();
    });
  });

  // ─── User Interactions ──────────────────────────────────────

  describe('User Interactions', () => {
    test('click play button → runs task', async () => {
      const user = userEvent.setup({ delay: null });
      const onRun = jest.fn();

      renderStarredTasks({ tasks: ['test'], onRun });

      const playIcon = screen.getByTestId('PlayArrowIcon');
      await user.click(playIcon.closest('button'));

      expect(onRun).toHaveBeenCalledWith('test');
    });

    test('click star button → unstars task', async () => {
      const user = userEvent.setup({ delay: null });
      const onToggleStar = jest.fn();

      renderStarredTasks({ tasks: ['test'], onToggleStar });

      const starIcon = screen.getByTestId('StarIcon');
      await user.click(starIcon.closest('button'));

      expect(onToggleStar).toHaveBeenCalledWith('test');
    });

    test('toggle collapse/expand (persisted via context)', async () => {
      const user = userEvent.setup({ delay: null });
      const onToggleCollapsed = jest.fn();

      renderStarredTasks({ tasks: ['test'], onToggleCollapsed });

      const collapseIcon = screen.getByTestId('ExpandLessIcon');
      await user.click(collapseIcon.closest('button'));

      expect(onToggleCollapsed).toHaveBeenCalled();
    });
  });

  // ─── State Persistence ─────────────────────────────────────

  describe('State Persistence', () => {
    test('hides content when collapsed', () => {
      renderStarredTasks({ tasks: ['test'], isCollapsed: true });

      expect(screen.queryByText('test')).not.toBeInTheDocument();
    });

    test('shows content when not collapsed', () => {
      renderStarredTasks({ tasks: ['test'], isCollapsed: false });

      expect(screen.getByText('test')).toBeInTheDocument();
    });

    test('shows expand icon when collapsed', () => {
      renderStarredTasks({ tasks: ['test'], isCollapsed: true });

      expect(screen.getByTestId('ExpandMoreIcon')).toBeInTheDocument();
    });

    test('shows collapse icon when expanded', () => {
      renderStarredTasks({ tasks: ['test'], isCollapsed: false });

      expect(screen.getByTestId('ExpandLessIcon')).toBeInTheDocument();
    });
  });
});
