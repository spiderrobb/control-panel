import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import RecentTasksList from './RecentTasksList';
import { sampleTasks } from '../../test/fixtures/tasks';

const testTheme = createTheme({ palette: { mode: 'dark' } });

function renderRecentTasks(props = {}) {
  const defaultProps = {
    tasks: [],
    allTasks: sampleTasks,
    onRun: jest.fn(),
    onToggleStar: jest.fn(),
    starredTasks: []
  };

  return render(
    <ThemeProvider theme={testTheme}>
      <RecentTasksList {...defaultProps} {...props} />
    </ThemeProvider>
  );
}

describe('RecentTasksList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Rendering ──────────────────────────────────────────────

  describe('Rendering', () => {
    test('empty state: no recent tasks', () => {
      renderRecentTasks({ tasks: [] });

      expect(screen.getByText(/Recently Used \(0\)/)).toBeInTheDocument();
      expect(screen.getByText(/no recently used tasks/i)).toBeInTheDocument();
    });

    test('displays recent tasks list', () => {
      renderRecentTasks({ tasks: ['test', 'build'] });

      expect(screen.getByText('test')).toBeInTheDocument();
      expect(screen.getByText('build')).toBeInTheDocument();
    });

    test('shows count in header', () => {
      renderRecentTasks({ tasks: ['test', 'build'] });

      expect(screen.getByText(/Recently Used \(2\)/)).toBeInTheDocument();
    });

    test('shows displayLabel from allTasks when available', () => {
      const allTasks = [
        { id: 'myid', label: 'test', displayLabel: 'Run Tests', source: 'Workspace', definition: {} }
      ];

      renderRecentTasks({ tasks: ['myid'], allTasks });

      expect(screen.getByText('Run Tests')).toBeInTheDocument();
    });

    test('snapshot: panel with recent tasks', () => {
      const { container } = renderRecentTasks({ tasks: ['test', 'build'] });

      expect(container).toMatchSnapshot();
    });
  });

  // ─── User Interactions ──────────────────────────────────────

  describe('User Interactions', () => {
    test('click play button → runs task', async () => {
      const user = userEvent.setup({ delay: null });
      const onRun = jest.fn();

      renderRecentTasks({ tasks: ['test'], onRun });

      const playIcon = screen.getByTestId('PlayArrowIcon');
      await user.click(playIcon.closest('button'));

      expect(onRun).toHaveBeenCalledWith('test');
    });

    test('click star button → toggles starred state', async () => {
      const user = userEvent.setup({ delay: null });
      const onToggleStar = jest.fn();

      renderRecentTasks({ tasks: ['test'], onToggleStar, starredTasks: [] });

      const starIcon = screen.getByTestId('StarBorderIcon');
      await user.click(starIcon.closest('button'));

      expect(onToggleStar).toHaveBeenCalledWith('test');
    });

    test('shows filled star for starred tasks', () => {
      renderRecentTasks({ tasks: ['test'], starredTasks: ['test'] });

      expect(screen.getByTestId('StarIcon')).toBeInTheDocument();
    });

    test('toggle collapse/expand (local state)', async () => {
      const user = userEvent.setup({ delay: null });

      renderRecentTasks({ tasks: ['test', 'build'] });

      // Initially expanded, task should be visible
      expect(screen.getByText('test')).toBeInTheDocument();

      // Click collapse
      const collapseIcon = screen.getByTestId('ExpandLessIcon');
      await user.click(collapseIcon.closest('button'));

      // Tasks should be hidden
      expect(screen.queryByText('test')).not.toBeInTheDocument();

      // Click expand
      const expandIcon = screen.getByTestId('ExpandMoreIcon');
      await user.click(expandIcon.closest('button'));

      // Tasks should be visible again
      expect(screen.getByText('test')).toBeInTheDocument();
    });
  });
});
