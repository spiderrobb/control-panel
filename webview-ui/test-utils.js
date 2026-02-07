import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Create a default test theme that matches VS Code dark theme
const createTestTheme = () => {
  return createTheme({
    palette: {
      mode: 'dark',
      primary: {
        main: '#007acc',
      },
      background: {
        default: '#1e1e1e',
        paper: '#252526',
      },
      text: {
        primary: '#cccccc',
        secondary: '#969696',
      },
    },
  });
};

// Custom render function that wraps components with ThemeProvider
export function renderWithTheme(ui, options = {}) {
  const { theme = createTestTheme(), ...renderOptions } = options;

  const Wrapper = ({ children }) => (
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  );

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

// Mock VS Code API factory
export function mockVsCodeApi() {
  const postMessage = jest.fn();
  
  return {
    postMessage,
    getState: jest.fn(() => ({})),
    setState: jest.fn(),
  };
}

// Global VS Code API mock setup
export function setupVsCodeApiMock() {
  const api = mockVsCodeApi();
  global.acquireVsCodeApi = jest.fn(() => api);
  return api;
}

// Helper to simulate extension messages to webview
export function simulateExtensionMessage(type, data = {}) {
  const event = new MessageEvent('message', {
    data: { type, ...data },
    origin: 'vscode-webview://',
  });
  window.dispatchEvent(event);
}

// Helper to wait for async updates
export function waitForAsync(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Re-export everything from React Testing Library
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
