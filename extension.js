const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const MdxWebviewProvider = require('./src/providers/MdxWebviewProvider');
const Logger = require('./src/Logger');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	const logger = new Logger('Control Panel');
	logger.info('Control Panel extension is now active!');
	context.subscriptions.push(logger);

	// Register the webview provider
	const provider = new MdxWebviewProvider(context, logger);
	
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('controlpanel.mdxView', provider)
	);

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand('controlpanel.openMdx', async () => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) {
				vscode.window.showErrorMessage('No workspace folder open');
				return;
			}

			const cpdoxPath = path.join(workspaceFolders[0].uri.fsPath, '.cpdox');
			
			if (!fs.existsSync(cpdoxPath)) {
				const create = await vscode.window.showInformationMessage(
					'No .cpdox directory found. Create one?',
					'Yes', 'No'
				);
				
				if (create === 'Yes') {
					fs.mkdirSync(cpdoxPath, { recursive: true });
					await createExampleFiles(cpdoxPath);
					vscode.window.showInformationMessage('.cpdox directory created with example files!');
				}
				return;
			}

			// Show the Control Panel view
			await vscode.commands.executeCommand('controlpanel.mdxView.focus');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('controlpanel.refreshView', async () => {
			await provider.loadDefaultMdx();
			await provider.sendTasksToWebview();
		})
	);

	// Watch for changes in .cpdox directory
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (workspaceFolders) {
		const cpdoxPath = path.join(workspaceFolders[0].uri.fsPath, '.cpdox');
		
		if (fs.existsSync(cpdoxPath)) {
			const watcher = vscode.workspace.createFileSystemWatcher(
				new vscode.RelativePattern(workspaceFolders[0], '.cpdox/**/*.mdx')
			);

			watcher.onDidChange(async () => {
				await provider.loadDefaultMdx();
			});

			watcher.onDidCreate(async () => {
				await provider.loadDefaultMdx();
			});

			watcher.onDidDelete(async () => {
				await provider.loadDefaultMdx();
			});

			context.subscriptions.push(watcher);
		}
	}

	// Watch for active editor changes to sync MDX file navigation
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(async (editor) => {
			if (!editor || !editor.document) {
				return;
			}

			const filePath = editor.document.uri.fsPath;
			const workspaceFolders = vscode.workspace.workspaceFolders;
			
			if (!workspaceFolders) {
				return;
			}

			// Check if the file is an MDX file in any .cpdox folder within the workspace
			const workspaceRoot = workspaceFolders[0].uri.fsPath;
			const relativePath = path.relative(workspaceRoot, filePath);
			
			// Match any .cpdox folder at any depth
			if (relativePath.includes('.cpdox') && filePath.endsWith('.mdx')) {
				// Extract just the filename
				const fileName = path.basename(filePath);
				
				// Navigate the Control Panel to this file
				await provider.loadMdxFile(fileName);
			}
		})
	);
}

async function createExampleFiles(cpdoxPath) {
	const gettingStarted = `# Getting Started

Welcome to the **Control Panel** - your interactive documentation and task management hub!

## What is Control Panel?

Control Panel combines documentation with executable tasks, making it easy to:

- 📖 Browse documentation in MDX format
- ▶️ Run tasks directly from documentation
- 🔗 Navigate between related docs
- ⚡ Monitor running tasks in real-time

## Quick Start

Check out our example tasks below:

<TaskList labelStartsWith="build:" />

## Navigation

- [Development Guide](development.mdx)
- [Deployment Guide](deployment.mdx)

## Example Task Link

Need to build the project? <TaskLink label="build:all" />
`;

	const development = `# Development Guide

This guide covers the development workflow for your project.

## Build Tasks

<TaskList labelStartsWith="build:" />

## Test Tasks

Run your tests directly from here:

<TaskList labelStartsWith="test:" />

## Development Server

Start the development server: <TaskLink label="dev:start" />

## Code Quality

- Lint your code: <TaskLink label="lint:check" />
- Format your code: <TaskLink label="lint:fix" />

## Related Docs

- [Back to Getting Started](getting-started.mdx)
- [Deployment Guide](deployment.mdx)
`;

	const deployment = `# Deployment Guide

Ready to deploy your application? This guide will help you through the process.

## Pre-Deployment Checklist

1. Run all tests: <TaskLink label="test:all" />
2. Build production bundle: <TaskLink label="build:production" />
3. Run security audit: <TaskLink label="security:audit" />

## Deployment Tasks

<TaskList labelStartsWith="deploy:" />

## Environment-Specific Deployments

- **Staging**: <TaskLink label="deploy:staging" />
- **Production**: <TaskLink label="deploy:production" />

## Post-Deployment

After deployment, monitor your application:

- Check logs: <TaskLink label="logs:production" />
- Run smoke tests: <TaskLink label="test:smoke" />

## Related Docs

- [Back to Getting Started](getting-started.mdx)
- [Development Guide](development.mdx)
`;

	fs.writeFileSync(path.join(cpdoxPath, 'getting-started.mdx'), gettingStarted);
	fs.writeFileSync(path.join(cpdoxPath, 'development.mdx'), development);
	fs.writeFileSync(path.join(cpdoxPath, 'deployment.mdx'), deployment);
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
};
