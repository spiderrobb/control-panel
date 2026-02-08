# Webview UI Bugs Identified During Test Implementation

**Date:** February 7, 2026  
**Source:** Discovered while implementing the webview test plan (202 tests across 8 files)

---

## Bug Summary

| # | Title | Severity | File | Status |
|---|-------|----------|------|--------|
| 1 | Dead props — incomplete context migration | 🟠 Medium | TaskList.jsx → TaskLink.jsx | Open |
| 2 | `setTimeout` inside state updater — resource leak | 🟠 Medium | context.js | Open |
| 3 | `npmPathColorMap` is dead state — color feature non-functional | 🟡 Low-Medium | TaskLink.jsx | Open |
| 4 | Redundant identical task lookup | 🟡 Low | TaskLink.jsx | Open |

---

## Bug 1: Dead Props — Incomplete Context Migration

**Severity:** 🟠 Medium  
**Location:** `TaskList.jsx` line 4 → `TaskLink.jsx` line 37

### Description

`TaskList` passes **13 props** to `TaskLink`:

| Prop | Used by TaskLink? |
|------|-------------------|
| `taskId` | ✅ Yes (destructured from props) |
| `label` | ✅ Yes (destructured from props) |
| `displayLabel` | ✅ Yes (destructured from props) |
| `disabled` | ✅ Yes (destructured from props) |
| `onRun` | ❌ Dead — read from `useTaskState()` |
| `onStop` | ❌ Dead — read from `useTaskState()` |
| `onFocus` | ❌ Dead — read from `useTaskState()` |
| `onOpenDefinition` | ❌ Dead — read from `useTaskState()` |
| `taskState` | ❌ Dead — derived internally from context |
| `allRunningTasks` | ❌ Dead — read from `useTaskState()` |
| `tasks` | ❌ Dead — read from `useTaskState()` |
| `starredTasks` | ❌ Dead — read from `useTaskState()` |
| `onToggleStar` | ❌ Dead — read from `useTaskState()` |
| `npmPathColorMap` | ❌ Dead — read from `useTaskState()` |
| `setNpmPathColorMap` | ❌ Dead — read from `useTaskState()` |
| `dependencySegments` | ❌ Dead — derived internally from context |
| `dependsOrder` | ❌ Dead — derived internally from context |

**13 of 17 props are dead code.** `TaskLink` only destructures `{ label, taskId, displayLabel, disabled }` and reads everything else from `useTaskState()` context.

Additionally, `TaskListWithState` in `App.jsx` (lines 51–79) destructures these same values from context and passes them to `TaskList`, which passes them to `TaskLink`, which ignores them — a three-level dead prop chain.

### Risk

- If someone reads the prop-passing code and assumes props are the source of truth, they could introduce data inconsistencies between what `TaskList` passes and what context provides.
- Increased maintenance burden: changes to context must also update dead props to avoid confusion.
- Unnecessary re-renders: changes to these prop values trigger re-renders in `TaskList` even though `TaskLink` ignores them.

### Suggested Fix

Remove dead props from `TaskList.jsx`, simplify `TaskListWithState` in `App.jsx`, and let `TaskLink` rely solely on context (which it already does):

```jsx
// TaskList.jsx — simplified
function TaskList({ labelStartsWith, tasks, disabled }) {
  const filteredTasks = tasks.filter(task =>
    task.label.startsWith(labelStartsWith)
  );
  // ...
  const renderTask = (task) => (
    <li key={task.id || task.label}>
      <TaskLink
        taskId={task.id}
        label={task.label}
        displayLabel={task.displayLabel}
        disabled={disabled}
      />
    </li>
  );
}
```

---

## Bug 2: `setTimeout` Inside State Updater — Resource Leak

**Severity:** 🟠 Medium  
**Location:** `context.js` lines 146–160 — `taskEnded` message handler

### Description

The `taskEnded` handler schedules a `setTimeout` **inside** a `setRunningTasks` state updater function:

```javascript
case 'taskEnded':
  setRunningTasks(prev => {
    const updated = { ...prev };
    if (updated[message.taskLabel]) {
      updated[message.taskLabel].running = false;
      // ⚠️ Side effect inside state updater
      setTimeout(() => {
        setRunningTasks(current => {
          if (!current[message.taskLabel] || current[message.taskLabel].running) return current;
          const copy = { ...current };
          delete copy[message.taskLabel];
          return copy;
        });
      }, 1000);
    }
    return updated;
  });
  break;
```

### Problems

1. **No cleanup on unmount:** The `setTimeout` ID is never captured or cleared. If the webview panel closes within 1 second of a task ending, the callback fires `setRunningTasks` on an unmounted component.

2. **Duplicate timers in Strict Mode:** React may invoke state updater functions more than once (in Strict Mode or concurrent features). Each invocation schedules another `setTimeout`, creating duplicate cleanup timers for the same task.

3. **Anti-pattern:** Side effects (`setTimeout`) inside state updaters violate React's expectation that updaters are pure functions.

### Guard Mitigation

