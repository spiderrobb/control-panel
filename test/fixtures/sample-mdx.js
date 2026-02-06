/**
 * Sample MDX content for tests.
 */

const SIMPLE_MDX = `# Hello World

This is a simple MDX file.
`;

const MDX_WITH_TASK_LINK = `# Build Guide

Run the build: <TaskLink label="build:all" />

Some more text here.
`;

const MDX_WITH_TASK_LIST = `# Tasks Overview

## Build Tasks

<TaskList labelStartsWith="build:" />

## Test Tasks

<TaskList labelStartsWith="test:" />
`;

const MDX_MIXED = `# Development Guide

Welcome to the development guide.

## Quick Build

<TaskLink label="build:dev" />

## All Build Tasks

<TaskList labelStartsWith="build:" />

## Run Tests

<TaskLink label="test:unit" />

Some closing text.
`;

const MDX_EMPTY = '';

const MDX_NO_COMPONENTS = `# Plain Markdown

Just some plain markdown content.

- Item 1
- Item 2
- Item 3
`;

const TASKS_JSON_CONTENT = `{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "build",
      "type": "shell",
      "command": "npm run build"
    },
    {
      "label": "test",
      "type": "shell",
      "command": "npm test",
      "dependsOn": ["build"]
    },
    {
      "label": "lint",
      "type": "shell",
      "command": "npm run lint"
    }
  ]
}`;

module.exports = {
  SIMPLE_MDX,
  MDX_WITH_TASK_LINK,
  MDX_WITH_TASK_LIST,
  MDX_MIXED,
  MDX_EMPTY,
  MDX_NO_COMPONENTS,
  TASKS_JSON_CONTENT,
};
