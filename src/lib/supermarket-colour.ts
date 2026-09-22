/**
 * Painting a surface in a supermarket's colour.
 *
 * Pure and client-safe: no database, no `next/headers`. Lives here rather than
 * beside either component that uses it, because both the ingredients grid and
 * the shopping screen's chips need the same rules and a second copy would drift.
 *
 * Every function takes a nullable colour and copes with null, because a shop
 * without one is a supported state — see the migration that added the column.
 */

/** How strongly a colour fills a surface that means "yes, this one". */
export const ASSIGNED_TINT = 80;

/** And one that means "no, but this is still that shop's column". */
export const UNASSIGNED_TINT = 50;

/**
 * A shop's colour at the given strength, or undefined when it has none.
 *
 * `color-mix` rather than parsing the hex into rgba: the browser does the
 * arithmetic. Undefined leaves the element with no inline background at all,
 * which is what a colourless shop falls back to.
 */
export function tintFor(
  colour: string | null,
  percent: number,
): string | undefined {
  if (!colour) return undefined;
  return `color-mix(in srgb, ${colour} ${percent}%, transparent)`;
}

/**
 * Near-black or near-white, whichever can actually be read on `colour`.
 *
 * Only meaningful over the colour at full strength — a tint is transparent, so
 * what shows through is the page behind it rather than this colour. The
 * household picks these hex codes by hand with no contrast check, so without
 * this a dark navy chip gets dark text and becomes unreadable.
 *
 * The 0.179 threshold is the luminance at which white and black text have equal
 * contrast under WCAG, not an eyeballed midpoint.
 */
export function readableTextOn(colour: string | null): string | undefined {
  if (!colour) return undefined;

  const hex = colour.replace("#", "");
  if (hex.length !== 6) return undefined;

  const channels = [0, 2, 4].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  const luminance =
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];

  return luminance > 0.179 ? "#111111" : "#ffffff";
}
