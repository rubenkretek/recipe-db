import { z } from "zod";

import { INPUT_UNITS } from "@/lib/units";

/**
 * What the picker sends when you confirm it.
 *
 * Only identifiers: the quantity is recomputed server-side from the recipe and
 * the planned servings. The client never gets to state how much of something to
 * add, so a tampered request cannot put 900kg of anything on the list, and the
 * scaling goes through one path.
 */
export const addIngredientsSchema = z.object({
  selections: z
    .array(
      z.object({
        plannedRecipeId: z.uuid(),
        ingredientId: z.uuid(),
      }),
    )
    .min(1, "Nothing was ticked."),
});

export const itemIdSchema = z.object({
  itemId: z.uuid(),
});

export const setItemCheckedSchema = z.object({
  itemId: z.uuid(),
  isChecked: z.boolean(),
});

/**
 * A free-text item. SPEC.md §7: these have no quantity and no unit.
 *
 * "Birthday candles" is a perfectly good shopping list line and does not need
 * to become an ingredient in the library to be one.
 */
export const addManualItemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the item a name.")
    .max(200, "That name is too long."),
});

/**
 * Editing a quantity on the list.
 *
 * Entered in whatever unit suits and converted to base units server-side by the
 * same `toBase` the recipe editor uses. Both fields clear together: a quantity
 * without a unit is meaningless, and an item with neither reads as just its
 * name, which is what an unquantified line is.
 */
export const setItemQuantitySchema = z
  .object({
    itemId: z.uuid(),
    quantity: z.coerce
      .number()
      .positive("Use a quantity above zero.")
      .max(1_000_000, "That is a lot.")
      .nullable(),
    unit: z.enum(INPUT_UNITS as [string, ...string[]]).nullable(),
  })
  .refine(
    (value) =>
      (value.quantity === null && value.unit === null) ||
      (value.quantity !== null && value.unit !== null),
    { message: "Pick a unit for that quantity." },
  );

export const setItemSupermarketsSchema = z.object({
  itemId: z.uuid(),
  supermarketIds: z.array(z.uuid()),
});
