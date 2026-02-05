# Testing the Control Panel Extension

## Quick Start

1. **Press F5** in this workspace to start debugging
2. A new window opens (Extension Development Host) with the `test-workspace` folder loaded
3. Look for the **Control Panel** icon (📊 dashboard) in the activity bar on the left
4. Click it to open the documentation panel

## What to Test

### ✅ Navigation
- Click the links between MDX files (Getting Started → Development → Deployment)
- Verify the breadcrumb at the top shows the current file
- Navigate back and forth between files

### ✅ TaskLink Component
1. Find a TaskLink like `<TaskLink label="build:all" />`
2. **Hover** over it - you should see:
   - Blue status indicator
   - Run button (▶)
   - Expanded border
3. **Click the run button** - you should see:
   - Green pulsing indicator
   - Runtime counter (updating every second)
   - Stop button (■)
   - Focus terminal button (⚡)
4. **Click focus** - should open/focus the task's terminal
5. **Click stop** - should terminate the task

### ✅ TaskList Component
1. Find a TaskList like `<TaskList labelStartsWith="build:" />`
2. Verify it shows all tasks with labels starting with "build:"
3. Each item should be a clickable TaskLink
4. Try different prefixes:
   - `test:` - Shows testing tasks
   - `deploy:` - Shows deployment tasks
   - `docker:` - Shows Docker tasks

### ✅ Task Execution
Try running different types of tasks:
- **Quick tasks**: `build:clean`, `lint:check` (complete in 1-3 seconds)
- **Long tasks**: `test:integration`, `deploy:production` (run for 3-5 seconds)
- **Background tasks**: `dev:start`, `docker:up` (run indefinitely)
  - These need to be stopped manually with the stop button

### ✅ Multiple Tasks
- Run multiple tasks at the same time
- Each should have its own terminal
- Each should show independent runtime counters
- Each can be stopped independently

## Common Issues & Solutions

### Issue: Control Panel icon not visible
**Solution**: Make sure you're looking in the **Extension Development Host** window (the new window that opened), not the original development window.

### Issue: No MDX files shown
**Solution**: The test-workspace should open automatically. If not, manually open the `test-workspace` folder in the Extension Development Host.

### Issue: Tasks don't run
**Solution**: 
- Check that tasks.json is present in test-workspace/.vscode/
- Open the Developer Tools (Help → Toggle Developer Tools) to see console errors
- The mock tasks just echo messages and sleep, so they should always work

### Issue: Extension doesn't load
**Solution**:
- Make sure you ran `npm run compile` before pressing F5
- Check for errors in the Debug Console (View → Debug Console)
- Rebuild: `npm run compile` and try again

## Example Test Flow

1. Open Control Panel
2. Read "Getting Started" page
3. Click link to "Development Guide"
4. Hover over `<TaskLink label="test:unit" />`
5. Click run button
6. Watch it run for 2 seconds with green indicator
7. See it complete and return to idle
8. Click link to "Deployment Guide"
9. Find `<TaskList labelStartsWith="deploy:" />`
10. Run `deploy:staging` from the list
11. While it's running, click the focus button to see the terminal
12. Let it complete (5 seconds)

## Viewing Console Output

- **Debug Console** (Ctrl+Shift+Y): Extension host logs
- **Terminal**: Task output (click focus button on running task)
- **Developer Tools** (Help → Toggle Developer Tools): Webview console logs

## Making Changes

If you modify the extension code:
1. Stop debugging (Shift+F5)
2. Rebuild: `npm run compile`
3. Start debugging again (F5)

If you modify webview code (React components):
1. The changes require a rebuild
2. Or run `npm run watch` in a terminal for auto-rebuild
3. Reload the Extension Development Host (Ctrl+R)

## File Locations

- Extension code: `/extension.js`, `/src/providers/MdxWebviewProvider.js`
- Webview UI: `/webview-ui/*.jsx`
- Example MDX: `/test-workspace/.cpdox/*.mdx`
- Mock tasks: `/test-workspace/.vscode/tasks.json`

Happy testing! 🚀
