/**
 * Tests for src/Logger.js
 */

const assert = require('assert');
const { createLogger } = require('./helpers/provider-factory');

suite('Logger Tests', () => {
  let logger;

  setup(() => {
    logger = createLogger('TestChannel', 10); // small buffer for easy cap testing
  });

  teardown(() => {
    logger.dispose();
  });

  // -----------------------------------------------------------------------
  //  Basic logging methods
  // -----------------------------------------------------------------------
  suite('Logging methods', () => {
    test('info() writes to the output channel', () => {
      logger.info('hello');
      const channel = logger._channel;
      assert.strictEqual(channel._lines.length, 1);
      assert.ok(channel._lines[0].includes('[INFO]'));
      assert.ok(channel._lines[0].includes('hello'));
    });

    test('debug() writes DEBUG level', () => {
      logger.debug('dbg message');
      assert.ok(logger._channel._lines[0].includes('[DEBUG]'));
    });

    test('warn() writes WARN level', () => {
      logger.warn('warning');
      assert.ok(logger._channel._lines[0].includes('[WARN]'));
    });

    test('error() writes ERROR level', () => {
      logger.error('failure');
      assert.ok(logger._channel._lines[0].includes('[ERROR]'));
    });

    test('extra arguments are appended to the log line', () => {
      logger.info('msg', 'extra1', 42);
      const line = logger._channel._lines[0];
      assert.ok(line.includes('extra1'));
      assert.ok(line.includes('42'));
    });

    test('Error objects are logged with stack trace', () => {
      const err = new Error('boom');
      logger.error('failed', err);
      const line = logger._channel._lines[0];
      assert.ok(line.includes('boom'));
    });

    test('object extras are JSON-stringified', () => {
      logger.info('data', { key: 'value' });
      const line = logger._channel._lines[0];
      assert.ok(line.includes('"key"'));
      assert.ok(line.includes('"value"'));
    });
  });

  // -----------------------------------------------------------------------
  //  Ring buffer
  // -----------------------------------------------------------------------
  suite('Ring buffer', () => {
    test('getBuffer returns logged entries', () => {
      logger.info('first');
      logger.warn('second');
      const buf = logger.getBuffer();
      assert.strictEqual(buf.length, 2);
      assert.strictEqual(buf[0].level, 'INFO');
      assert.strictEqual(buf[1].level, 'WARN');
    });

    test('buffer entries include timestamp and message', () => {
      logger.info('timestamped');
      const entry = logger.getBuffer()[0];
      assert.ok(entry.timestamp);
      assert.ok(entry.message.includes('timestamped'));
    });

    test('buffer is capped at bufferSize', () => {
      for (let i = 0; i < 15; i++) {
        logger.info(`msg-${i}`);
      }
      const buf = logger.getBuffer();
      assert.strictEqual(buf.length, 10); // bufferSize = 10
    });

    test('oldest entries are evicted when buffer overflows', () => {
      for (let i = 0; i < 12; i++) {
        logger.info(`msg-${i}`);
      }
      const buf = logger.getBuffer();
      // First entry should be msg-2 (indices 0 and 1 evicted)
      assert.ok(buf[0].message.includes('msg-2'));
    });

    test('getBuffer returns a shallow copy', () => {
      logger.info('original');
      const buf1 = logger.getBuffer();
      buf1.push({ level: 'FAKE', message: 'injected' });
      const buf2 = logger.getBuffer();
      assert.strictEqual(buf2.length, 1); // not affected by push
    });
  });

  // -----------------------------------------------------------------------
  //  show / dispose
  // -----------------------------------------------------------------------
  suite('show and dispose', () => {
    test('show() reveals the output channel with preserveFocus', () => {
      logger.show();
      assert.strictEqual(logger._channel._shown, true);
      assert.strictEqual(logger._channel._preserveFocus, true);
    });

    test('dispose() disposes the output channel', () => {
      logger.dispose();
      assert.strictEqual(logger._channel._disposed, true);
    });
  });
});