The inner `setRunningTasks` uses a functional updater with a guard (`if (!current[label] || current[label].running) return current`), which prevents data corruption. The bug is a resource leak, not a data integrity issue.

### Suggested Fix

Move the `setTimeout` outside the state updater and track timer IDs for cleanup:

```javascript
case 'taskEnded': {
  setRunningTasks(prev => {
    if (!prev[message.taskLabel]) return prev;
    return {
      ...prev,
      [message.taskLabel]: { ...prev[message.taskLabel], running: false }
    };
  });
  // Side effect outside state updater
  const timerId = setTimeout(() => {
    setRunningTasks(current => {
      if (!current[message.taskLabel] || current[message.taskLabel].running) return current;
      const copy = { ...current };
      delete copy[message.taskLabel];
      return copy;
    });
  }, 1000);
  // Store timerId for cleanup in useEffect return
  break;
}
```

---

## Bug 3: `npmPathColorMap` Is Dead State — Color Feature Non-Functional

**Severity:** 🟡 Low-Medium  
**Location:** `TaskLink.jsx` lines 90–118 — `getNpmColor()` function

### Description

The `getNpmColor` function is designed to assign stable colors to npm task paths via `npmPathColorMap` (context state) and `setNpmPathColorMap` (context setter). However:

1. `setNpmPathColorMap` is **never called**. The code block that would call it (lines 100–110) was intentionally skipped with a comment explaining it would cause render loops.

2. Since `setNpmPathColorMap` is never called, `npmPathColorMap` remains `{}` (its initial value) forever. The map lookup on line 94 (`npmPathColorMap[normalized]`) always misses.

3. All color assignments fall through to the **hash-based fallback** (lines 113–117), which is deterministic and stable for a given path string.

4. The hash-based fallback uses a **different algorithm** than the map-based assignment would. The map assigns colors sequentially (`assignedColors.length % NPM_CHIP_COLORS.length`), while the hash uses character-code hashing. These two strategies would produce conflicting color indices for the same path.

### Impact

- Colors are **stable today** because they always use the hash fallback.
- `npmPathColorMap` state, its context propagation, and the `setNpmPathColorMap` setter are all dead code.
- If anyone attempts to fix/enable the map feature without removing the hash fallback, paths could get different colors depending on which code path runs first.

### Suggested Fix

Either:
- **Option A:** Remove the dead map code entirely and keep only the hash-based assignment.
- **Option B:** Move color assignment to a `useEffect` or event handler (not during render) and remove the hash fallback.

---

## Bug 4: Redundant Identical Task Lookup

**Severity:** 🟡 Low  
**Location:** `TaskLink.jsx` lines 59–65

### Description

```javascript
// Line 59: First lookup
let currentTask = taskId ? tasks.find(t => t.id === taskId) : null;

// Line 62: Fallback block
if (!currentTask && tasks.length > 0) {
    if (taskId) {
      // Line 64: IDENTICAL lookup — guaranteed to return null again
      currentTask = tasks.find(t => t.id === taskId);
    } else if (label) {
      // ...label-based fallback...
    }
}
```

Line 59 searches `tasks` by `taskId`. If it returns `null`, the fallback block is entered. Inside the fallback, line 64 checks `if (taskId)` and performs the **exact same** `tasks.find(t => t.id === taskId)` lookup — which is guaranteed to return `null` again since `tasks` hasn't changed.

### Impact

- Wasted `Array.find()` call on every render when `taskId` is provided but doesn't match.
- Dead code branch misleads future readers into thinking the fallback does something different.

### Suggested Fix

Remove the redundant `if (taskId)` branch inside the fallback. The fallback should only handle the label-based lookup:

```javascript
let currentTask = taskId ? tasks.find(t => t.id === taskId) : null;

if (!currentTask && tasks.length > 0 && label) {
  const matching = tasks.filter(t => t.label === label);
  currentTask = matching.find(t => t.source === 'Workspace') || matching[0];

  if (!currentTask && label.startsWith('npm: ')) {
    const scriptName = label.substring(5);
    currentTask = tasks.find(t => t.source === 'npm' && t.label === scriptName);
  }
}
```

---

## Testing Notes

All 4 bugs were discovered while implementing the webview test plan. The test suite (202 tests, 81.74% branch coverage) works around these bugs but does not fix them:

- **Bug 1** was discovered when tests for `TaskList` tried to pass `runningTasks`/`starredTasks` as props and `TaskLink` ignored them — data had to be injected via context `sendMessage` instead.
- **Bug 2** was observed during `taskEnded` lifecycle tests with fake timers, where timer callbacks fired after cleanup.
- **Bug 3** was discovered when testing npm color assignment — the `npmPathColorMap` state path was never exercised because it's never populated.
- **Bug 4** was found when testing the `taskId` fallback lookup branch — the test for "taskId provided but not found" hit line 64 which repeated the failed lookup.

---

## Relationship to Existing Bug Document

These 4 webview UI bugs are **separate from** the 9 backend bugs documented in `BUGS_IDENTIFIED.md`, which covers `MdxWebviewProvider.js` (extension host side). There is no overlap.
