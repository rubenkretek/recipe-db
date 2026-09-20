/**
 * Turning an exported recipe file into values this app can store.
 *
 * The division of labour with the model matters. Everything here is
 * deterministic: fractions, units, markdown links, which parenthetical is a
 * second opinion about the quantity and which is part of the name. The model is
 * left only the genuinely ambiguous judgements — where the ingredient's name
 * ends and its preparation begins, what a numbered step should be called — and
 * whatever it returns is normalised back through these functions before it goes
 * anywhere near the database.
 *
 * Pure: no database, no network, no model. One of the modules CLAUDE.md
 * requires tests for, added for the file importer because a quantity that is
 * quietly wrong is the failure nobody notices until the shopping.
 */

import { UNITS } from "@/lib/units";

/**
 * Servings to assume when a file does not say.
 *
 * Deliberately 4, not the 2 the manual editor starts from: a recipe written
 * down without a serving count is almost always a family-sized one, and the
 * household's own recipes are the ones typed by hand.
 */
export const IMPORT_DEFAULT_SERVINGS = 4;

/** Longest a generated step title may run before it stops being a title. */
const MAX_DERIVED_TITLE = 60;

/** The vulgar fractions that turn up in recipes written for humans. */
const UNICODE_FRACTIONS: Record<string, number> = {
  "¼": 0.25,
  "½": 0.5,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅕": 0.2,
  "⅖": 0.4,
  "⅗": 0.6,
  "⅘": 0.8,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join("");

/**
 * Words that mean one of our units. SPEC.md §5.3 fixes the set of units; this
 * maps the ways a recipe writes them onto it.
 *
 * "tin" becomes `can` because the app has no tin and they are the same thing.
 * Anything absent here is not guessed at — see `normaliseUnit`.
 */
const UNIT_SYNONYMS: Record<string, string> = {
  g: "g", gram: "g", grams: "g", gramme: "g", grammes: "g",
  kg: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  ml: "ml", millilitre: "ml", millilitres: "ml", milliliter: "ml", milliliters: "ml",
  l: "l", litre: "l", litres: "l", liter: "l", liters: "l",
  tsp: "tsp", tsps: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  tbsp: "tbsp", tbsps: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
  cup: "cup", cups: "cup",
  piece: "piece", pieces: "piece",
  clove: "clove", cloves: "clove",
  bunch: "bunch", bunches: "bunch",
  pack: "pack", packs: "pack", packet: "pack", packets: "pack",
  can: "can", cans: "can", tin: "can", tins: "can",
  slice: "slice", slices: "slice",
  pinch: "pinch", pinches: "pinch",
};

/**
 * The canonical unit code for a word, or null if it is not a unit we store.
 *
 * Checked against `UNITS` rather than trusted, so a synonym pointing at a unit
 * that has since been removed returns null instead of producing a value that
 * would make `toBase()` throw on save.
 */
export function normaliseUnit(word: string): string | null {
  const key = word.trim().toLowerCase().replace(/\.$/, "");
  const code = UNIT_SYNONYMS[key];
  return code && UNITS[code] ? code : null;
}

/** Strips `[label](url)` down to `label`, and drops bare `<url>` autolinks. */
export function stripLinks(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<https?:\/\/[^>]*>/g, "");
}

/** Strips markdown bold and italic markers, keeping the words. */
export function stripEmphasis(text: string): string {
  return text.replace(/(\*\*|__|\*|_)(?=\S)([\s\S]*?\S)\1/g, "$2");
}

/** Links and emphasis gone, whitespace collapsed. The usual first move. */
export function cleanText(text: string): string {
  return stripEmphasis(stripLinks(text)).replace(/\s+/g, " ").trim();
}

/**
 * A single numeric token as a number: `2`, `0.5`, `1/2`, `1 1/2`, `½`, `1½`.
 *
 * Returns null for anything else, including the empty string.
 */
export function fractionToNumber(token: string): number | null {
  const text = token.trim();
  if (text === "") return null;

  // A whole number followed by a vulgar fraction: 1½.
  const glued = text.match(new RegExp(`^(\\d+)\\s*([${FRACTION_CHARS}])$`));
  if (glued) {
    return Number(glued[1]) + UNICODE_FRACTIONS[glued[2]];
  }

  if (UNICODE_FRACTIONS[text] !== undefined) {
    return UNICODE_FRACTIONS[text];
  }

  // A whole number and a written fraction: 1 1/2.
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const denominator = Number(mixed[3]);
    return denominator === 0
      ? null
      : Number(mixed[1]) + Number(mixed[2]) / denominator;
  }

  const simple = text.match(/^(\d+)\/(\d+)$/);
  if (simple) {
    const denominator = Number(simple[2]);
    return denominator === 0 ? null : Number(simple[1]) / denominator;
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    return Number(text);
  }

  return null;
}

