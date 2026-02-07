module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/webview-ui/**/*.test.js'],
  transform: {
    '^.+\\.jsx?$': 'babel-jest'
  },
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/webview-ui/__mocks__/styleMock.js'
  },
  setupFilesAfterEnv: ['<rootDir>/webview-ui/test-setup.js'],
  collectCoverageFrom: [
    'webview-ui/**/*.{js,jsx}',
    '!webview-ui/index.jsx',
    '!webview-ui/theme.js',
    '!webview-ui/styles.css',
    '!webview-ui/**/*.test.js',
    '!webview-ui/__mocks__/**',
    '!webview-ui/fixtures/**',
    '!webview-ui/test-utils.js',
    '!webview-ui/test-setup.js'
  ],
  coverageThreshold: {
    global: {
      lines: 80,
      branches: 75,
      functions: 80,
      statements: 80
    }
  },
  coverageReporters: ['text', 'html', 'json'],
  testTimeout: 10000
};
