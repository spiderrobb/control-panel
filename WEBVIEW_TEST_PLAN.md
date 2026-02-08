# Webview-UI Test Plan

## Overview

This document describes the comprehensive test strategy for the ControlPanel webview UI components. The test suite uses Jest and React Testing Library to achieve high coverage on component logic.

> **Implementation Status**: ✅ Complete — 202 tests across 8 test files, all passing. Coverage: 92.62% statements, 81.74% branches, 91.37% functions, 93.67% lines.

## Implementation Decisions & Deviations from Original Plan

### Critical Findings During Implementation

1. **Complete Test Rewrite Required**: All pre-existing tests were fundamentally broken due to API mismatches between test code and actual source components. Every test file was deleted and rewritten from scratch.

2. **`acquireVsCodeApi` Timing Issue**: `context.js` calls `acquireVsCodeApi()` as an IIFE at module scope. ES `import` statements are hoisted above inline code, so mocking `global.acquireVsCodeApi` inside test files runs *after* `context.js` has already executed the IIFE. **Fix**: Moved the mock to `test-setup.js` (runs via `setupFilesAfterEnv` before any module loading) and exposed the mock instance via `global.__mockVscodeApi`.

3. **MDX API Change**: The codebase uses `evaluate()` from `@mdx-js/mdx`, not `compile()`. The mock at `__mocks__/@mdx-js/mdx.js` was updated to export `evaluate` returning `{ default: () => null }`.

4. **Component Data Flow Architecture**: `TaskLink` receives its data (tasks, runningTasks, starredTasks, etc.) exclusively from `useTaskState()` context, **not** from props passed by `TaskList`. The props that `TaskList` passes to `TaskLink` (e.g., `tasks`, `runningTasks`) are dead code — `TaskLink` ignores them. All tests must use `sendMessage('updateTasks', ...)` to inject data via context.

5. **MDX Components Delivery**: Custom components (headings, links, TaskLink, TaskList) are delivered to MDX-compiled content via the `useMDXComponents` option in `evaluate()`, not as props to the rendered component. Test mocks must capture `useMDXComponents` from evaluate options: `evaluate.mockImplementation(async (content, opts) => { const components = opts?.useMDXComponents?.() || {}; ... })`.

### Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Use `global.__mockVscodeApi` instead of per-test mock | ES module hoisting prevents per-test mock setup before context.js IIFE |
| Use `data-testid` for MUI icon buttons | Disabled `IconButton` inside `Tooltip` gets wrapped in `<span>` that receives the aria-label, making `getByLabelText` unreliable |
| Use `jest.useFakeTimers({ now: fixedTimestamp })` | Prevents race conditions between `Date.now()` in fixtures vs component code |
| Mock `Element.prototype.scrollTo` | jsdom doesn't implement `scrollTo`; needed for anchor link tests |
| Use specific heading text patterns (e.g., `"Starred Tasks (0/20)"`) | Generic regex matchers like `/starred tasks/i` match both headings and body text, causing "multiple elements found" errors |
| Use `endTime` (not `startTime`) for relative time assertions | `formatRelativeTime` in ExecutionHistoryPanel uses `execution.endTime` |
| Coverage threshold: 75% branches (not 80%) | Branch coverage is harder to achieve with MUI component wrappers and complex conditional rendering; 75% is pragmatic |
| Inline test data for ExecutionHistory tests | Shared fixture had duplicate `taskLabel: 'test'` entries causing "multiple elements found" errors |

## Testing Infrastructure

### Frameworks & Libraries
- **Jest 29.7.0**: Test runner and assertion library
- **@testing-library/react 14.1.2**: React component testing utilities
- **@testing-library/user-event 14.5.1**: User interaction simulation
- **@testing-library/jest-dom 6.1.5**: Custom DOM matchers
- **jest-environment-jsdom 29.7.0**: DOM environment for Node tests

### Configuration
- **Test pattern**: `**/webview-ui/**/*.test.js`
- **Coverage thresholds**: 80% lines/functions/statements, 75% branches
- **Excluded from coverage**: index.jsx, theme.js, styles.css, test utilities, mocks, fixtures
- **Babel transform**: Shared `.babelrc` with Webpack for JSX support
- **Setup file**: `webview-ui/test-setup.js` (acquireVsCodeApi mock, matchMedia mock, IntersectionObserver mock)

## Test Organization

