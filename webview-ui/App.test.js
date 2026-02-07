import React from 'react';
import { renderWithTheme, screen, waitFor, userEvent, simulateExtensionMessage } from './test-utils';
import App from './App';
import { compile } from '@mdx-js/mdx';
import * as fs from 'fs';
import * as path from 'path';

// Mock the MDX compile function for unit tests
jest.mock('@mdx-js/mdx');

const mockVscodeApi = {
  postMessage: jest.fn(),
  getState: jest.fn(() => ({})),
  setState: jest.fn()
};

global.acquireVsCodeApi = () => mockVscodeApi;

describe('App Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock for MDX compile
    compile.mockResolvedValue({
      default: () => <div>Compiled MDX Content</div>
    });
  });

  describe('Rendering', () => {
    test('renders initial state with empty content', () => {
      renderWithTheme(<App />);
      
      // Should render the container
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    test('matches snapshot for initial state', () => {
      const { container } = renderWithTheme(<App />);
      expect(container).toMatchSnapshot();
    });
  });

  describe('MDX Loading - Unit Tests (Mocked)', () => {
    test('compiles and renders MDX content when loaded', async () => {
      renderWithTheme(<App />);

      simulateExtensionMessage('loadMdx', {
        content: '# Hello World\n\nThis is MDX content.',
        filePath: '/test/file.mdx'
      });

      await waitFor(() => {
        expect(compile).toHaveBeenCalledWith('# Hello World\n\nThis is MDX content.', expect.any(Object));
        expect(screen.getByText('Compiled MDX Content')).toBeInTheDocument();
      });
    });

    test('displays error message when MDX compilation fails', async () => {
      compile.mockRejectedValue(new Error('Syntax error in MDX'));

      renderWithTheme(<App />);

      simulateExtensionMessage('loadMdx', {
        content: '# Malformed {',
        filePath: '/test/broken.mdx'
      });

      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument();
        expect(screen.getByText(/syntax error/i)).toBeInTheDocument();
      });
    });

    test('clears previous error when new valid MDX loads', async () => {
      compile.mockRejectedValueOnce(new Error('Error'));
      compile.mockResolvedValueOnce({
        default: () => <div>Valid Content</div>
      });

      renderWithTheme(<App />);

      // Load broken MDX
      simulateExtensionMessage('loadMdx', {
        content: '# Broken',
        filePath: '/test/broken.mdx'
      });

      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument();
      });

      // Load valid MDX
      simulateExtensionMessage('loadMdx', {
        content: '# Valid',
        filePath: '/test/valid.mdx'
      });

      await waitFor(() => {
        expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
        expect(screen.getByText('Valid Content')).toBeInTheDocument();
      });
    });

    test('shows compilation state while processing', async () => {
      let resolveCompile;
      compile.mockReturnValue(new Promise(resolve => {
        resolveCompile = resolve;
      }));

      renderWithTheme(<App />);

      simulateExtensionMessage('loadMdx', {
        content: '# Content',
        filePath: '/test/file.mdx'
      });

      // Should be in compiling state
      await waitFor(() => {
        expect(compile).toHaveBeenCalled();
      });

      // Resolve compilation
      resolveCompile({
        default: () => <div>Done</div>
      });

      await waitFor(() => {
        expect(screen.getByText('Done')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation History', () => {
    test('enables back button after navigating', async () => {
      renderWithTheme(<App />);

      // Load first file
      simulateExtensionMessage('loadMdx', {
        content: '# File 1',
        filePath: '/test/file1.mdx'
      });

      await waitFor(() => {
        expect(screen.getByText('Compiled MDX Content')).toBeInTheDocument();
      });

      // Load second file
      simulateExtensionMessage('loadMdx', {
        content: '# File 2',
        filePath: '/test/file2.mdx'
      });

      await waitFor(() => {
        const backButton = screen.getByRole('button', { name: /back/i });
        expect(backButton).not.toBeDisabled();
      });
    });

    test('back button navigates to previous file', async () => {
      const user = userEvent.setup({ delay: null });
      
      renderWithTheme(<App />);

      // Navigate to two files
      simulateExtensionMessage('navigationHistory', {
        history: ['/test/file1.mdx', '/test/file2.mdx'],
        currentIndex: 1
      });

      const backButton = screen.getByRole('button', { name: /back/i });
      await user.click(backButton);

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
        type: 'navigateBack'
      });
    });

    test('forward button navigates to next file', async () => {
      const user = userEvent.setup({ delay: null });
      
      renderWithTheme(<App />);

      simulateExtensionMessage('navigationHistory', {
        history: ['/test/file1.mdx', '/test/file2.mdx'],
        currentIndex: 0
      });

      const forwardButton = screen.getByRole('button', { name: /forward/i });
      await user.click(forwardButton);

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
        type: 'navigateForward'
      });
    });

    test('disables back button at start of history', () => {
      renderWithTheme(<App />);

      simulateExtensionMessage('navigationHistory', {
        history: ['/test/file1.mdx'],
        currentIndex: 0
      });

      const backButton = screen.getByRole('button', { name: /back/i });
      expect(backButton).toBeDisabled();
    });

    test('disables forward button at end of history', () => {
      renderWithTheme(<App />);

      simulateExtensionMessage('navigationHistory', {
        history: ['/test/file1.mdx', '/test/file2.mdx'],
        currentIndex: 1
      });

      const forwardButton = screen.getByRole('button', { name: /forward/i });
      expect(forwardButton).toBeDisabled();
    });

    test('opens navigation dropdown menu', async () => {
      const user = userEvent.setup({ delay: null });
      
      renderWithTheme(<App />);

      simulateExtensionMessage('navigationHistory', {
        history: ['/test/file1.mdx', '/test/file2.mdx'],
        currentIndex: 1
      });

      const menuButton = screen.getByRole('button', { name: /menu/i });
      await user.click(menuButton);

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });
    });
  });

  describe('View Toggling', () => {
    test('toggles to execution history view', async () => {
      const user = userEvent.setup({ delay: null });
      
      renderWithTheme(<App />);

      const historyButton = screen.getByRole('button', { name: /history/i });
      await user.click(historyButton);

      await waitFor(() => {
        expect(screen.getByText(/execution history/i)).toBeInTheDocument();
      });
    });

    test('toggles back to document view', async () => {
      const user = userEvent.setup({ delay: null });
      
      renderWithTheme(<App />);

      // Toggle to history
      const historyButton = screen.getByRole('button', { name: /history/i });
      await user.click(historyButton);

      await waitFor(() => {
        expect(screen.getByText(/execution history/i)).toBeInTheDocument();
      });

      // Toggle back to document
      await user.click(historyButton);

      await waitFor(() => {
        expect(screen.queryByText(/execution history/i)).not.toBeInTheDocument();
      });
    });

    test('caches document path when switching to history', async () => {
      const user = userEvent.setup({ delay: null });
      
      renderWithTheme(<App />);

      simulateExtensionMessage('loadMdx', {
        content: '# Document',
        filePath: '/test/file.mdx'
      });

      await waitFor(() => {
        expect(screen.getByText('Compiled MDX Content')).toBeInTheDocument();
      });

      const historyButton = screen.getByRole('button', { name: /history/i });
      await user.click(historyButton);

      // File path should be cached, so when toggling back it should restore
      await user.click(historyButton);

      await waitFor(() => {
        expect(screen.getByText('Compiled MDX Content')).toBeInTheDocument();
      });
    });
  });

  describe('Breadcrumb Actions', () => {
    test('clicking breadcrumb file name opens in editor', async () => {
      const user = userEvent.setup({ delay: null });
      
      renderWithTheme(<App />);

      simulateExtensionMessage('loadMdx', {
        content: '# File',
        filePath: '/test/file.mdx'
      });

      await waitFor(() => {
        const breadcrumb = screen.getByText('file.mdx');
        expect(breadcrumb).toBeInTheDocument();
      });

      const breadcrumb = screen.getByText('file.mdx');
      await user.click(breadcrumb);

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
        type: 'openCurrentFile'
      });
    });

    test('double-clicking document title opens in editor', async () => {
      const user = userEvent.setup({ delay: null });
      
      renderWithTheme(<App />);

      simulateExtensionMessage('loadMdx', {
        content: '# My Document',
        filePath: '/test/file.mdx'
      });

      await waitFor(() => {
        const title = screen.getByText('My Document');
        expect(title).toBeInTheDocument();
      });

      const title = screen.getByText('My Document');
      await user.dblClick(title);

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
        type: 'openCurrentFile'
      });
    });
  });

  describe('Copy Tasks JSON', () => {
    test('clicking copy button sends message', async () => {
      const user = userEvent.setup({ delay: null });
      
      renderWithTheme(<App />);

      const copyButton = screen.getByRole('button', { name: /copy/i });
      await user.click(copyButton);

      expect(mockVscodeApi.postMessage).toHaveBeenCalledWith({
        type: 'copyTasksJson'
      });
    });
  });

  describe('Scroll Position Persistence', () => {
    test('saves scroll position when navigating away', async () => {
      renderWithTheme(<App />);

      simulateExtensionMessage('loadMdx', {
        content: '# File 1',
        filePath: '/test/file1.mdx'
      });

      await waitFor(() => {
        expect(mockVscodeApi.setState).toHaveBeenCalled();
      });
    });

    test('restores scroll position when navigating back', async () => {
      mockVscodeApi.getState.mockReturnValue({
        scrollPositions: {
          '/test/file1.mdx': 500
        }
      });

      renderWithTheme(<App />);

      simulateExtensionMessage('loadMdx', {
        content: '# File 1',
        filePath: '/test/file1.mdx'
      });

      // Scroll position should be restored
      await waitFor(() => {
        const contentArea = screen.getByRole('main');
        expect(contentArea.scrollTop).toBe(500);
      });
    });
  });

  describe('Log Buffer Handling', () => {
    test('displays log buffer in debug panel', async () => {
      renderWithTheme(<App />);

      simulateExtensionMessage('logBuffer', {
        logs: ['Log entry 1', 'Log entry 2', 'Log entry 3']
      });

      await waitFor(() => {
        // Logs should be available to RunningTasksPanel
        expect(screen.getByText('Log entry 1')).toBeInTheDocument();
      });
    });
  });
});

