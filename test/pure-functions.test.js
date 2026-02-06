/**
 * Tests for pure functions that require no mocks:
 *   - MdxWebviewProvider.getAverageDuration()
 *   - MdxWebviewProvider.parseMdxContent()
 */

const assert = require('assert');
const { createProvider } = require('./helpers/provider-factory');
const {
  SIMPLE_MDX,
  MDX_WITH_TASK_LINK,
  MDX_WITH_TASK_LIST,
  MDX_MIXED,
  MDX_EMPTY,
  MDX_NO_COMPONENTS,
} = require('./fixtures/sample-mdx');

suite('Pure Function Tests', () => {
  let provider;

  suiteSetup(() => {
    ({ provider } = createProvider());
  });

  // -----------------------------------------------------------------------
  //  getAverageDuration
  // -----------------------------------------------------------------------
  suite('getAverageDuration', () => {
    test('returns null for empty array', () => {
      assert.strictEqual(provider.getAverageDuration([]), null);
    });

    test('returns the single value for a one-element array', () => {
      assert.strictEqual(provider.getAverageDuration([42]), 42);
    });

    test('computes arithmetic mean of multiple values', () => {
      assert.strictEqual(provider.getAverageDuration([10, 20, 30]), 20);
    });

    test('handles floating-point results', () => {
      const avg = provider.getAverageDuration([1, 2]);
      assert.strictEqual(avg, 1.5);
    });

    test('handles large numbers', () => {
      const vals = [1000000, 2000000, 3000000];
      assert.strictEqual(provider.getAverageDuration(vals), 2000000);
    });

    test('handles zero values', () => {
      assert.strictEqual(provider.getAverageDuration([0, 0, 0]), 0);
    });
  });

  // -----------------------------------------------------------------------
  //  parseMdxContent
  // -----------------------------------------------------------------------
  suite('parseMdxContent', () => {
    test('returns empty array for empty string', () => {
      const blocks = provider.parseMdxContent(MDX_EMPTY);
      assert.deepStrictEqual(blocks, []);
    });

    test('returns a single text block for plain markdown', () => {
      const blocks = provider.parseMdxContent(MDX_NO_COMPONENTS);
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].type, 'text');
      assert.ok(blocks[0].content.includes('Plain Markdown'));
    });

    test('extracts TaskLink components', () => {
      const blocks = provider.parseMdxContent(MDX_WITH_TASK_LINK);
      const taskLinks = blocks.filter(b => b.type === 'TaskLink');
      assert.strictEqual(taskLinks.length, 1);
      assert.strictEqual(taskLinks[0].label, 'build:all');
    });

    test('preserves text around TaskLink', () => {
      const blocks = provider.parseMdxContent(MDX_WITH_TASK_LINK);
      const textBlocks = blocks.filter(b => b.type === 'text');
      assert.ok(textBlocks.length >= 1);
      // First text block should contain the heading
      assert.ok(textBlocks[0].content.includes('Build Guide'));
    });

    test('extracts TaskList components with labelStartsWith', () => {
      const blocks = provider.parseMdxContent(MDX_WITH_TASK_LIST);
      const taskLists = blocks.filter(b => b.type === 'TaskList');
      assert.strictEqual(taskLists.length, 2);
      assert.strictEqual(taskLists[0].labelStartsWith, 'build:');
      assert.strictEqual(taskLists[1].labelStartsWith, 'test:');
    });

    test('handles mixed content with TaskLink and TaskList', () => {
      const blocks = provider.parseMdxContent(MDX_MIXED);
      const taskLinks = blocks.filter(b => b.type === 'TaskLink');
      const taskLists = blocks.filter(b => b.type === 'TaskList');
      const textBlocks = blocks.filter(b => b.type === 'text');

      assert.strictEqual(taskLinks.length, 2);
      assert.strictEqual(taskLists.length, 1);
      assert.ok(textBlocks.length >= 1);

      assert.strictEqual(taskLinks[0].label, 'build:dev');
      assert.strictEqual(taskLinks[1].label, 'test:unit');
      assert.strictEqual(taskLists[0].labelStartsWith, 'build:');
    });

    test('simple MDX produces a single text block', () => {
      const blocks = provider.parseMdxContent(SIMPLE_MDX);
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].type, 'text');
      assert.ok(blocks[0].content.includes('Hello World'));
    });
  });
});