/** A quantity token, optionally with the unit that followed it. */
export type LeadingQuantity = {
  quantity: number | null;
  unit: string | null;
  /** What is left of the line once the quantity and unit are taken off. */
  rest: string;
};

const QUANTITY_TOKEN = `(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+\\s*[${FRACTION_CHARS}]|[${FRACTION_CHARS}]|\\d+(?:\\.\\d+)?)`;

/**
 * Reads a quantity, and any unit, off the front of an ingredient line.
 *
 * A line that starts with a word — "Sprinkle of kosher salt" — has no quantity,
 * and says so with nulls rather than being made up. A range takes its **lower**
 * bound: "1-2 chillies" becomes 1, because you can always add the second.
 *
 * The unit is only taken when the word after the number is one we store. In
 * "2 star anise" the number stands alone and `anise` stays in the text, which
 * is what lets the model call it 2 pieces rather than 2 anise.
 */
export function parseLeadingQuantity(line: string): LeadingQuantity {
  const text = line.trim();

  const match = text.match(
    new RegExp(
      `^(?:~|about|approx\\.?|approximately)?\\s*(${QUANTITY_TOKEN})` +
        `(?:\\s*(?:-|–|—|to)\\s*${QUANTITY_TOKEN})?` +
        `\\s*(.*)$`,
      "i",
    ),
  );

  if (!match) {
    return { quantity: null, unit: null, rest: text };
  }

  const quantity = fractionToNumber(match[1]);
  if (quantity === null) {
    return { quantity: null, unit: null, rest: text };
  }

  const remainder = match[2] ?? "";
  const unitMatch = remainder.match(/^([A-Za-z.]+)(\s+[\s\S]*|$)/);
  const unit = unitMatch ? normaliseUnit(unitMatch[1]) : null;

  return {
    quantity,
    unit,
    rest: (unit ? (unitMatch?.[2] ?? "") : remainder).trim(),
  };
}

/**
 * Removes a parenthetical that only restates the quantity in another unit.
 *
 * "225 g (1/2 lb) ground beef" loses the pound; "12 curry leaves (optional)",
 * "red lentils (dried)" and "water (as needed)" keep theirs, because those say
 * something the quantity does not. The rule is exact: the brackets go only when
 * everything inside them is a number and a unit we recognise.
 */