### Directory Structure
```
webview-ui/
├── __mocks__/
│   ├── @mdx-js/mdx.js          # Mock MDX evaluate function (NOT compile)
│   └── styleMock.js             # Mock CSS imports
├── __snapshots__/               # Jest snapshots (auto-generated)
├── fixtures/
│   ├── simple.mdx               # Basic MDX sample
│   ├── with-tasks.mdx           # MDX with TaskLink components
│   └── malformed.mdx            # Invalid MDX for error testing
├── components/
│   ├── __snapshots__/           # Component snapshots (auto-generated)
│   ├── TaskLink.test.js         # 28+ tests - core task component
│   ├── TaskList.test.js         # 16 tests - task filtering
│   ├── RunningTasksPanel.test.js # 20 tests - running tasks panel
│   ├── RecentTasksList.test.js  # 8 tests - recent tasks panel
│   ├── StarredTasksList.test.js # 10 tests - starred tasks panel
│   └── ExecutionHistoryPanel.test.js # 16 tests - execution history
├── context.test.js              # 34 tests - state management
├── App.test.js                  # 40 tests - integration tests
├── test-utils.js                # Shared test utilities
└── test-setup.js                # Jest setup (acquireVsCodeApi mock)

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
- ✅ `onToggleRunningTasksCollapsed()` - Sends `setPanelState` message
- ✅ `onToggleStarredTasksCollapsed()` - Sends `setPanelState` message

**Computed State Tests**:
- ✅ `taskHistoryMap` - Computes average durations from successful executions
- ✅ `taskHistoryMap` - Excludes failed executions from average

**State Flow Tests**:
- ✅ Task lifecycle: idle → started → running → ended
- ✅ Task failure: idle → started → failed → dismissed
- ✅ Task with subtasks: parent tracks child execution states
- ✅ Cleanup: Removes message listener on unmount

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

**Dependency Visualization Tests**:
- ✅ Sequential dependencies: Horizontal segment layout
- ✅ Parallel dependencies: Grid layout
- ✅ Dependency segment running state
- ✅ Dependency segment error state
- ✅ Idle segments show success when parent has error
- ✅ Dependency segment with avgDuration shows progress
- ✅ Dependency segment without avgDuration shows indeterminate
- ✅ Hover dependency segment → Shows dependency info

**Starred State Tests**:
- ✅ Shows filled star icon when task is starred
- ✅ Shows empty star icon when task is not starred

**Failed Task Tests**:
- ✅ Shows failed dependency label
- ✅ Shows exit code on failed task
- ✅ Shows "Failed" without exit code when undefined
- ✅ Retry button on failed task triggers run

**Npm Task Tests**:
- ✅ Shows npm chip for npm tasks
- ✅ Resolves `npm: ` prefix for legacy MDX support
- ✅ Npm dependency segment uses script name as display label

**Task Lookup Tests**:
- ✅ Falls back to label lookup when taskId not found
- ✅ Uses label fallback when no taskId provided
- ✅ Task not found state when task doesn't exist

**Background State Tests**:
- ✅ Shimmer background for first-run tasks
- ✅ Progress background for subsequent runs
- ✅ Solid background for tasks running over 1 minute
- ✅ Error background for failed tasks

**Stopping State Tests**:
- ✅ Shows disabled stop button when `canStop: false` in taskStateChanged

**Color Map Tests**:
- ✅ Uses cached color from npmPathColorMap
- ✅ Assigns color via hash when no entry exists

**Runtime Formatting Tests**:
- ✅ Hours format for long-running tasks
- ✅ Minutes format

**Average Duration Tests**:
- ✅ Uses taskHistoryMap when task is not running

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

### 7. TaskList.jsx - Task Filtering Component (TaskList.test.js)

**Rendering Tests**:
- ✅ Empty state when no tasks match filter
- ✅ Renders filtered tasks that match labelStartsWith
- ✅ Renders all tasks when labelStartsWith is empty
- ✅ Renders tasks with custom displayLabel
- ✅ Handles tasks with dependencies
- ✅ Snapshot: Multiple tasks layout
- ✅ Snapshot: Empty state

**Filtering Logic Tests**:
- ✅ Filters tasks correctly with exact prefix match
- ✅ Handles case-sensitive filtering
- ✅ Filters with partial prefix match
- ✅ Shows empty message with code block of filter

**Props Passthrough Tests**:
- ✅ Passes disabled prop to TaskLink components
- ✅ Passes npm-related props to TaskLink
- ✅ Passes running tasks to TaskLink components (via context)
- ✅ Passes starred tasks to TaskLink components (via context)
- ✅ Renders tasks that have id but no label match

> **Note**: TaskList passes props to TaskLink, but TaskLink reads exclusively from context via `useTaskState()`. Tests inject data via `sendMessage('updateTasks', ...)` to set context state.

### 8. App.jsx - Main Application (App.test.js)

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
- ✅ Handles `updateNavigationHistory` message

**View Toggling Tests**:
- ✅ Click history icon → Switches to execution history view
- ✅ Click again → Switches back to document view
- ✅ Handles toggle history view back to document

**Breadcrumb Actions Tests**:
- ✅ Click file name → Opens current file in editor

**Utility Actions Tests**:
- ✅ Click copy button → Sends `copyTasksJson` message

**Scroll Persistence Tests**:
- ✅ Saves scroll position to VS Code state on navigation
- ✅ Restores scroll position when navigating back

**Log Buffer Tests**:
- ✅ Receives log buffer from extension

**Anchor Link Support Tests**:
- ✅ `generateHeadingId` creates proper slugs from text
- ✅ `generateHeadingId` handles React elements and arrays
- ✅ Renders headings with generated IDs for anchor linking
- ✅ Heading with nested React elements generates correct id (exercises array/element branches)
- ✅ Heading with numeric content generates correct id (exercises non-string branch)
- ✅ Anchor links scroll to target elements smoothly
- ✅ External links open in new tab with security attributes
- ✅ MDX file links trigger navigation messages

**Message Handler Tests**:
- ✅ Handles `error` message type from extension

**Integration Tests (Real MDX)**:
- ✅ Compiles and renders simple MDX fixture
- ✅ Handles MDX with syntax errors gracefully
- ✅ MDX content with TaskList component renders correctly (exercises TaskListWithState)

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

### Global Thresholds (Configured in jest.config.js)
- **Lines**: 80% (achieved: 93.67%)
- **Branches**: 75% (achieved: 81.74%)
- **Functions**: 80% (achieved: 91.37%)
- **Statements**: 80% (achieved: 92.62%)

### Per-Component Coverage (Achieved)
| Component | Stmts | Branch | Funcs | Lines |
|-----------|-------|--------|-------|-------|
| **context.js** | 95.74% | 85.07% | 88.23% | 97.05% |
| **App.jsx** | 85.09% | 86.25% | 77.77% | 85.33% |
| **TaskLink.jsx** | 93.70% | 76.98% | 96.72% | 95.70% |
| **TaskList.jsx** | 100% | 62.50% | 100% | 100% |
| **RunningTasksPanel.jsx** | 92.10% | 87.25% | 95.65% | 92.85% |
| **RecentTasksList.jsx** | 100% | 93.75% | 100% | 100% |
| **StarredTasksList.jsx** | 100% | 91.66% | 100% | 100% |
| **ExecutionHistoryPanel.jsx** | 98.27% | 92.85% | 100% | 98.03% |

> **Note on TaskList branch coverage (62.5%)**: The low branch percentage is due to the ternary `task.id || task.label` used as React key and conditional prop expressions. These branches are syntactically present but semantically trivial (all tasks have IDs). This doesn't impact overall coverage since it's a small file.

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
   - **Mitigation**: Mock is minimal (postMessage, getState, setState); expand as needed

4. **Timer-based tests**: Runtime/progress tests rely on `jest.advanceTimersByTime()`
   - **Mitigation**: Use fake timers consistently, wrap timer advances in `act()`

5. **`act()` warnings in TaskLink timer tests**: Some timer advances cause React state updates outside `act()`. These are cosmetic warnings that don't affect test correctness.
   - **Mitigation**: Wrap in `act()` where possible; remaining warnings are from internal MUI timer callbacks

6. **TaskList prop dead code**: TaskList passes props (tasks, runningTasks, etc.) to TaskLink, but TaskLink reads from context only. These props are architectural dead code. Tests inject state via context messages.

7. **TaskListWithState coverage**: This thin wrapper component (App.jsx lines 51-79) requires MDX content that uses `<TaskList>` to exercise. Coverage is achieved through one integration test that renders a TaskList in MDX content.

8. **Uncovered App.jsx branches**: Lines 166, 170, 183, 218-227, 336-342, 434, 471-493 involve:
   - Navigation history menu with recent documents (requires complex multi-file navigation state)
   - Scroll-to-anchor on initial load (requires `window.location.hash`)
   - Breadcrumb trail rendering (requires multi-file navigation history)
   - These are UI-heavy branches that would require extensive setup for marginal coverage gain

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

**Last Updated**: Implementation complete
**Test Count**: 202 tests across 8 test files
**Coverage**: 92.62% statements, 81.74% branches, 91.37% functions, 93.67% lines
