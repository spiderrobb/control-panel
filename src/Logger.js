const vscode = require('vscode');

/**
 * Centralized logger for the Control Panel extension.
 * 
 * Writes to a VS Code OutputChannel ("Control Panel") so users can view logs
 * via the Output panel, and keeps a bounded in-memory ring buffer so the
 * webview Debug-Info panel can display recent entries without leaving the view.
 */
class Logger {
  /**
   * @param {string} channelName  Name shown in the Output panel dropdown.
   * @param {number} bufferSize   Max entries kept in the ring buffer.
   */
  constructor(channelName = 'Control Panel', bufferSize = 200) {
    this._channel = vscode.window.createOutputChannel(channelName);
    this._buffer = [];
    this._bufferSize = bufferSize;
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */

  /** Log a debug-level message (verbose). */
  debug(message, ...args) {
    this._write('DEBUG', message, args);
  }

  /** Log an informational message. */
  info(message, ...args) {
    this._write('INFO', message, args);
  }

  /** Log a warning. */
  warn(message, ...args) {
    this._write('WARN', message, args);
  }

  /** Log an error. */
  error(message, ...args) {
    this._write('ERROR', message, args);
  }

  /** Reveal the Output panel and focus this channel. */
  show() {
    this._channel.show(true); // preserveFocus = true
  }

  /**
   * Return a shallow copy of the ring buffer (oldest → newest).
   * Each entry: { level, timestamp, message }
   */
  getBuffer() {
    return [...this._buffer];
  }

  /** Dispose the underlying OutputChannel (call on extension deactivation). */
  dispose() {
    this._channel.dispose();
  }

  /* ------------------------------------------------------------------ */
  /*  Internals                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * @param {'DEBUG'|'INFO'|'WARN'|'ERROR'} level
   * @param {string} message
   * @param {any[]}  extras
   */
  _write(level, message, extras) {
    const now = new Date();
    const ts = now.toISOString().replace('T', ' ').replace('Z', '');

    // Build a human-readable line
    let line = `[${ts}] [${level}] ${message}`;
    if (extras.length > 0) {
      const extraStr = extras
        .map(e => (e instanceof Error ? e.stack || e.message : typeof e === 'object' ? JSON.stringify(e) : String(e)))
        .join(' ');
      line += ' ' + extraStr;
    }

    // 1. VS Code Output channel (always)
    this._channel.appendLine(line);

    // 2. Console mirror (useful when debugging the extension itself)
    switch (level) {
      case 'ERROR':
        console.error(`[ControlPanel] ${message}`, ...extras);
        break;
      case 'WARN':
        console.warn(`[ControlPanel] ${message}`, ...extras);
        break;
      default:
        console.log(`[ControlPanel] ${message}`, ...extras);
        break;
    }

    // 3. Ring buffer for webview consumption
    this._buffer.push({ level, timestamp: ts, message });
    while (this._buffer.length > this._bufferSize) {
      this._buffer.shift();
    }
  }
}

module.exports = Logger;
