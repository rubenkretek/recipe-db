/**
 * Units, conversion and display. SPEC.md §5.3 and §6.1.
 *
 * The database stores a number and a unit string and never interprets either.
 * Everything about what a unit *means* lives here, and runs on the client.
 *
 * Pure: no database access, no imports. One of the three modules CLAUDE.md
 * requires tests for.
 */

export type Dimension = "weight" | "volume" | "count";

export type UnitDefinition = {
  dimension: Dimension;
  /** Multiply by this to reach the base unit of the dimension. */
  toBase: number;
  /** The base unit this converts into: 'g', 'ml', or the count unit itself. */
  base: string;
  singular: string;
  plural: string;
  /**
   * Whether a space sits between the number and the label.
   *
   * "250g" and "200ml" are flush; "2 tbsp" and "3 cloves" are spaced. This is a
   * fact about each unit rather than about its dimension — tbsp and cup are
   * volumes but read as words, not symbols — so it lives here as data.
   * SPEC.md §5.3 and §8 Phase 4 acceptance criterion 2.
   */
  spaced: boolean;
  /** Offered in the editor's unit picker. */
  isInput: boolean;
};

/**
 * Every unit the app understands. SPEC.md §5.3.
 *
 * Plurals are spelled out rather than derived, because `bunch` and `pinch` take
 * `-es` while the rest take `-s`, and a lookup is shorter than the rule.
 */
export const UNITS: Record<string, UnitDefinition> = {
  // Weight. Base is grams.
  g: { dimension: "weight", toBase: 1, base: "g", singular: "g", plural: "g", spaced: false, isInput: true },
  kg: { dimension: "weight", toBase: 1000, base: "g", singular: "kg", plural: "kg", spaced: false, isInput: true },
  oz: { dimension: "weight", toBase: 28.3495, base: "g", singular: "oz", plural: "oz", spaced: false, isInput: true },
  lb: { dimension: "weight", toBase: 453.592, base: "g", singular: "lb", plural: "lb", spaced: false, isInput: true },

  // Volume. Base is millilitres.
  ml: { dimension: "volume", toBase: 1, base: "ml", singular: "ml", plural: "ml", spaced: false, isInput: true },
  l: { dimension: "volume", toBase: 1000, base: "ml", singular: "l", plural: "l", spaced: false, isInput: true },
  tsp: { dimension: "volume", toBase: 5, base: "ml", singular: "tsp", plural: "tsp", spaced: true, isInput: true },
  tbsp: { dimension: "volume", toBase: 15, base: "ml", singular: "tbsp", plural: "tbsp", spaced: true, isInput: true },
  cup: { dimension: "volume", toBase: 240, base: "ml", singular: "cup", plural: "cups", spaced: true, isInput: true },

  // Counts. Each is its own base: two cloves and two pieces of garlic are not
  // four of anything, so these never interconvert. SPEC.md §5.3.
  piece: { dimension: "count", toBase: 1, base: "piece", singular: "piece", plural: "pieces", spaced: true, isInput: true },
  clove: { dimension: "count", toBase: 1, base: "clove", singular: "clove", plural: "cloves", spaced: true, isInput: true },
  bunch: { dimension: "count", toBase: 1, base: "bunch", singular: "bunch", plural: "bunches", spaced: true, isInput: true },
  pack: { dimension: "count", toBase: 1, base: "pack", singular: "pack", plural: "packs", spaced: true, isInput: true },
  can: { dimension: "count", toBase: 1, base: "can", singular: "can", plural: "cans", spaced: true, isInput: true },
  slice: { dimension: "count", toBase: 1, base: "slice", singular: "slice", plural: "slices", spaced: true, isInput: true },
  pinch: { dimension: "count", toBase: 1, base: "pinch", singular: "pinch", plural: "pinches", spaced: true, isInput: true },
};

/** Unit codes offered in the editor's picker, in the order SPEC.md §5.3 lists them. */
export const INPUT_UNITS: string[] = Object.keys(UNITS).filter(
  (code) => UNITS[code].isInput,
);

/** The count units, for grouping the unit picker. */
export const COUNT_UNITS: string[] = INPUT_UNITS.filter(
  (code) => UNITS[code].dimension === "count",
);

/**
 * How close a converted value must be to a 2-decimal-place number before we
 * call the conversion "clean" and honour `display_unit`. SPEC.md §5.3 leaves
 * this undefined; this is the working definition. See `formatQuantity`.
 */
const CLEAN_CONVERSION_TOLERANCE = 0.001;

/** Rounds to at most `places` decimals, without leaving trailing zeros. */
function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** Formats a number with at most 2 decimals and no trailing zeros: 1.50 -> "1.5". */
function trim(value: number): string {
  return String(round(value, 2));
}

/**
 * Converts an entered quantity into the base unit for its dimension.
 *
 * Used on save, so the database only ever holds grams, millilitres or a count.
 * A null quantity stays null and loses its unit with it, because an
 * unquantified ingredient has neither. SPEC.md §5.3.
 *
 * Throws on an unrecognised unit rather than guessing: SPEC.md §6.1 is explicit
 * that the editor should ask rather than fuzzy-match.
 */
