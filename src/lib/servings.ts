/**
 * Scaling a recipe's quantities to a different number of servings.
 * SPEC.md §6.2.
 *
 * Display only: nothing here is ever persisted on the recipe. The chosen
 * servings is stored on `meal_plan_recipes.servings` when a recipe goes onto a
 * plan (Phase 6), and that is what the shopping list scales by.
 *
 * Pure: no database access. One of the three modules CLAUDE.md requires tests for.
 */

import { UNITS } from "@/lib/units";

/** Rounds to at most `places` decimals. */
function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Rounds a count for the recipe view: to the nearest half.
 *
 * Half an onion is a real quantity in a recipe, so this keeps it. Anything
 * above zero stays above zero — a quarter of an onion rounds to a half, never
 * to nothing, because an ingredient that is needed must still be listed.
 * SPEC.md §6.2.
 */
export function roundCountForRecipe(count: number): number {
  if (count <= 0) return count;
  return Math.max(0.5, Math.round(count * 2) / 2);
}

/**
 * Rounds a count for the shopping list: up, to a whole number.
 *
 * You cannot buy 1.5 onions. This is deliberately different from the recipe
 * view, which is why they are two named functions rather than one with a flag.
 * SPEC.md §6.2 and CLAUDE.md "Gotchas".
 */
export function roundCountForShopping(count: number): number {
  return Math.ceil(count);
}

/**
 * Scales a stored quantity for the shopping list: raw, then rounded up.
 *
 * Deliberately NOT `roundCountForShopping(scaleQuantity(...))`. `scaleQuantity`
 * rounds counts to the nearest half for the recipe view, and rounding a second
 * time compounds the error downwards: a recipe for 5 using 6 eggs, planned for 1
 * serving, needs 1.2 eggs. Rounding to the nearest half gives 1.0, and the
 * ceiling of that is 1 — but you have to buy 2. Scaling raw and taking the
 * ceiling once gives 2.
 *
 * Weight and volume behave identically in both functions; only counts diverge.
 * SPEC.md §6.2.
 */
export function scaleQuantityForShopping(
  quantity: number | null,
  unit: string | null,
  baseServings: number,
  targetServings: number,
): number | null {
  if (quantity === null) {
    return null;
  }

  if (baseServings <= 0) {
    return quantity;
  }

  const scaled = quantity * (targetServings / baseServings);
  const definition = unit ? UNITS[unit] : undefined;

  if (definition?.dimension === "count") {
    return roundCountForShopping(scaled);
  }

  return round(scaled, 2);
}

/**
 * Scales a stored quantity from the recipe's base servings to a target.
 *
 * Weight and volume round to at most 2 decimal places. Counts round to the
 * nearest half, because that is what the recipe view wants; the shopping list
 * applies `roundCountForShopping` to the result instead when it adds items.
 *
 * A null quantity never scales: "salt, to taste" is still to taste however many
 * people are eating. SPEC.md §6.2.
 */
export function scaleQuantity(
  quantity: number | null,
  unit: string | null,
  baseServings: number,
  targetServings: number,
): number | null {
  if (quantity === null) {
    return null;
  }

  // A base of zero should be impossible — recipes.base_servings has a
  // `check (base_servings > 0)` — but dividing by it would produce Infinity,
  // so leave the quantity untouched rather than corrupting the display.
  if (baseServings <= 0) {
    return quantity;
  }

  const scaled = quantity * (targetServings / baseServings);
  const definition = unit ? UNITS[unit] : undefined;

  if (definition?.dimension === "count") {
    return roundCountForRecipe(scaled);
  }

  return round(scaled, 2);
}
