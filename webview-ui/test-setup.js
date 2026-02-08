require('@testing-library/jest-dom');

// Mock VS Code API - must be set before any module imports context.js
// because context.js calls acquireVsCodeApi() at module scope (IIFE)
const mockVscodeApi = {
  postMessage: jest.fn(),
  getState: jest.fn(() => ({})),
  setState: jest.fn()
};
global.acquireVsCodeApi = jest.fn(() => mockVscodeApi);
// Expose for test assertions
global.__mockVscodeApi = mockVscodeApi;

// Mock window.matchMedia (used by MUI)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock IntersectionObserver (used by some MUI components)
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
};
