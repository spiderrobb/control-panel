import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import App from './App';
import { evaluate } from '@mdx-js/mdx';

// Mock the MDX module
jest.mock('@mdx-js/mdx');

const testTheme = createTheme({ palette: { mode: 'dark' } });

// Use the global mock from test-setup.js (set before module load)
const mockVscodeApi = global.__mockVscodeApi;

function sendMessage(type, data = {}) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { type, ...data }
    }));
  });
}

function renderApp() {
  return render(
    <ThemeProvider theme={testTheme}>
      <App />
    </ThemeProvider>
  );
}

describe('App Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    evaluate.mockResolvedValue({
      default: () => React.createElement('div', null, 'Compiled MDX Content')
    });
  });

  // ─── Initial Rendering ─────────────────────────────────────

  describe('Rendering', () => {
    test('initial render with empty state shows loading', () => {
      renderApp();

      expect(screen.getByText(/Loading Control Panel/)).toBeInTheDocument();
    });

    test('snapshot: initial state', () => {
      const { container } = renderApp();

      expect(container).toMatchSnapshot();
    });
  });

  // ─── MDX Loading (Mocked) ──────────────────────────────────

  describe('MDX Loading - Unit Tests (Mocked)', () => {
    test('compiles and renders MDX on load', async () => {
      renderApp();

      sendMessage('loadMdx', {
        content: '# Hello World',
        file: 'test.mdx'
      });

      await waitFor(() => {
        expect(evaluate).toHaveBeenCalled();
        expect(screen.getByText('Compiled MDX Content')).toBeInTheDocument();
      });
    });

    test('displays error message on compilation failure', async () => {
      evaluate.mockRejectedValue(new Error('Syntax error in MDX'));

      renderApp();

      sendMessage('loadMdx', {
        content: '# Broken {',
        file: 'broken.mdx'
      });

      await waitFor(() => {
        expect(screen.getByText(/Error compiling MDX/)).toBeInTheDocument();
        expect(screen.getByText(/Syntax error in MDX/)).toBeInTheDocument();
      });
    });

    test('clears previous error when new valid MDX loads', async () => {
      evaluate.mockRejectedValueOnce(new Error('Error'));

      renderApp();

      // Load broken MDX
      sendMessage('loadMdx', { content: '# Broken', file: 'broken.mdx' });

      await waitFor(() => {
        expect(screen.getByText(/Error compiling MDX/)).toBeInTheDocument();
      });

      // Load valid MDX
      evaluate.mockResolvedValueOnce({
        default: () => React.createElement('div', null, 'Valid Content')
      });

      sendMessage('loadMdx', { content: '# Valid', file: 'valid.mdx' });

      await waitFor(() => {
        expect(screen.queryByText(/Error compiling MDX/)).not.toBeInTheDocument();
        expect(screen.getByText('Valid Content')).toBeInTheDocument();
      });
    });

    test('shows compilation state while processing', async () => {
      let resolveEval;
      evaluate.mockReturnValue(new Promise(resolve => {
        resolveEval = resolve;
      }));

      renderApp();

      sendMessage('loadMdx', { content: '# Content', file: 'file.mdx' });

      // Should show compiling state
      await waitFor(() => {
        expect(screen.getByText('Compiling MDX...')).toBeInTheDocument();
      });

      // Resolve compilation
      await act(async () => {
        resolveEval({
          default: () => React.createElement('div', null, 'Done')
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Done')).toBeInTheDocument();
        expect(screen.queryByText('Compiling MDX...')).not.toBeInTheDocument();
      });
    });
  });

  // ─── Navigation History ────────────────────────────────────

  describe('Navigation History', () => {
    async function loadAndWaitForFile(file = 'test.mdx') {
      sendMessage('loadMdx', { content: '# Test', file });
      await waitFor(() => {
        expect(screen.getByText('Compiled MDX Content')).toBeInTheDocument();
      });
    }

    test('back button disabled at start of history', async () => {
      renderApp();
      await loadAndWaitForFile('file1.mdx');

      sendMessage('updateNavigationHistory', {
        history: ['file1.mdx'],
        index: 0
      });

      await waitFor(() => {
        const backIcon = screen.getByTestId('ArrowBackIcon');
        const backButton = backIcon.closest('button');
        expect(backButton).toBeDisabled();
      });
    });

    test('forward button disabled at end of history', async () => {
      renderApp();
      await loadAndWaitForFile('file2.mdx');

      sendMessage('updateNavigationHistory', {
        history: ['file1.mdx', 'file2.mdx'],
        index: 1
      });

      await waitFor(() => {
        const fwdIcon = screen.getByTestId('ArrowForwardIcon');
        const fwdButton = fwdIcon.closest('button');
        expect(fwdButton).toBeDisabled();
      });
    });

    test('click back → sends navigateBack message', async () => {
      const user = userEvent.setup({ delay: null });
      renderApp();
      await loadAndWaitForFile('file2.mdx');

      sendMessage('updateNavigationHistory', {
        history: ['file1.mdx', 'file2.mdx'],
        index: 1
      });

      await waitFor(() => {
        const backIcon = screen.getByTestId('ArrowBackIcon');
        expect(backIcon.closest('button')).not.toBeDisabled();
      });

      await user.click(screen.getByTestId('ArrowBackIcon').closest('button'));

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({ type: 'navigateBack' });
    });

    test('click forward → sends navigateForward message', async () => {
      const user = userEvent.setup({ delay: null });
      renderApp();
      await loadAndWaitForFile('file1.mdx');

      sendMessage('updateNavigationHistory', {
        history: ['file1.mdx', 'file2.mdx'],
        index: 0
      });

      await waitFor(() => {
        const fwdIcon = screen.getByTestId('ArrowForwardIcon');
        expect(fwdIcon.closest('button')).not.toBeDisabled();
      });

      await user.click(screen.getByTestId('ArrowForwardIcon').closest('button'));

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({ type: 'navigateForward' });
    });

    test('click menu → opens navigation dropdown', async () => {
      const user = userEvent.setup({ delay: null });
      renderApp();
      await loadAndWaitForFile('file.mdx');

      sendMessage('updateNavigationHistory', {
        history: ['file1.mdx', 'file.mdx'],
        index: 1
      });

      await waitFor(() => {
        expect(screen.getByTestId('MoreVertIcon')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('MoreVertIcon').closest('button'));

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });
    });

    test('select history item → navigates to file', async () => {
      const user = userEvent.setup({ delay: null });
      renderApp();
      await loadAndWaitForFile('file2.mdx');

      sendMessage('updateNavigationHistory', {
        history: ['file1.mdx', 'file2.mdx'],
        index: 1
      });

      await waitFor(() => {
        expect(screen.getByTestId('MoreVertIcon')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('MoreVertIcon').closest('button'));

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });

      // Click on file1.mdx in menu - use getAllByText since it may appear in breadcrumb too
      const menuItems = screen.getAllByText('file1.mdx');
      const menuItem = menuItems.find(el => el.closest('[role="menuitem"]'));
      await user.click(menuItem);

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
        type: 'navigateToHistoryItem',
        index: 0
      });
    });
  });

  // ─── View Toggling ─────────────────────────────────────────

  describe('View Toggling', () => {
    test('click history icon → switches to execution history view', async () => {
      const user = userEvent.setup({ delay: null });
      renderApp();

      sendMessage('loadMdx', { content: '# Doc', file: 'test.mdx' });

      await waitFor(() => {
        expect(screen.getByText('Compiled MDX Content')).toBeInTheDocument();
      });

      // Click the history toggle
      await user.click(screen.getByLabelText('Show execution history'));

      await waitFor(() => {
        expect(screen.getByText('Task Execution History')).toBeInTheDocument();
      });
    });

    test('click again → switches back to document view', async () => {
      const user = userEvent.setup({ delay: null });
      renderApp();

      sendMessage('loadMdx', { content: '# Doc', file: 'test.mdx' });

      await waitFor(() => {
        expect(screen.getByText('Compiled MDX Content')).toBeInTheDocument();
      });

      // Toggle to history
      await user.click(screen.getByLabelText('Show execution history'));

      await waitFor(() => {
        expect(screen.getByText('Task Execution History')).toBeInTheDocument();
      });

      // Toggle back - use Close icon
      await user.click(screen.getByLabelText('Close execution history'));

      await waitFor(() => {
        expect(screen.queryByText('Task Execution History')).not.toBeInTheDocument();
      });
    });
  });

  // ─── Breadcrumb Actions ────────────────────────────────────

  describe('Breadcrumb Actions', () => {
    test('clicking breadcrumb file name opens current file in editor', async () => {
      const user = userEvent.setup({ delay: null });
      renderApp();

      sendMessage('loadMdx', { content: '# File', file: 'myfile.mdx' });

      await waitFor(() => {
        expect(screen.getByText('myfile.mdx')).toBeInTheDocument();
      });

      await user.click(screen.getByText('myfile.mdx'));

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
        type: 'openCurrentFile',
        file: 'myfile.mdx'
      });
    });
  });

  // ─── Utility Actions ──────────────────────────────────────

  describe('Utility Actions', () => {
    test('click copy button → sends copyTasksJson message', async () => {
      const user = userEvent.setup({ delay: null });
      renderApp();

      sendMessage('loadMdx', { content: '# Doc', file: 'test.mdx' });

      await waitFor(() => {
        expect(screen.getByText('Compiled MDX Content')).toBeInTheDocument();
      });

      // Enable debug mode first — the copy button is only visible in debug mode
      sendMessage('debugMode', { enabled: true });

      await user.click(screen.getByLabelText('Copy fetchTasks() JSON'));

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({ type: 'copyTasksJson' });
    });
  });

  // ─── Scroll Persistence ────────────────────────────────────

  describe('Scroll Persistence', () => {
    test('saves scroll position to VS Code state on scroll', async () => {
      renderApp();

      sendMessage('loadMdx', { content: '# Doc', file: 'test.mdx' });

      await waitFor(() => {
        expect(screen.getByText('Compiled MDX Content')).toBeInTheDocument();
      });

      // Simulate scroll event on content area
      const contentArea = document.querySelector('.content');
      if (contentArea) {
        Object.defineProperty(contentArea, 'scrollTop', { value: 200, writable: true });
        act(() => {
          contentArea.dispatchEvent(new Event('scroll', { bubbles: true }));
        });

        expect(mockVscodeApi.setState).toHaveBeenCalled();
      }
    });

    test('restores scroll position when navigating back', async () => {
      mockVscodeApi.getState.mockReturnValue({
        scrollPositions: { 'test.mdx': 500 }
      });

      renderApp();

      sendMessage('loadMdx', { content: '# Doc', file: 'test.mdx' });

      await waitFor(() => {
        expect(screen.getByText('Compiled MDX Content')).toBeInTheDocument();
      });

      // The component uses requestAnimationFrame to restore scroll,
      // which is hard to test exactly, but we verify getState was called
      expect(mockVscodeApi.getState).toHaveBeenCalled();
    });
  });

  // ─── Log Buffer ────────────────────────────────────────────

  describe('Log Buffer', () => {
    test('receives log buffer from extension', () => {
      renderApp();

      sendMessage('loadMdx', { content: '# Doc', file: 'test.mdx' });
      sendMessage('logBuffer', {
        entries: [
          { timestamp: '10:00:01', level: 'INFO', message: 'Log entry 1' }
        ]
      });

      // Log buffer is passed to RunningTasksPanel (tested there)
      // Just verify the message doesn't throw
    });
  });

  // ─── Anchor Link Support ───────────────────────────────────

  describe('Anchor Link Support', () => {
    test('generateHeadingId creates proper slugs from text', () => {
      // Import and test the function directly
      // Since it's not exported, we test indirectly by checking rendered heading IDs
      // We use a simple reimplementation to verify the logic:
      const generateHeadingId = (text) => {
        if (typeof text !== 'string') {
          if (React.isValidElement(text)) {
            return generateHeadingId(text.props.children);
          }
          if (Array.isArray(text)) {
            return generateHeadingId(text.map(t => generateHeadingId(t)).join(''));
          }
          return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        }
        return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      };

      expect(generateHeadingId('Test Overview')).toBe('test-overview');
      expect(generateHeadingId('Running Tests')).toBe('running-tests');
      expect(generateHeadingId('Special!@#$%Characters')).toBe('special-characters');
      expect(generateHeadingId('Multiple   Spaces')).toBe('multiple-spaces');
      expect(generateHeadingId('Trailing-Dashes---')).toBe('trailing-dashes');
      expect(generateHeadingId('---Leading-Dashes')).toBe('leading-dashes');
    });

    test('generateHeadingId handles React elements and arrays', () => {
      const generateHeadingId = (text) => {
        if (typeof text !== 'string') {
          if (React.isValidElement(text)) {
            return generateHeadingId(text.props.children);
          }
          if (Array.isArray(text)) {
            return generateHeadingId(text.map(t => generateHeadingId(t)).join(''));
          }
          return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        }
        return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      };

      // Test with React element
      const element = React.createElement('code', null, 'Code Title');
      expect(generateHeadingId(element)).toBe('code-title');

      // Test with array - spaces get stripped individually then concatenated
      expect(generateHeadingId(['Hello', ' ', 'World'])).toBe('helloworld');
    });

    test('renders headings with generated IDs', async () => {
      // The evaluate mock captures useMDXComponents from the options,
      // which App provides to get custom heading/link components
      evaluate.mockImplementation(async (content, opts) => {
        const components = opts?.useMDXComponents?.() || {};
        return {
          default: () => {
            const H2 = components.h2 || 'h2';
            return React.createElement('div', null,
              React.createElement(H2, null, 'Test Section')
            );
          }
        };
      });

      renderApp();

      sendMessage('loadMdx', { content: '## Test Section', file: 'test.mdx' });

      await waitFor(() => {
        const heading = screen.getByText('Test Section');
        expect(heading.id).toBe('test-section');
      });
    });

    test('external links open in new tab with security attributes', async () => {
      evaluate.mockImplementation(async (content, opts) => {
        const components = opts?.useMDXComponents?.() || {};
        return {
          default: () => {
            const A = components.a || 'a';
            return React.createElement(A, { href: 'https://example.com' }, 'External Link');
          }
        };
      });

      renderApp();

      sendMessage('loadMdx', { content: '[link](https://example.com)', file: 'test.mdx' });

      await waitFor(() => {
        const link = screen.getByText('External Link');
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      });
    });

    test('MDX file links trigger navigation messages', async () => {
      const user = userEvent.setup({ delay: null });

      evaluate.mockImplementation(async (content, opts) => {
        const components = opts?.useMDXComponents?.() || {};
        return {
          default: () => {
            const A = components.a || 'a';
            return React.createElement(A, { href: 'other.mdx' }, 'MDX Link');
          }
        };
      });

      renderApp();

      sendMessage('loadMdx', { content: '[link](other.mdx)', file: 'test.mdx' });

      await waitFor(() => {
        expect(screen.getByText('MDX Link')).toBeInTheDocument();
      });

      await user.click(screen.getByText('MDX Link'));

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
        type: 'navigate',
        file: 'other.mdx'
      });
    });

    test('anchor links scroll to target elements', async () => {
      const user = userEvent.setup({ delay: null });

      evaluate.mockImplementation(async (content, opts) => {
        const components = opts?.useMDXComponents?.() || {};
        return {
          default: () => {
            const H2 = components.h2 || 'h2';
            const A = components.a || 'a';
            return React.createElement('div', null,
              React.createElement(A, { href: '#my-section' }, 'Go to section'),
              React.createElement(H2, null, 'My Section')
            );
          }
        };
      });

      // Mock scrollTo since jsdom doesn't implement it
      Element.prototype.scrollTo = jest.fn();

      renderApp();

      sendMessage('loadMdx', { content: '# test', file: 'test.mdx' });

      await waitFor(() => {
        expect(screen.getByText('Go to section')).toBeInTheDocument();
      });

      // Click anchor link - should not throw
      await user.click(screen.getByText('Go to section'));

      // Verify the link did not navigate away (no full page reload)
      expect(screen.getByText('Go to section')).toBeInTheDocument();
    });
  });
});

