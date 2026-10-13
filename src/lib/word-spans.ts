/**
 * Making every word of a rendered markdown tree individually tappable.
 *
 * Pure and client-safe: no database, no `next/headers`, no React. It is a
 * rehype plugin, which is react-markdown's own extension point, and that is the
 * point — splitting the *text nodes* catches every word wherever it sits, inside
 * a bold run or a list item or a table cell, without this module having to know
 * which elements exist. Wrapping words in React instead would mean overriding
 * every text-bearing component and threading a counter through them, and would
 * silently miss any element nobody remembered to override.
 *
 * Indices are assigned in document order and are therefore stable for the same
 * markdown: the plugin runs again on every render, and the same text always
 * numbers the same way. Nothing is stored — a highlight is a transient marker
 * for where you are in a step, and it dies with the page.
 */

/**
 * The bits of a hast node this walker touches.
 *
 * Typed locally rather than pulled from `@types/hast`, which is not a
 * dependency — the three fields below are the whole surface in use.
 */
type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/**
 * Read back off the tapped element to know which word was hit.
 *
 * The plain-text renderer writes this attribute literally as `data-word=`,
 * because a computed JSX attribute name cannot be type-checked as a `data-*`
 * one. If this constant ever changes, that literal has to change with it.
 */
export const WORD_ATTRIBUTE = "data-word";

/**
 * Which single word is marked, anywhere in the method.
 *
 * One at a time by design, so it says "I am here" rather than accumulating into
 * a shapeless mess of highlights. `field` is part of the identity because a
 * step's title and its description number their words separately — both start
 * at zero.
 */
export type HighlightedWord = {
  stepId: string;
  field: "title" | "description";
  index: number;
} | null;

/**
 * Shared by every word, highlighted or not.
 *
 * `px-0.5 -mx-0.5` is the trick that gives a background a little room without
 * moving anything: the padding is cancelled by the negative margin, so word
 * spacing is identical to plain text and switching the highlight on and off
 * never reflows the paragraph.
 */
const WORD_BASE = "-mx-0.5 cursor-pointer rounded px-0.5 transition-colors";

/**
 * The resting state of a tappable word.
 *
 * The hover tint is the only thing advertising that words are tappable at all,
 * together with the pointer cursor. Tailwind's `hover:` is wrapped in
 * `@media (hover: hover)`, so a phone never gets a tint stuck under a thumb
 * after a tap.
 */
export const WORD_CLASS = `${WORD_BASE} hover:bg-muted`;

/**
 * Deliberately loud. The whole job of this is to be findable at a glance when
 * you look back at your phone mid-cook, so it is a highlighter pen rather than
 * a tasteful tint. The text colour is set explicitly because the background is
 * fixed in both themes and inheriting would make it unreadable in dark mode.
 *
 * It carries no `hover:` of its own, which is what keeps the two states from
 * fighting: hovering the marked word cannot grey out the orange, because there
 * is no rule to win against rather than a specificity battle to lose.
 */
export const HIGHLIGHT_CLASS = `${WORD_BASE} bg-orange-400 font-medium text-neutral-900`;

/**
 * Whitespace is kept exactly as it was, as its own text node, so splitting
 * changes nothing about how the text wraps or where spaces fall.
 */
const WHITESPACE_RUN = /(\s+)/;

/**
 * Left alone: splitting preformatted text would break the whitespace that is
 * the entire point of it, and a word inside a code span is not a place anyone
 * needs to mark.
 */
const LEAVE_ALONE = new Set(["pre", "code"]);

/**
 * Wraps each word in a `<span data-word="n">`, marking one of them highlighted.
 *
 * Pass it to react-markdown as `rehypePlugins={[[rehypeWordSpans, { ... }]]}`.
 * `highlighted` is the index to mark, or null for "none"; the spans are added
 * either way, because a word has to be tappable before it can be tapped.
 */
export function rehypeWordSpans(
  options: { highlighted?: number | null } = {},
) {
  return (tree: HastNode): void => {
    let nextIndex = 0;

    walk(tree);

    function walk(node: HastNode): void {
      if (!node.children) return;
      if (node.tagName && LEAVE_ALONE.has(node.tagName)) return;

      const rebuilt: HastNode[] = [];

      for (const child of node.children) {
        if (child.type === "text" && typeof child.value === "string") {
          rebuilt.push(...split(child.value));
        } else {
          walk(child);
          rebuilt.push(child);
        }
      }

      node.children = rebuilt;
    }

    function split(value: string): HastNode[] {
      return value
        .split(WHITESPACE_RUN)
        .filter((piece) => piece !== "")
        .map((piece) => {
          // Whitespace stays whitespace: only words become tap targets.
          if (!/\S/.test(piece)) {
            return { type: "text", value: piece };
          }

          const index = nextIndex++;

          return {
            type: "element",
            tagName: "span",
            properties: {
              [WORD_ATTRIBUTE]: String(index),
              className:
                index === options.highlighted ? HIGHLIGHT_CLASS : WORD_CLASS,
            },
            children: [{ type: "text", value: piece }],
          };
        });
    }
  };
}

/**
 * The same split for a plain string, for text that is not markdown.
 *
 * A step's title is one line with no formatting, so it needs the words numbered
 * without a markdown pipeline. Returns the pieces in order; whitespace comes
 * back with a null index so the caller can render it as-is.
 */
export function splitIntoWords(
  text: string,
): { text: string; index: number | null }[] {
  let nextIndex = 0;

  return text
    .split(WHITESPACE_RUN)
    .filter((piece) => piece !== "")
    .map((piece) =>
      /\S/.test(piece)
        ? { text: piece, index: nextIndex++ }
        : { text: piece, index: null },
    );
}
