import { z } from "zod";

import { INPUT_UNITS } from "@/lib/units";

/**
 * An ingredient name, as typed. Trimmed but not lower-cased: the name keeps the
 * capitalisation the author used, while the unique index on
 * `(kitchen_id, lower(name))` stops a second row differing only in case.
 */
const ingredientName = z
  .string()
  .trim()
  .min(1, "Give the ingredient a name.")
  .max(80, "That name is too long.");

export const createIngredientSchema = z.object({
  name: ingredientName,
});

export const renameIngredientSchema = z.object({
  ingredientId: z.uuid(),
  name: ingredientName,
});

export const ingredientIdSchema = z.object({
  ingredientId: z.uuid(),
});

/**
 * A unit the editor offers. Validated against the same `UNITS` table the
 * conversion uses, so a unit that would make `toBase()` throw cannot be stored.
 */
const unitCode = z.enum(INPUT_UNITS as [string, ...string[]]);

export const setDefaultUnitSchema = z.object({
  ingredientId: z.uuid(),
  // Null clears it, so the editor stops prefilling.
  defaultUnit: unitCode.nullable(),
});

export const mergeIngredientsSchema = z
  .object({
    sourceId: z.uuid(),
    targetId: z.uuid(),
  })
  .refine((value) => value.sourceId !== value.targetId, {
    message: "Pick two different ingredients.",
  });

/**
 * One line of a recipe's ingredient list, as the form holds it.
 *
 * `quantity` and `unit` are entered in whatever unit suits — `1` and `kg` — and
 * converted to base units by `toBase()` in the server action. The database only
 * ever sees grams, millilitres or a count. SPEC.md §5.3.
 *
 * An empty quantity means "to taste": both the quantity and the unit end up
 * null, which is what the check constraint on `recipe_ingredients` requires.
 */
export const recipeIngredientSchema = z.object({
  ingredientId: z.uuid("Pick an ingredient."),
  quantity: z
    .union([z.number(), z.nan()])
    .nullable()
    .transform((value) =>
      value === null || Number.isNaN(value) ? null : value,
    )
    .refine((value) => value === null || value >= 0, {
      message: "A quantity cannot be negative.",
    }),
  unit: unitCode.nullable(),
  note: z
    .string()
    .trim()
    .max(120, "That note is too long.")
    .transform((value) => (value === "" ? null : value))
    .nullable(),
});

export type RecipeIngredientInput = z.input<typeof recipeIngredientSchema>;
export type RecipeIngredientValues = z.output<typeof recipeIngredientSchema>;
export type RenameIngredientInput = z.infer<typeof renameIngredientSchema>;
export type MergeIngredientsInput = z.infer<typeof mergeIngredientsSchema>;
