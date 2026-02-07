# Webview-UI Test Plan

## Overview

This document describes the comprehensive test strategy for the ControlPanel webview UI components. The test suite uses Jest and React Testing Library to achieve 80% line coverage on component logic.

## Testing Infrastructure

### Frameworks & Libraries
- **Jest 29.7.0**: Test runner and assertion library
- **@testing-library/react 14.1.2**: React component testing utilities
- **@testing-library/user-event 14.5.1**: User interaction simulation
- **@testing-library/jest-dom 6.1.5**: Custom DOM matchers
- **jest-environment-jsdom 29.7.0**: DOM environment for Node tests

### Configuration
- **Test pattern**: `**/webview-ui/**/*.test.js`
- **Coverage threshold**: 80% lines, branches, functions, statements
- **Excluded from coverage**: index.jsx, theme.js, styles.css, test utilities, mocks, fixtures
- **Babel transform**: Shared `.babelrc` with Webpack for JSX support

## Test Organization

### Directory Structure
```
webview-ui/
├── __mocks__/
│   ├── @mdx-js/mdx.js          # Mock MDX compile function
│   └── styleMock.js             # Mock CSS imports
├── fixtures/
│   ├── simple.mdx               # Basic MDX sample
│   ├── with-tasks.mdx           # MDX with TaskLink components
│   └── malformed.mdx            # Invalid MDX for error testing
├── components/
│   ├── TaskLink.test.js
│   ├── RunningTasksPanel.test.js
│   ├── RecentTasksList.test.js
│   ├── StarredTasksList.test.js
│   └── ExecutionHistoryPanel.test.js
├── context.test.js              # State management tests
├── App.test.js                  # Integration tests
├── test-utils.js                # Shared test utilities
└── test-setup.js                # Jest setup file

test/fixtures/
└── tasks.js                     # Shared task fixtures (used by both Mocha and Jest)
```

## Test Coverage by Component

### 1. context.js - State Management (context.test.js)

**Message Handler Tests**:
- ✅ `updateTasks` - Updates task list from extension
- ✅ `taskStarted` - Adds task to running map
- ✅ `taskEnded` - Removes task from running map
- ✅ `taskFailed` - Marks task as failed in running map
- ✅ `taskStateChanged` - Updates task state (starting, running, stopping, stopped, failed)
- ✅ `subtaskStarted` - Adds subtask to parent task
- ✅ `subtaskEnded` - Removes subtask from parent task
- ✅ `updateRecentlyUsed` - Updates recent tasks list
- ✅ `updateStarred` - Updates starred tasks list
- ✅ `executionHistory` - Updates execution history array
- ✅ `panelState` - Updates panel collapse states

**Action Function Tests**:
- ✅ `runTask()` - Sends correct `runTask` message
- ✅ `stopTask()` - Sends correct `stopTask` message
- ✅ `toggleStar()` - Sends correct `toggleStar` message
- ✅ `focusTerminal()` - Sends correct `focusTerminal` message
- ✅ `openTaskDefinition()` - Sends correct `openTaskDefinition` message
- ✅ `dismissTask()` - Sends correct `dismissTask` message

**Computed State Tests**:
- ✅ `averageDurations` - Calculates average from successful executions
- ✅ `averageDurations` - Excludes failed executions from average

**State Flow Tests**:
- ✅ Task lifecycle: idle → started → running → ended
- ✅ Task failure: idle → started → failed → dismissed
- ✅ Task with subtasks: parent tracks child execution states

### 2. TaskLink.jsx - Core Task Component (TaskLink.test.js)

**Rendering Tests**:
- ✅ Renders with label prop (legacy support)
- ✅ Renders with taskId prop (preferred)
- ✅ Renders with custom displayLabel
- ✅ Renders disabled state
- ✅ Snapshot: Idle state
- ✅ Snapshot: Running state
- ✅ Snapshot: Failed state
- ✅ Snapshot: Task with dependencies

**State Tests**:
- ✅ Idle: Shows play button
- ✅ Running: Shows stop, focus, and star buttons
- ✅ Failed: Shows retry button and exit code badge
- ✅ First run: Shows shimmer animation (no progress bar)
- ✅ Subsequent runs: Shows progress bar with known duration
- ✅ Long-running (>1 min): Solid background, no progress

**User Interaction Tests**:
- ✅ Click play → Sends `runTask` message
- ✅ Click stop → Sends `stopTask` message
- ✅ Click focus → Sends `focusTerminal` message
- ✅ Click star/unstar → Sends `toggleStar` message
- ✅ Double-click task name → Sends `openTaskDefinition` message
- ✅ Hover task → Shows popover with details

**Progress Calculation Tests**:
- ✅ Updates runtime display every second
- ✅ Calculates progress percentage from average duration
- ✅ Shows estimated completion time

**Dependency Visualization Tests**:
- ✅ Sequential dependencies: Horizontal segment layout
- ✅ Parallel dependencies: Grid layout
- ✅ Hover dependency segment → Shows subtask details

