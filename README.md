# ControlPanel Extension

A VS Code extension developed in JavaScript using dev containers.

## Development Setup

1. Install the "Remote - Containers" extension in VS Code
2. Open this folder in VS Code
3. Click "Reopen in Container" when prompted (or use Command Palette: "Remote-Containers: Reopen in Container")
4. Wait for the container to build and dependencies to install

## Running the Extension

1. Press `F5` or go to Run and Debug view
2. Select "Run Extension" and press the play button
3. A new VS Code window will open with your extension loaded
4. Press `Cmd+Shift+P` and run "Hello World" command

## Testing

The extension includes a basic "Hello World" command that displays a notification message.

## Packaging

To create a `.vsix` file for distribution:

```bash
npm run package
```
