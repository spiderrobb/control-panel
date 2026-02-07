import React from 'react';
import { renderWithTheme, screen, userEvent } from '../test-utils';
import RecentTasksList from './RecentTasksList';
import { TaskStateProvider } from '../context';
import { sampleTasks } from '../../test/fixtures/tasks';

const mockVscodeApi = {
  postMessage: jest.fn()
};

global.acquireVsCodeApi = () => mockVscodeApi;

describe('RecentTasksList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    test('renders empty state when no recent tasks', () => {
      renderWithTheme(
        <TaskStateProvider>
          <RecentTasksList
            recentTasks={[]}
            allTasks={sampleTasks}
            onRun={jest.fn()}
            onToggleStar={jest.fn()}
            starredTasks={[]}
          />
        </TaskStateProvider>
      );

      expect(screen.getByText(/recent/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /run/i })).not.toBeInTheDocument();
    });

    test('renders recent tasks list', () => {
      renderWithTheme(
        <TaskStateProvider>
          <RecentTasksList
            recentTasks={['npm: test', 'npm: build']}
            allTasks={sampleTasks}
            onRun={jest.fn()}
            onToggleStar={jest.fn()}
            starredTasks={[]}
          />
        </TaskStateProvider>
      );

      expect(screen.getByText(/test/i)).toBeInTheDocument();
      expect(screen.getByText(/build/i)).toBeInTheDocument();
    });

    test('matches snapshot with recent tasks', () => {
      const { container } = renderWithTheme(
        <TaskStateProvider>
          <RecentTasksList
            recentTasks={['npm: test', 'npm: build']}
            allTasks={sampleTasks}
            onRun={jest.fn()}
            onToggleStar={jest.fn()}
            starredTasks={[]}
          />
        </TaskStateProvider>
      );

      expect(container).toMatchSnapshot();
    });
  });

  describe('User Interactions', () => {
    test('calls onRun when play button clicked', async () => {
      const user = userEvent.setup({ delay: null });
      const onRun = jest.fn();

      renderWithTheme(
        <TaskStateProvider>
          <RecentTasksList
            recentTasks={['npm: test']}
            allTasks={sampleTasks}
            onRun={onRun}
            onToggleStar={jest.fn()}
            starredTasks={[]}
          />
        </TaskStateProvider>
      );

      const playButton = screen.getByRole('button', { name: /run/i });
      await user.click(playButton);

      expect(onRun).toHaveBeenCalledWith('npm: test');
    });

    test('calls onToggleStar when star button clicked', async () => {
      const user = userEvent.setup({ delay: null });
      const onToggleStar = jest.fn();

      renderWithTheme(
        <TaskStateProvider>
          <RecentTasksList
            recentTasks={['npm: test']}
            allTasks={sampleTasks}
            onRun={jest.fn()}
            onToggleStar={onToggleStar}
            starredTasks={[]}
          />
        </TaskStateProvider>
      );

      const starButton = screen.getByRole('button', { name: /star/i });
      await user.click(starButton);

      expect(onToggleStar).toHaveBeenCalledWith('npm: test');
    });
  });

  describe('Collapse State', () => {
    test('toggles collapse state when button clicked', async () => {
      const user = userEvent.setup({ delay: null });

      renderWithTheme(
        <TaskStateProvider>
          <RecentTasksList
            recentTasks={['npm: test']}
            allTasks={sampleTasks}
            onRun={jest.fn()}
            onToggleStar={jest.fn()}
            starredTasks={[]}
          />
        </TaskStateProvider>
      );

      const collapseButton = screen.getByRole('button', { name: /collapse/i });
      await user.click(collapseButton);

      // Tasks should be hidden after collapse
      expect(screen.queryByText(/test/i)).not.toBeInTheDocument();
    });
  });
});