export function stripUnitParenthetical(line: string): string {
  return line
    .replace(/\(([^)]*)\)/g, (whole, inner: string) => {
      const parsed = parseLeadingQuantity(inner.trim());
      const isOnlyQuantity =
        parsed.quantity !== null && parsed.unit !== null && parsed.rest === "";
      return isOnlyQuantity ? "" : whole;
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Splits a method paragraph into a title and the detail underneath it.
 *
 * Three shapes turn up. "Sear the beef: add the mince…" names itself, so the
 * label becomes the title. A paragraph short enough to read as a title becomes
 * one, with no description. Anything longer keeps its whole text as the
 * description and gets a title made from its first sentence — which is what a
 * file numbering its steps "## 1" needs, since the number is not a title.
 */
export function deriveStepTitle(text: string): {
  title: string;
  description: string | null;
} {
  const cleaned = cleanText(text);
  if (cleaned === "") {
    return { title: "", description: null };
  }

  const labelled = cleaned.match(/^([A-Z][^.:!?]{2,60}):\s+(\S[\s\S]*)$/);
  if (labelled) {
    return { title: labelled[1].trim(), description: labelled[2].trim() };
  }

  if (cleaned.length <= MAX_DERIVED_TITLE) {
    return { title: cleaned.replace(/[.]$/, ""), description: null };
  }

  const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned;
  const candidate =
    firstSentence.length <= MAX_DERIVED_TITLE
      ? firstSentence
      : firstSentence.slice(0, MAX_DERIVED_TITLE).replace(/\s+\S*$/, "");

  return {
    title: candidate.replace(/[.,;:]$/, "").trim(),
    description: cleaned,
  };
}

/**
 * Whether a line is one of the fields an export puts above the recipe.
 *
 * Only meaningful in the preamble: "Sear the beef: …" in the method has exactly
 * the same shape, which is why `unclaimedLines` stops applying this the moment
 * a section heading appears.
 *
 * The key may start with a digit — "2025 Reviewed: Yes" is one of these, and
 * requiring a letter first left it looking like content and reported as a line
 * the import had missed.
 */
export function isMetadataLine(line: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9 ()\-']{0,40}:\s*\S/.test(line.trim());
}

/** Words too common to prove a line was read. */
const STOP_WORDS = new Set([
  "with", "and", "the", "into", "from", "until", "over", "then", "your",
  "that", "this", "some", "about", "they", "them", "when", "made", "make",
]);

/**
 * The lines of the file that nothing in the draft accounts for.
 *
 * The mechanical half of checking the model did not skip anything: every line
 * that is not blank, a heading, or preamble metadata should have left some
 * trace in the draft. A line counts as read when **any** of its distinctive
 * words turns up in the draft, which is deliberately forgiving — it is looking
 * for a line dropped whole, not for wording differences. Matching on the
 * longest word instead would report "Sprinkle of kosher salt" as missed on a
 * draft that imported it perfectly as kosher salt, and a check that cries wolf
 * is one people stop reading.
 */
export function unclaimedLines(source: string, claimed: string[]): string[] {
  const haystack = claimed
    .join("   ")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ");

  const unclaimed: string[] = [];
  let seenSection = false;

  for (const raw of source.split(/\r?\n/)) {
    const line = cleanText(raw);
    if (line === "") continue;

    if (/^#{1,6}\s/.test(raw.trim())) {
      // Only a section heading ends the preamble. The file's title is a
      // heading too, and treating it as one would leave the metadata fields
      // underneath it looking like content and reported as missed.
      if (/^#{2,6}\s/.test(raw.trim())) seenSection = true;
      continue;
    }

    // Preamble fields are accounted for elsewhere: tags and the link are read
    // directly, and the rest are deliberately dropped.
    if (!seenSection && isMetadataLine(line)) continue;

    const words = line
      .toLowerCase()
      .replace(/[^a-z\s]+/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4 && !STOP_WORDS.has(word));

    // Nothing distinctive to look for — a line of digits or stop words alone.
    if (words.length === 0) continue;

    if (!words.some((word) => haystack.includes(word))) {
      unclaimed.push(line);
    }
  }

  return unclaimed;
}

/** How an imported ingredient name lines up with the kitchen's own list. */
export type IngredientMatch =
  | { status: "matched"; ingredientId: string; name: string }
  | { status: "suggested"; ingredientId: string; name: string; score: number }
  | { status: "new" };

/** Lowercase, letters and digits only, crudely singular. For comparison only. */
function comparable(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));
}

/** Overlap of two word sets, 0 to 1. */
function similarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const left = new Set(a);
  const right = new Set(b);
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / new Set([...left, ...right]).size;
}

/** Below this, a near match is not worth offering. */
const SUGGESTION_THRESHOLD = 0.5;

/**
 * Matches an imported ingredient name against the kitchen's ingredients.
 *
 * Exact names and recorded aliases are taken as certain. Anything else is only
 * ever a *suggestion* the user confirms, never an automatic link: silently
 * folding "red lentils (dried)" into "red lentils" would be right most of the
 * time and wrong in a way nobody would ever spot. Below the threshold it is
 * reported as new, which sends it to the confirm-the-name step.
 */
export function matchIngredientName(
  name: string,
  existing: { id: string; name: string }[],
  aliases: { ingredientId: string; alias: string }[] = [],
): IngredientMatch {
  const wanted = name.trim().toLowerCase();

  const exact = existing.find(
    (ingredient) => ingredient.name.trim().toLowerCase() === wanted,
  );
  if (exact) {
    return { status: "matched", ingredientId: exact.id, name: exact.name };
  }

  const alias = aliases.find((row) => row.alias.trim().toLowerCase() === wanted);
  if (alias) {
    const target = existing.find(
      (ingredient) => ingredient.id === alias.ingredientId,
    );
    if (target) {
      return { status: "matched", ingredientId: target.id, name: target.name };
    }
  }

  const words = comparable(name);
  let best: { ingredient: { id: string; name: string }; score: number } | null =
    null;

  for (const ingredient of existing) {
    const score = similarity(words, comparable(ingredient.name));
    if (!best || score > best.score) {
      best = { ingredient, score };
    }
  }

  if (best && best.score >= SUGGESTION_THRESHOLD) {
    return {
      status: "suggested",
      ingredientId: best.ingredient.id,
      name: best.ingredient.name,
      score: best.score,
    };
  }

  return { status: "new" };
}