### 3. RunningTasksPanel.jsx (RunningTasksPanel.test.js)

**Rendering Tests**:
- ✅ Empty state: No running tasks
- ✅ Displays running tasks with runtime and progress
- ✅ Shows failed tasks with error details
- ✅ Snapshot: Panel with running tasks

**Hierarchy Tests**:
- ✅ Renders parent task with nested subtasks
- ✅ Recursive rendering for deep hierarchies
- ✅ Filters subtasks from root level (shows only root tasks)
- ✅ Shows "waiting" state for queued subtasks

**User Interaction Tests**:
- ✅ Toggle collapse/expand panel
- ✅ Click "Show Logs" → Opens extension output channel
- ✅ Click stop button → Stops running task
- ✅ Click focus button → Shows task terminal
- ✅ Click dismiss → Removes failed task from view
- ✅ Double-click task name → Opens definition

**Debug Panel Tests**:
- ✅ Toggle debug info visibility
- ✅ Displays task state JSON
- ✅ Shows recent log entries
- ✅ Auto-refreshes log buffer every 2 seconds

### 4. RecentTasksList.jsx (RecentTasksList.test.js)

**Rendering Tests**:
- ✅ Empty state: No recent tasks
- ✅ Displays recent tasks list (max 5)
- ✅ Snapshot: Panel with recent tasks

**User Interaction Tests**:
- ✅ Click play button → Runs task
- ✅ Click star button → Toggles starred state
- ✅ Toggle collapse/expand (local state)

### 5. StarredTasksList.jsx (StarredTasksList.test.js)

**Rendering Tests**:
- ✅ Empty state: No starred tasks
- ✅ Displays starred tasks list (max 20)
- ✅ Shows filled star icons for starred tasks
- ✅ Snapshot: Panel with starred tasks

**User Interaction Tests**:
- ✅ Click play button → Runs task
- ✅ Click star button → Unstars task
- ✅ Toggle collapse/expand (persisted via context)

**State Persistence Tests**:
- ✅ Collapse state persists across sessions
- ✅ Sends `setPanelState` message on collapse toggle

### 6. ExecutionHistoryPanel.jsx (ExecutionHistoryPanel.test.js)

**Rendering Tests**:
- ✅ Empty state: No execution history
- ✅ Displays execution history list (max 20)
- ✅ Shows success icons (✓) for successful executions
- ✅ Shows error icons (✗) for failed executions
- ✅ Snapshot: Panel with execution history

**Timestamp Tests**:
- ✅ Displays relative timestamps ("2 min ago", "1 hour ago")
- ✅ Hover timestamp → Shows absolute time in tooltip

**Tree Expansion Tests**:
- ✅ Click expand → Shows child task executions
- ✅ Click collapse → Hides child task executions
- ✅ Recursive expansion for deep hierarchies

**Metadata Display Tests**:
- ✅ Shows execution duration
- ✅ Shows exit codes for failed executions
- ✅ Shows parent/child relationships

### 7. App.jsx - Main Application (App.test.js)

**Unit Tests (Mocked MDX)**:
- ✅ Initial render with empty state
- ✅ Compiles and renders MDX on load
- ✅ Displays error message on compilation failure
- ✅ Clears previous error when new valid MDX loads
- ✅ Shows compilation state while processing
- ✅ Snapshot: Initial state

**Navigation History Tests**:
- ✅ Back button disabled at start of history
- ✅ Forward button disabled at end of history
- ✅ Click back → Sends `navigateBack` message
- ✅ Click forward → Sends `navigateForward` message
- ✅ Click menu → Opens navigation dropdown
- ✅ Select history item → Navigates to file

**View Toggling Tests**:
- ✅ Click history icon → Switches to execution history view
- ✅ Click again → Switches back to document view
- ✅ Caches document path when viewing history

**Breadcrumb Actions Tests**:
- ✅ Click file name → Opens current file in editor
- ✅ Double-click document title → Opens in editor

**Utility Actions Tests**:
- ✅ Click copy button → Sends `copyTasksJson` message

**Scroll Persistence Tests**:
- ✅ Saves scroll position to VS Code state on navigation
- ✅ Restores scroll position when navigating back

**Log Buffer Tests**:
- ✅ Receives log buffer from extension
- ✅ Passes log buffer to RunningTasksPanel

**Integration Tests (Real MDX)**:
- ✅ Compiles and renders simple MDX fixture
- ✅ Handles MDX with syntax errors gracefully
- ✅ Compiles MDX with TaskLink components

## Test Utilities

### test-utils.js

**Custom Render Function**:
```javascript
renderWithTheme(component, options)
```
Wraps components in ThemeProvider with VS Code theme.

**VS Code API Mock**:
```javascript
mockVsCodeApi()          // Create mock API object
setupVsCodeApiMock()     // Set up global mock
```