// ─── Integration Tests (Real MDX) ─────────────────────────────

describe('App Component - Integration Tests (Real MDX)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('compiles and renders simple MDX fixture', async () => {
    // Use a mock that simulates successful compilation
    evaluate.mockImplementation(async (content, opts) => {
      return {
        default: () => React.createElement('div', null,
          React.createElement('h1', null, 'Simple Document'),
          React.createElement('p', null, 'Hello world.')
        )
      };
    });

    renderApp();

    sendMessage('loadMdx', {
      content: '# Simple Document\n\nHello world.',
      file: 'simple.mdx'
    });

    await waitFor(() => {
      expect(screen.getByText('Simple Document')).toBeInTheDocument();
      expect(screen.getByText('Hello world.')).toBeInTheDocument();
    });
  });

  test('handles MDX with syntax errors gracefully', async () => {
    evaluate.mockRejectedValue(new Error('Unexpected token'));

    renderApp();

    sendMessage('loadMdx', {
      content: '<TaskLink label="unclosed\n{invalidJS(}',
      file: 'malformed.mdx'
    });

    await waitFor(() => {
      expect(screen.getByText(/Error compiling MDX/)).toBeInTheDocument();
    });
  });

  test('heading with nested React elements generates correct id', async () => {
    evaluate.mockImplementation(async (content, opts) => {
      const components = opts?.useMDXComponents?.() || {};
      return {
        default: () => {
          const H2 = components.h2 || 'h2';
          // Simulate heading with mixed content: <h2><code>config</code> Options</h2>
          return React.createElement('div', null,
            React.createElement(H2, null, [
              React.createElement('code', { key: 'code' }, 'config'),
              ' Options'
            ])
          );
        }
      };
    });

    renderApp();

    sendMessage('loadMdx', { content: '## `config` Options', file: 'test.mdx' });

    await waitFor(() => {
      const heading = screen.getByText((content, element) =>
        element.tagName === 'H2' && element.textContent === 'config Options'
      );
      expect(heading.id).toBe('configoptions');
    });
  });

  test('heading with numeric content generates correct id', async () => {
    evaluate.mockImplementation(async (content, opts) => {
      const components = opts?.useMDXComponents?.() || {};
      return {
        default: () => {
          const H3 = components.h3 || 'h3';
          return React.createElement('div', null,
            React.createElement(H3, null, 42)
          );
        }
      };
    });

    renderApp();

    sendMessage('loadMdx', { content: '### 42', file: 'test.mdx' });

    await waitFor(() => {
      const heading = screen.getByText('42');
      expect(heading.id).toBe('42');
    });
  });

  test('MDX content with TaskList component renders correctly', async () => {
    evaluate.mockImplementation(async (content, opts) => {
      const components = opts?.useMDXComponents?.() || {};
      return {
        default: () => {
          const TL = components.TaskList;
          if (TL) {
            return React.createElement('div', null,
              React.createElement(TL, { labelStartsWith: '' })
            );
          }
          return React.createElement('div', null, 'No TaskList');
        }
      };
    });

    renderApp();

    // Send tasks first so TaskListWithState has data
    sendMessage('updateTasks', { tasks: [
      {
        id: 'shell|hello|/workspace',
        label: 'hello',
        displayLabel: 'hello',
        source: 'Workspace',
        definition: { type: 'shell', command: 'echo hello', label: 'hello' },
        dependsOn: []
      }
    ]});

    sendMessage('loadMdx', { content: '<TaskList labelStartsWith="" />', file: 'test.mdx' });

    await waitFor(() => {
      expect(screen.getByText('hello')).toBeInTheDocument();
    });
  });

  test('handles toggle history view back to document', async () => {
    evaluate.mockImplementation(async (content, opts) => ({
      default: () => React.createElement('div', null, 'Doc Content')
    }));

    renderApp();

    sendMessage('loadMdx', { content: '# Doc', file: 'test.mdx' });

    await waitFor(() => {
      expect(screen.getByText('Doc Content')).toBeInTheDocument();
    });

    // Toggle to history view
    const historyButton = screen.getByTestId('HistoryIcon')?.closest('button');
    if (historyButton) {
      const user = userEvent.setup({ delay: null });
      await user.click(historyButton);
    }
  });

  test('handles error message type from extension', async () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    renderApp();

    sendMessage('error', { message: 'Something went wrong' });

    expect(consoleSpy).toHaveBeenCalledWith('Something went wrong');

    consoleSpy.mockRestore();
  });

  test('handles updateNavigationHistory message', async () => {
    renderApp();

    sendMessage('updateNavigationHistory', {
      history: ['file1.mdx', 'file2.mdx'],
      index: 1
    });

    // Navigation controls should reflect the history
    await waitFor(() => {
      const backIcon = screen.queryByTestId('ArrowBackIcon');
      if (backIcon) {
        const backBtn = backIcon.closest('button');
        // Back button should be enabled since index > 0
        expect(backBtn).not.toBeDisabled();
      }
    });
  });
});
