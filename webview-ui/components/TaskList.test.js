import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import TaskList from './TaskList';
import { TaskStateProvider } from '../context';
import { sampleTasks, taskWithDependencies, createMockTask } from '../../test/fixtures/tasks';

const testTheme = createTheme({ palette: { mode: 'dark' } });

const mockVscodeApi = {
  postMessage: jest.fn(),
  getState: jest.fn(() => ({})),
  setState: jest.fn()
};
global.acquireVsCodeApi = jest.fn(() => mockVscodeApi);

function sendMessage(type, data = {}) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { type, ...data }
    }));
  });
}

// TaskList receives tasks as a prop (injected by TaskListWithState in App)
function renderTaskList(props = {}) {
  const defaultProps = {
    labelStartsWith: '',
    tasks: sampleTasks,
    disabled: false
  };

  const result = render(
    <ThemeProvider theme={testTheme}>
      <TaskStateProvider>
        <TaskList {...defaultProps} {...props} />
      </TaskStateProvider>
    </ThemeProvider>
  );

  // Also inject tasks into context so TaskLink can resolve them
  const tasksToInject = props.tasks || sampleTasks;
  if (tasksToInject.length > 0) {
    sendMessage('updateTasks', { tasks: tasksToInject });
  }

  return result;
}

describe('TaskList Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Rendering ──────────────────────────────────────────────

  describe('Rendering', () => {
    test('empty state when no tasks match filter', () => {
      renderTaskList({ labelStartsWith: 'nonexistent' });

      expect(screen.getByText(/no tasks found/i)).toBeInTheDocument();
    });

    test('renders filtered tasks that match labelStartsWith', () => {
      renderTaskList({ labelStartsWith: 'test' });

      // Should match tasks whose label starts with "test"
      const testElements = screen.getAllByText('test');
      expect(testElements.length).toBeGreaterThan(0);
    });

    test('renders all tasks when labelStartsWith is empty', () => {
      renderTaskList({ labelStartsWith: '' });

      // All 4 sample tasks should appear
      expect(screen.getByText('build')).toBeInTheDocument();
      expect(screen.getByText('lint')).toBeInTheDocument();
    });

    test('renders tasks with custom displayLabel', () => {
      const tasksWithDisplay = [
        createMockTask('build', { displayLabel: 'Build Project' })
      ];

      renderTaskList({ tasks: tasksWithDisplay, labelStartsWith: 'build' });

      expect(screen.getByText('Build Project')).toBeInTheDocument();
    });

    test('handles tasks with dependencies', () => {
      const tasks = [...sampleTasks, taskWithDependencies];
      renderTaskList({ tasks, labelStartsWith: 'deploy' });

      expect(screen.getByText('deploy')).toBeInTheDocument();
    });

    test('snapshot: multiple tasks layout', () => {
      const { container } = renderTaskList({ labelStartsWith: '' });

      expect(container).toMatchSnapshot();
    });

    test('snapshot: empty state', () => {
      const { container } = renderTaskList({ labelStartsWith: 'zzz' });

      expect(container).toMatchSnapshot();
    });
  });

  // ─── Filtering Logic ───────────────────────────────────────

  describe('Filtering Logic', () => {
    test('filters tasks correctly with exact prefix match', () => {
      renderTaskList({ labelStartsWith: 'build' });

      expect(screen.getByText('build')).toBeInTheDocument();
      expect(screen.queryByText('lint')).not.toBeInTheDocument();
    });

    test('handles case-sensitive filtering', () => {
      renderTaskList({ labelStartsWith: 'Build' });

      // "Build" should not match "build" (case-sensitive)
      expect(screen.getByText(/no tasks found/i)).toBeInTheDocument();
    });

    test('filters with partial prefix match', () => {
      renderTaskList({ labelStartsWith: 'te' });

      // "test" starts with "te"
      const testElements = screen.getAllByText('test');
      expect(testElements.length).toBeGreaterThan(0);
    });

    test('shows empty message with code block of filter', () => {
      renderTaskList({ labelStartsWith: 'xyz' });

      expect(screen.getByText('xyz')).toBeInTheDocument();
    });
  });

  // ─── Sort Order ─────────────────────────────────────────────

  describe('Sort Order', () => {
    test('sorts Workspace tasks before npm tasks, then groups npm by path alphabetically', () => {
      const mixedTasks = [
        createMockTask('zeta', { source: 'npm', definition: { type: 'npm', script: 'zeta', path: '/workspaces/b-pkg' } }),
        createMockTask('alpha', { source: 'npm', definition: { type: 'npm', script: 'alpha', path: '/workspaces/b-pkg' } }),
        createMockTask('build', { source: 'Workspace' }),
        createMockTask('gamma', { source: 'npm', definition: { type: 'npm', script: 'gamma', path: '/workspaces/a-pkg' } }),
        createMockTask('lint', { source: 'Workspace' }),
      ];

      const { container } = renderTaskList({ tasks: mixedTasks, labelStartsWith: '' });

      const items = container.querySelectorAll('li');
      const labels = Array.from(items).map(li => li.textContent);

      // Workspace tasks first (alphabetical), then npm grouped by path (alphabetical within each)
      // TaskLink renders an "npm" source chip for npm tasks, included in textContent
      expect(labels).toEqual(['build', 'lint', 'npmgamma', 'npmalpha', 'npmzeta']);
    });
  });

  // ─── Props Passthrough ─────────────────────────────────────

  describe('Props Passthrough', () => {
    test('passes disabled prop to TaskLink components', () => {
      renderTaskList({ labelStartsWith: '', disabled: true });

      // All play buttons should be disabled
      const buttons = screen.getAllByRole('button');
      const playButtons = buttons.filter(b => b.querySelector('[data-testid="PlayArrowIcon"]'));
      playButtons.forEach(btn => {
        expect(btn).toBeDisabled();
      });
    });

    test('passes npm-related props to TaskLink', () => {
      const npmColorMap = { '/workspaces/proj': '#ff5722' };
      const setColorMap = jest.fn();

      renderTaskList({
        labelStartsWith: '',
        npmPathColorMap: npmColorMap,
        setNpmPathColorMap: setColorMap
      });

      // Just ensure it renders without error with npm props
      expect(screen.getByText('build')).toBeInTheDocument();
    });

    test('passes running tasks to TaskLink components', () => {
      renderTaskList({ labelStartsWith: '' });

      // Running tasks need to be set via context, not props
      sendMessage('taskStarted', {
        taskLabel: 'build',
        startTime: Date.now(),
        state: 'running'
      });

      // The build task should show as running with stop button
      expect(screen.getByTestId('StopIcon')).toBeInTheDocument();
    });

    test('passes starred tasks to TaskLink components', () => {
      renderTaskList({ labelStartsWith: '' });

      // Starred tasks need to be set via context
      sendMessage('updateStarred', { tasks: ['shell|build|/workspaces/ControlPanel'] });

      // The build task should show filled star
      expect(screen.getByTestId('StarIcon')).toBeInTheDocument();
    });

    test('renders tasks that have id but no label match', () => {
      const tasksWithIds = [
        {
          id: 'shell|custom|/workspaces/ControlPanel',
          label: 'custom-task',
          displayLabel: 'Custom Task',
          source: 'Workspace',
          definition: { type: 'shell', command: 'echo custom', label: 'custom-task' },
          dependsOn: []
        }
      ];

      renderTaskList({ tasks: tasksWithIds, labelStartsWith: 'custom' });

      expect(screen.getByText('Custom Task')).toBeInTheDocument();
    });
  });
});
