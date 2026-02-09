import React from 'react';
import Chip from '@mui/material/Chip';

// Define 10 VS Code theme colors for npm path color-coding
const NPM_CHIP_COLORS = [
  'var(--vscode-charts-blue)',
  'var(--vscode-charts-green)',
  'var(--vscode-charts-orange)',
  'var(--vscode-charts-purple)',
  'var(--vscode-charts-yellow)',
  'var(--vscode-charts-red)',
  'var(--vscode-terminal-ansiCyan)',
  'var(--vscode-terminal-ansiMagenta)',
  'var(--vscode-terminal-ansiBrightBlue)',
  'var(--vscode-terminal-ansiBrightMagenta)'
];

const normalizePath = (path) => {
  if (!path) return '';
  return path.trim().toLowerCase().replace(/^\.\//, '');
};

const getNpmColor = (path) => {
  if (!path) return NPM_CHIP_COLORS[0];
  const normalized = normalizePath(path);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % NPM_CHIP_COLORS.length;
  return NPM_CHIP_COLORS[index];
};

/**
 * Recursive Segment component for rendering task dependency trees.
 *
 * Each Segment renders:
 * 1. Its own hoverable cell (segment-cell) with label, npm chip, state indicator
 * 2. Its children in a container (parallel = column, sequential = row)
 *    where each child is itself a <Segment> that recurses.
 *
 * Props:
 *   task           - Tree node: { label, id, source, definition, dependsOn, dependsOrder }
 *   getSegmentState  - (taskIdOrLabel) => 'idle' | 'running' | 'success' | 'error'
 *   getProgressInfo  - (taskIdOrLabel) => { progress: number, indeterminate: boolean }
 *   getDisplayLabel  - (task) => string
 *   onSegmentHover   - (event, taskIdOrLabel) => void
 *   onSegmentLeave   - () => void
 *   onOpenDefinition - (taskIdOrLabel) => void
 *   disabled         - boolean
 *   isRoot           - boolean (true for the top-level task in the chain)
 */
function Segment({
  task,
  getSegmentState,
  getProgressInfo,
  getDisplayLabel,
  onSegmentHover,
  onSegmentLeave,
  onOpenDefinition,
  disabled = false,
  isRoot = false,
}) {
  if (!task) return null;

  const taskKey = task.id || task.label;
  const children = task.dependsOn || [];
  const hasChildren = children.length > 0;
  const dependsOrder = task.dependsOrder || 'parallel';

  // Get this segment's state (may be aggregate from children)
  const ownDirectState = getSegmentState(taskKey);

  // Derive aggregate state from children for visual display on this cell
  const aggregateState = deriveAggregateState(ownDirectState, children, getSegmentState);

  const displayLabel = getDisplayLabel(task);
  const isNpmTask = task.source === 'npm';
  const npmPath = task.definition?.path;

  const progressInfo = getProgressInfo(taskKey);

  return (
    <div className="segment" data-testid={`segment-${taskKey}`}>
      {/* This task's own hoverable cell */}
      <div
        className={`segment-cell segment-${aggregateState} ${isRoot ? 'segment-root' : ''} ${progressInfo.indeterminate || aggregateState === 'descendant-running' ? 'segment-cell-indeterminate' : ''}`}
        style={{ '--segment-progress': aggregateState === 'descendant-running' ? '0%' : `${progressInfo.progress}%` }}
        onDoubleClick={disabled ? undefined : () => onOpenDefinition(taskKey)}
        onMouseEnter={(e) => onSegmentHover(e, taskKey)}
        onMouseLeave={onSegmentLeave}
        title={disabled ? undefined : 'Double-click to open task definition'}
      >
        {isNpmTask && (
          <Chip
            label="npm"
            size="small"
            sx={{
              height: 18,
              fontSize: '10px',
              fontWeight: 600,
              marginRight: '6px',
              backgroundColor: getNpmColor(npmPath),
              color: 'var(--vscode-button-foreground)',
              '& .MuiChip-label': {
                padding: '0 6px'
              }
            }}
          />
        )}
        <span className="segment-label">{displayLabel}</span>
        <span className={`segment-timer ${progressInfo.indeterminate ? 'segment-timer-indeterminate' : ''}`} />
      </div>

      {/* Children reversed so first-to-execute appears on the right */}
      {hasChildren && (
        <div className={`segment-children segment-children-${dependsOrder === 'sequence' ? 'sequential' : 'parallel'}`}>
          {[...children].reverse().map((child) => (
            <Segment
              key={child.id || child.label}
              task={child}
              getSegmentState={getSegmentState}
              getProgressInfo={getProgressInfo}
              getDisplayLabel={getDisplayLabel}
              onSegmentHover={onSegmentHover}
              onSegmentLeave={onSegmentLeave}
              onOpenDefinition={onOpenDefinition}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Derive the visual state for a segment cell based on its own direct state
 * and the aggregate state of all descendant children.
 *
 * Priority: error > running > success > idle
 */
function deriveAggregateState(ownState, children, getSegmentState) {
  if (!children || children.length === 0) {
    return ownState;
  }

  // Collect states from all descendants (recursive)
  const descendantStates = collectDescendantStates(children, getSegmentState);

  // Own state takes priority if it's error
  if (ownState === 'error') return 'error';

  // Any descendant error → parent shows error
  if (descendantStates.includes('error')) return 'error';

  // For compound tasks (with children), VS Code marks the parent as 'running' too.
  // So if this node has children, treat own 'running' as 'descendant-running'
  // to show indeterminate shimmer instead of full running state.
  if (ownState === 'running' || descendantStates.includes('running')) return 'descendant-running';

  // All descendants success → show success
  if (descendantStates.length > 0 && descendantStates.every(s => s === 'success')) {
    return 'success';
  }

  return ownState;
}

/**
 * Recursively collect the states of all descendants in the tree.
 */
function collectDescendantStates(children, getSegmentState) {
  const states = [];
  for (const child of children) {
    const childKey = child.id || child.label;
    states.push(getSegmentState(childKey));
    if (child.dependsOn && child.dependsOn.length > 0) {
      states.push(...collectDescendantStates(child.dependsOn, getSegmentState));
    }
  }
  return states;
}

export { getNpmColor };
export default Segment;