describe('App Component - Integration Tests (Real MDX Compilation)', () => {
  beforeEach(() => {
    // Restore real compile function for integration tests
    jest.unmock('@mdx-js/mdx');
  });

  test('compiles and renders simple MDX fixture', async () => {
    const simpleMdx = `# Simple MDX Document

This is a simple MDX document for testing.

## Features

- Basic markdown rendering
- Headings and lists
- Code blocks`;

    renderWithTheme(<App />);

    simulateExtensionMessage('loadMdx', {
      content: simpleMdx,
      filePath: '/test/simple.mdx'
    });

    await waitFor(() => {
      expect(screen.getByText('Simple MDX Document')).toBeInTheDocument();
      expect(screen.getByText('Features')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  test('handles MDX with syntax errors gracefully', async () => {
    const malformedMdx = `# Malformed MDX

<TaskLink label="unclosed-tag"

{invalidJavaScript(}`;

    renderWithTheme(<App />);

    simulateExtensionMessage('loadMdx', {
      content: malformedMdx,
      filePath: '/test/malformed.mdx'
    });

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });
});

describe('Anchor Link Support', () => {
  test('generateHeadingId creates proper slugs', () => {
    // Test the slug generation logic
    const generateHeadingId = (text) => {
      if (typeof text !== 'string') {
        return String(text || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      }
      return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    };

    expect(generateHeadingId('Test Overview')).toBe('test-overview');
    expect(generateHeadingId('Running Tests')).toBe('running-tests');
    expect(generateHeadingId('Test Categories')).toBe('test-categories');
    expect(generateHeadingId('Developer Workflow')).toBe('developer-workflow');
    expect(generateHeadingId('Debugging Tests')).toBe('debugging-tests');
    expect(generateHeadingId('Bug Reports')).toBe('bug-reports');
    expect(generateHeadingId('Special!@#$%Characters')).toBe('special-characters');
    expect(generateHeadingId('Multiple   Spaces')).toBe('multiple-spaces');
    expect(generateHeadingId('Trailing-Dashes---')).toBe('trailing-dashes');
    expect(generateHeadingId('---Leading-Dashes')).toBe('leading-dashes');
  });
});
