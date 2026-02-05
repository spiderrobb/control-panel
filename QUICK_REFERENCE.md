# Quick Reference: Task Progress Features

## Visual States

### 🌟 First Run
```
┌─────────────────────────────────────────┐
│ 🟢 build:extension   15s   ⚡ ■         │
│ ╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱   │ ← Animated diagonal stripes
└─────────────────────────────────────────┘
```

### 📊 Subsequent Run (With History)
```
┌─────────────────────────────────────────┐
│ 🟢 build:extension   15s  45%  ⚡ ■     │
│ ████████████████░░░░░░░░░░░░░░░░░░░░░░ │ ← Progress bar fills left→right
└─────────────────────────────────────────┘
```

### ⏱️ Long Running (>1 minute)
```
┌─────────────────────────────────────────┐
│ 🟢 test:integration  2m 15s   ⚡ ■      │
│ ███████████████████████████████████████ │ ← Solid blue background
└─────────────────────────────────────────┘
```

### 🌳 With Subtasks
```
┌─────────────────────────────────────────┐
│ 🟢 build:all        1m 23s  65%  ⚡ ■   │
│ ████████████████████████░░░░░░░░░░░░░░ │
├─────────────────────────────────────────┤
│   ↳ build:extension                     │ ← Subtask 1
│   ↳ build:webview                       │ ← Subtask 2
│   ↳ test:unit                           │ ← Subtask 3
└─────────────────────────────────────────┘
```

## Running Tasks Panel

### Location
```
┌─────────────────────────────────────────┐
│ # Documentation Content                 │
│                                         │
│ <TaskLink label="build:all" />         │
│                                         │
│ More content...                         │
│                                         │
├═════════════════════════════════════════┤ ← Panel appears here
│ Running Tasks (3)                       │
├─────────────────────────────────────────┤
│ 🟢 build:all        1m 23s  65%  ⚡ ■   │
│   ↳ build:extension                     │
│   ↳ build:webview                       │
├─────────────────────────────────────────┤
│ 🟢 test:unit         8s   50%  ⚡ ■     │
├─────────────────────────────────────────┤
│ 🟢 compile          45s   ╱╱╱╱  ⚡ ■     │
└─────────────────────────────────────────┘
```

## Button Functions

| Button | Symbol | Function |
|--------|--------|----------|
| Run    | ▶      | Start task execution |
| Focus  | ⚡      | Show task's terminal |
| Stop   | ■      | Terminate running task |

## Progress Calculation

```
Current Runtime: 15s
Average Duration: 30s
Progress: (15 / 30) × 100 = 50%

Display: ████████████████░░░░░░░░░░░░░░░
```

## Task States

| State | Indicator | Background | Runtime | Controls |
|-------|-----------|------------|---------|----------|
| Idle | 🔵 | None | - | ▶ |
| First Run | 🟢 | Stripes ╱╱╱ | ✓ | ⚡ ■ |
| Running | 🟢 | Progress ████ | ✓ | ⚡ ■ |
| Long Run | 🟢 | Solid ████ | ✓ | ⚡ ■ |

## Storage Details

### What's Stored
```javascript
globalState.taskHistory = {
  "build:all": {
    durations: [45000, 47000, 44000, 46000, 45500], // ms
    count: 5  // total runs
  }
}
```

### Rolling Average
- Keeps last **10 runs**
- Older runs automatically removed
- Persists across VS Code sessions

## Keyboard Shortcuts

*Note: These would need to be defined in package.json*

Suggested shortcuts:
- `Ctrl+Shift+R` - Run focused task
- `Ctrl+Shift+S` - Stop all tasks
- `Ctrl+Shift+T` - Focus running tasks panel

## Examples

### Running Multiple Tasks
```bash
# From documentation:
1. Click <TaskLink label="build:extension" />
2. Click <TaskLink label="build:webview" />
3. Click <TaskLink label="test:unit" />

# Result: All 3 show in Running Tasks panel
```

### Checking Task History
```bash
# Run a task 3+ times
# Each run updates the rolling average
# Progress becomes more accurate

Run 1: ╱╱╱╱╱╱  (no history)
Run 2: ████░░  (1 data point)
Run 3: ███░░░  (2 data points, more accurate)
Run 4: ████░░  (3+ data points, very accurate)
```

## MDX Components

### TaskLink
```jsx
<TaskLink label="build:all" />
```
Shows a single task with hover controls

### TaskList
```jsx
<TaskList labelStartsWith="build:" />
```
Shows all tasks matching the prefix

## Color Scheme

Uses VS Code theme colors:
- 🔵 Idle: `--vscode-charts-blue`
- 🟢 Running: `--vscode-charts-green`
- 🟡 Focus: `--vscode-charts-yellow`
- 🔴 Stop: `--vscode-charts-red`

All colors adapt to user's theme (light/dark/custom)

## Performance

- **Update Frequency**: 1 second
- **Storage Size**: ~200 bytes per task
- **Max History**: 10 runs per task
- **Memory Cleanup**: Automatic on task completion

## Tips

1. **First run any task** to establish baseline
2. **Run again** to see progress estimates
3. **Check panel** for multi-task overview
4. **Focus terminal** to see detailed output
5. **Stop anytime** with ■ button

---

**Next Steps**: See [task-progress.mdx](.cpdox/task-progress.mdx) for full documentation