**Message Simulation**:
```javascript
simulateExtensionMessage(type, data)  // Simulate extension → webview message
```

**Async Helpers**:
```javascript
waitForAsync(ms)  // Wait for async state updates
```

### Fixtures

**test/fixtures/tasks.js** (Shared):
- `sampleTasks`: Array of basic task objects
- `taskWithDependencies`: Composite task sample
- `runningTaskStates`: Various running task states
- `executionHistory`: Sample execution records
- `createMockTask()`: Factory for mock tasks
- `createRunningTaskState()`: Factory for running states

**webview-ui/fixtures/\*.mdx**:
- `simple.mdx`: Basic markdown content
- `with-tasks.mdx`: MDX with TaskLink/TaskList components
- `malformed.mdx`: Invalid MDX for error testing

## Running Tests

### NPM Scripts

```bash
# Run all tests (extension + webview in parallel)
npm test

# Run only webview tests
npm run test:webview

# Run only extension tests (Mocha)
npm run test:extension

# Generate coverage report for webview
npm run coverage:webview

# Generate coverage report for extension
npm run coverage:extension

# Generate unified coverage report
npm run coverage:all
```

### VS Code Tasks

Tests can also be run via VS Code tasks with `dependsOn` for parallel execution:
- **Task: Test All** - Runs both extension and webview tests in parallel
- **Task: Test Webview** - Jest for React components
- **Task: Test Extension** - Mocha for Node.js code

## Coverage Goals

### Global Thresholds
- **Lines**: 80%
- **Branches**: 75%
- **Functions**: 80%
- **Statements**: 80%

### Per-Component Goals
- **context.js**: 90% (critical state logic)
- **TaskLink.jsx**: 80%
- **Panel components**: 80%
- **App.jsx**: 75% (complex integration)

### Exclusions
- Entry points (index.jsx)
- Theming (theme.js)
- Styles (styles.css)
- Test utilities and mocks
- Fixtures

## Snapshot Testing Strategy

Snapshots are used for:
- Component rendering in various states (idle, running, failed)
- Complex UI layouts (dependency visualization, hierarchies)
- Ensuring no unintended visual regressions

Snapshots are stored in `webview-ui/__snapshots__/` (Jest default).

**When to update snapshots**:
- Intentional UI changes
- New features that modify rendering
- After reviewing diff to ensure changes are correct

**Command**: `npm run test:webview -- -u`

## Continuous Integration

### Future CI Integration
Currently local testing only. For CI:
1. Add GitHub Actions workflow
2. Run `npm run test:all` on PR
3. Upload coverage reports
4. Block PR merge if coverage < 80%

## Best Practices

### Test Writing
1. **Arrange-Act-Assert**: Structure tests clearly
2. **Single Responsibility**: One assertion per test when possible
3. **Descriptive Names**: Test names explain what is being tested
4. **Minimal Mocking**: Mock only external dependencies (VS Code API, MDX compiler)
5. **User-Centric**: Use `screen` queries and user-event for realistic testing

### Maintenance
1. **Update snapshots carefully**: Review diffs before accepting
2. **Keep fixtures minimal**: Only essential test data
3. **Share utilities**: Reuse test helpers across test files
4. **Document complex setups**: Comment non-obvious test arrangements

### Performance
1. **Use fake timers**: `jest.useFakeTimers()` for components with intervals
2. **Batch assertions**: Group related expectations in one test
3. **Parallel execution**: Jest runs tests in parallel by default
4. **Skip integration tests locally**: Run integration tests in CI only if slow

## Known Limitations

1. **Material-UI snapshots**: Large snapshot diffs due to MUI's verbose output
   - **Mitigation**: Focus on semantic rendering, not implementation details

2. **Real MDX compilation slow**: Integration tests with real compilation take 2-3s each
   - **Mitigation**: Unit tests mock compilation, integration tests use real compiler sparingly

3. **VS Code API mocking incomplete**: Some VS Code features not fully mocked
   - **Mitigation**: Start simple, enhance as tests reveal needs

4. **Timer-based tests flaky**: Runtime/progress tests rely on `jest.advanceTimersByTime()`
   - **Mitigation**: Use fake timers consistently, avoid real delays

## Future Enhancements

1. **Visual regression testing**: Add screenshot comparison with Playwright
2. **Accessibility testing**: Add jest-axe for a11y checks
3. **Performance testing**: Add React performance profiling tests
4. **E2E tests**: Add full extension + webview integration tests
5. **Coverage badges**: Add coverage badges to README
6. **Test parallelization**: Optimize Jest worker configuration
7. **Mutation testing**: Add Stryker for test quality validation

## Resources

- [Jest Documentation](https://jestjs.io/)
- [React Testing Library](https://testing-library.com/react)
- [Material-UI Testing Guide](https://mui.com/material-ui/guides/testing/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

---

**Last Updated**: February 7, 2026
**Test Count**: 100+ tests across 7 test files
**Coverage**: Target 80% line coverage