export function toBase(
  quantity: number | null,
  inputUnit: string | null,
): { quantity: number | null; unit: string | null } {
  if (quantity === null) {
    return { quantity: null, unit: null };
  }

  const definition = inputUnit ? UNITS[inputUnit] : undefined;
  if (!definition) {
    throw new Error(`Unknown unit: ${inputUnit}`);
  }

  return {
    // Rounded because 1 lb is 453.592g and floating point will otherwise leave
    // 453.59200000000004 in the database.
    quantity: round(quantity * definition.toBase, 4),
    unit: definition.base,
  };
}

/**
 * Renders a stored quantity for display. SPEC.md §5.3.
 *
 * - Weight at or above 1000g becomes kilograms, volume likewise litres, both to
 *   at most 2 decimal places with trailing zeros trimmed.
 * - A count is the number then the unit, pluralised unless it is exactly 1.
 *   `piece` is omitted entirely, so the caller can render "2 onions" by
 *   appending the pluralised ingredient name.
 * - A null quantity renders as nothing, leaving just the name and note.
 *
 * `displayUnit` records how the quantity was originally entered, so a recipe
 * written as "2 tbsp" still reads as "2 tbsp" rather than "30ml". It is
 * advisory: it is honoured only when the stored value converts back to a clean
 * 2-decimal number, so 30ml as tbsp gives "2 tbsp" but 100g as oz would give
 * 3.5274oz and falls back to "100g". This also means a scaled quantity can drop
 * back to base units mid-scale, which is correct but surprising.
 */
export function formatQuantity(
  quantity: number | null,
  unit: string | null,
  displayUnit?: string | null,
): string {
  if (quantity === null) {
    return "";
  }

  const stored = unit ? UNITS[unit] : undefined;
  if (!stored) {
    return trim(quantity);
  }

  const preferred = preferredUnit(quantity, stored, displayUnit);
  if (preferred) {
    return render(preferred.value, preferred.definition);
  }

  // No usable display unit: apply the default rule for the dimension.
  if (stored.dimension === "count") {
    return render(quantity, stored);
  }

  if (quantity >= 1000) {
    const larger = stored.dimension === "weight" ? UNITS.kg : UNITS.l;
    return render(quantity / larger.toBase, larger);
  }

  return render(quantity, stored);
}

/**
 * Works out whether `displayUnit` can be honoured for this value.
 *
 * Returns the converted value and its definition when the conversion is clean,
 * or null to fall back to the default display rule.
 */
function preferredUnit(
  quantity: number,
  stored: UnitDefinition,
  displayUnit?: string | null,
): { value: number; definition: UnitDefinition } | null {
  if (!displayUnit) return null;

  const definition = UNITS[displayUnit];
  if (!definition) return null;

  // A tablespoon cannot display a weight.
  if (definition.dimension !== stored.dimension) return null;
  if (definition.base !== stored.base) return null;

  const value = quantity / definition.toBase;
  if (Math.abs(value - round(value, 2)) > CLEAN_CONVERSION_TOLERANCE) {
    return null;
  }

  return { value: round(value, 2), definition };
}

/** Joins a number to its unit, pluralising and omitting `piece`. */
function render(value: number, definition: UnitDefinition): string {
  const rounded = round(value, 2);
  const label = rounded === 1 ? definition.singular : definition.plural;

  // "2 piece onion" must read "2 onions": the unit disappears and the caller
  // appends the pluralised name. SPEC.md §5.3.
  if (definition.base === "piece") {
    return trim(rounded);
  }

  const separator = definition.spaced ? " " : "";
  return `${trim(rounded)}${separator}${label}`;
}

/**
 * Whether two quantities may be summed.
 *
 * The whole rule is that their unit strings are identical, and because
 * everything is normalised on the way in, grams always meet grams. Two nulls
 * also merge, and stay null. SPEC.md §5.3 and §6.3.
 *
 * Exists as a named function rather than an inline `===` so the intent is
 * documented at every call site. CLAUDE.md "Units and quantities".
 */
export function canMerge(unitA: string | null, unitB: string | null): boolean {
  return unitA === unitB;
}

/**
 * Pluralises an ingredient name for display alongside a `piece` count.
 *
 * SPEC.md §5.3 wants "2 piece onion" to read "2 onions", which means
 * pluralising the ingredient name — something `formatQuantity` cannot do,
 * because it is never given the name.
 *
 * Best effort, and deliberately so. It handles the common English rules and
 * gets irregulars wrong: "leaf" becomes "leafs". The fix for those is to name
 * the ingredient in its plural form, "bay leaves", which reads correctly at
 * every count anyway.
 */
export function pluraliseName(name: string, count: number): string {
  if (count === 1) return name;

  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  // Already plural, or a mass noun that never takes one.
  if (lower.endsWith("s") && !lower.endsWith("ss")) return trimmed;

  if (/[^aeiou]y$/i.test(trimmed)) {
    return `${trimmed.slice(0, -1)}ies`;
  }

  if (/(s|x|ch|sh|ss)$/i.test(trimmed)) {
    return `${trimmed}es`;
  }

  return `${trimmed}s`;
}
