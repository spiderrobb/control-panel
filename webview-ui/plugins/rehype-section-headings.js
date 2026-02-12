/**
 * rehype-section-headings
 *
 * A rehype plugin that wraps each heading and its following content in a flat
 * <section> element. Every heading starts a new section at the same level —
 * no nesting. Combined with `position: sticky; top: 0` on headings, this gives
 * "replace" behavior: each heading sticks at the top until the next heading
 * scrolls up and pushes it away.
 *
 * Input (flat HAST):
 *   <h1>Title</h1> <p>…</p> <h2>Sub</h2> <p>…</p> <h2>Sub2</h2> …
 *
 * Output (flat sections):
 *   <section class="heading-section">
 *     <h1>Title</h1> <p>…</p>
 *   </section>
 *   <section class="heading-section">
 *     <h2>Sub</h2> <p>…</p>
 *   </section>
 *   <section class="heading-section">
 *     <h2>Sub2</h2> …
 *   </section>
 */

function isHeading(node) {
  if (node.type !== 'element') return false;
  return /^h[1-6]$/i.test(node.tagName);
}

export default function rehypeSectionHeadings() {
  return (tree) => {
    const children = tree.children;
    const result = [];
    let currentSection = null;

    for (const node of children) {
      if (isHeading(node)) {
        // Close previous section if any
        if (currentSection) {
          result.push(currentSection);
        }
        // Start a new section with this heading
        currentSection = {
          type: 'element',
          tagName: 'section',
          properties: { className: ['heading-section'] },
          children: [node],
        };
      } else if (currentSection) {
        // Content after a heading — add to current section
        currentSection.children.push(node);
      } else {
        // Content before the first heading — pass through
        result.push(node);
      }
    }

    // Don't forget the last section
    if (currentSection) {
      result.push(currentSection);
    }

    tree.children = result;
  };
}
