import React from 'react';
import { renderWithTheme, screen, userEvent } from '../test-utils';
import StarredTasksList from './StarredTasksList';
import { TaskStateProvider } from '../context';
import { sampleTasks } from '../../test/fixtures/tasks';

const mockVscodeApi = {
  postMessage: jest.fn()
};

global.acquireVsCodeApi = () => mockVscodeApi;

describe('StarredTasksList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    test('renders empty state when no starred tasks', () => {
      renderWithTheme(
        <TaskStateProvider>
          <StarredTasksList
            starredTasks={[]}
            allTasks={sampleTasks}
            onRun={jest.fn()}
            onToggleStar={jest.fn()}
            expanded={true}
            onToggleExpanded={jest.fn()}
          />
        </TaskStateProvider>
      );

      expect(screen.getByText(/starred/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /run/i })).not.toBeInTheDocument();
    });

    test('renders starred tasks list', () => {
      renderWithTheme(
        <TaskStateProvider>
          <StarredTasksList
            starredTasks={['npm: test', 'npm: build']}
            allTasks={sampleTasks}
            onRun={jest.fn()}
            onToggleStar={jest.fn()}
            expanded={true}
            onToggleExpanded={jest.fn()}
          />
        </TaskStateProvider>
      );

      expect(screen.getByText(/test/i)).toBeInTheDocument();
      expect(screen.getByText(/build/i)).toBeInTheDocument();
    });

    test('matches snapshot with starred tasks', () => {
      const { container } = renderWithTheme(
        <TaskStateProvider>
          <StarredTasksList
            starredTasks={['npm: test', 'npm: build']}
            allTasks={sampleTasks}
            onRun={jest.fn()}
            onToggleStar={jest.fn()}
            expanded={true}
            onToggleExpanded={jest.fn()}
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
          <StarredTasksList
            starredTasks={['npm: test']}
            allTasks={sampleTasks}
            onRun={onRun}
            onToggleStar={jest.fn()}
            expanded={true}
            onToggleExpanded={jest.fn()}
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
          <StarredTasksList
            starredTasks={['npm: test']}
            allTasks={sampleTasks}
            onRun={jest.fn()}
            onToggleStar={onToggleStar}
            expanded={true}
            onToggleExpanded={jest.fn()}
          />
        </TaskStateProvider>
      );

      const starButton = screen.getByRole('button', { name: /unstar/i });
      await user.click(starButton);

      expect(onToggleStar).toHaveBeenCalledWith('npm: test');
    });

    test('calls onToggleExpanded when collapse button clicked', async () => {
      const user = userEvent.setup({ delay: null });
      const onToggleExpanded = jest.fn();

      renderWithTheme(
        <TaskStateProvider>
          <StarredTasksList
            starredTasks={['npm: test']}
            allTasks={sampleTasks}
            onRun={jest.fn()}
            onToggleStar={jest.fn()}
            expanded={true}
            onToggleExpanded={onToggleExpanded}
          />
        </TaskStateProvider>
      );

      const collapseButton = screen.getByRole('button', { name: /collapse/i });
      await user.click(collapseButton);

      expect(onToggleExpanded).toHaveBeenCalled();
    });
  });

  describe('Expanded State Persistence', () => {
    test('hides content when collapsed', () => {
      renderWithTheme(
        <TaskStateProvider>
          <StarredTasksList
            starredTasks={['npm: test']}
            allTasks={sampleTasks}
            onRun={jest.fn()}
            onToggleStar={jest.fn()}
            expanded={false}
            onToggleExpanded={jest.fn()}
          />
        </TaskStateProvider>
      );

      expect(screen.queryByText(/test/i)).not.toBeInTheDocument();
    });

    test('shows content when expanded', () => {
      renderWithTheme(
        <TaskStateProvider>
          <StarredTasksList
            starredTasks={['npm: test']}
            allTasks={sampleTasks}
            onRun={jest.fn()}
            onToggleStar={jest.fn()}
            expanded={true}
            onToggleExpanded={jest.fn()}
          />
        </TaskStateProvider>
      );

      expect(screen.getByText(/test/i)).toBeInTheDocument();
    });
  });
});
