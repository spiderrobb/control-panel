module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es2022: true,
    node: true,
    mocha: true
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime'
  ],
  plugins: ['react'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'warn',
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off'
  },
  settings: {
    react: {
      version: 'detect'
    }
  },
  ignorePatterns: [
    'dist/**/*',
    'node_modules/**/*',
    '*.min.js'
  ],
  globals: {
    acquireVsCodeApi: 'readonly'
  },
  overrides: [
    {
      // Allow console statements in Logger.js since it's a logging utility
      files: ['src/Logger.js'],
      rules: {
        'no-console': 'off'
      }
    },
    {
      // Allow console statements in test files for debugging
      files: ['test/**/*.js', 'test-workspace/**/*.js'],
      env: {
        mocha: true
      },
      globals: {
        suite: 'readonly',
        test: 'readonly',
        suiteSetup: 'readonly',
        suiteTeardown: 'readonly',
        setup: 'readonly',
        teardown: 'readonly'
      },
      rules: {
        'no-console': 'off'
      }
    },
    {
      // Allow console statements in utility scripts
      files: ['validate-tests.js'],
      rules: {
        'no-console': 'off'
      }
    },
    {
      // Allow console statements in webview-ui for debugging and error handling
      files: ['webview-ui/**/*.jsx', 'webview-ui/**/*.js'],
      rules: {
        'no-console': 'off'
      }
    }
  ]
};