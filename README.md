# Control Panel

An innovative VS Code extension that combines **interactive documentation** with **executable task management**. Navigate MDX documentation files and run tasks directly from your docs!

## ✨ Features

- 📖 **MDX Documentation Browser** - Create interactive documentation using MDX format
- ▶️ **Inline Task Execution** - Run VS Code tasks directly from documentation
- 🔗 **Seamless Navigation** - Link between documentation pages within the sidebar
- ⚡ **Real-time Task Monitoring** - See task status, runtime, and controls
- 🎯 **Smart Task Components** - Custom React components for task interaction

## 🚀 Getting Started

### 1. Create a `.cpdox` Directory

Create a `.cpdox` folder in your workspace root. This is where your MDX documentation files will live.

```bash
mkdir .cpdox
```

### 2. Create MDX Files

Add `.mdx` files to document your project workflows:

```mdx
# My Project Guide

Welcome to my project! Here are the key tasks:

## Build Tasks

<TaskList labelStartsWith="build:" />

## Quick Actions

Need to start the dev server? <TaskLink label="dev:start" />
```

### 3. Open the Control Panel

Click the Control Panel icon (dashboard icon) in the activity bar to open the documentation viewer.

## 📝 MDX Components

### `<TaskLink>`

Display a single task as an interactive link with hover controls.

```mdx
<TaskLink label="build:all" />
```

**Features:**
- Hover to reveal run button (▶)
- Click to execute the task
- Shows runtime counter when running
- Provides stop (■) and focus (⚡) buttons during execution

### `<TaskList>`

Display a filtered list of tasks from your `tasks.json` file.

```mdx
<TaskList labelStartsWith="build:" />
```

**Props:**
- `labelStartsWith` - Filter tasks by label prefix

## 🎨 Task States

Tasks display different states:

- **Idle** - 🔵 Blue indicator, shows run button on hover
- **Running** - 🟢 Green pulsing indicator, shows runtime and controls
- **Stopped** - Task returns to idle state

## 📁 Example Project Structure

```
your-workspace/
├── .cpdox/
│   ├── getting-started.mdx
│   ├── development.mdx
│   └── deployment.mdx
├── .vscode/
│   └── tasks.json
└── ... your project files
```

## 🔧 Example tasks.json

The extension works with your existing VS Code tasks:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "build:all",
      "type": "shell",
      "command": "npm run build"
    },
    {
      "label": "dev:start",
      "type": "shell",
      "command": "npm run dev",
      "isBackground": true
    },
    {
      "label": "test:unit",
      "type": "shell",
      "command": "npm run test"
    }
  ]
}
```

## 💡 Use Cases

- **Onboarding Documentation** - Help new team members discover and run key tasks
- **Workflow Guides** - Document complex multi-step processes
- **DevOps Runbooks** - Create executable deployment guides
- **Testing Guides** - Organize and document test suites
- **Project Dashboard** - Quick access to common development tasks

## 🎯 Example MDX Files

This repository includes example files in `.cpdox/`:
- **getting-started.mdx** - Introduction and overview
- **development.mdx** - Development workflow
- **deployment.mdx** - Deployment procedures

## 🔗 Navigation

Link between MDX files using standard Markdown links:

```mdx
Check out the [Development Guide](development.mdx) for more info.
```

## 🎨 Icon

The extension uses VS Code's built-in `$(dashboard)` codicon for the activity bar.

## 🛠️ Development

### Prerequisites

- Node.js 18+
- VS Code 1.85.0+

### Setup

```bash
npm install
npm run compile
```

### Watch Mode

```bash
npm run watch
```

### Debugging

Press **F5** to launch the Extension Development Host. This will:
1. Build the extension
2. Open a new VS Code window (Extension Development Host)
3. Automatically load the `test-workspace` folder with example `.cpdox` files and tasks

The test workspace includes:
- Example MDX files in `.cpdox/` (getting-started, development, deployment)
- Mock `tasks.json` with 30+ realistic task examples
- Everything you need to test TaskLink and TaskList components

### Testing the Extension

1. Press F5 to start debugging
2. In the Extension Development Host window, look for the **Control Panel** icon (dashboard) in the activity bar
3. Click it to open the documentation panel
4. Navigate through the MDX files
5. Test running tasks using TaskLink components
6. Watch task status indicators and controls

## 📄 License

MIT

## 🤝 Contributing

Contributions welcome! This extension was inspired by Task Explorer and aims to provide a more flexible, documentation-centric approach to task management.

---

**Tip**: Start with simple documentation and gradually add more task components as your workflow evolves!
