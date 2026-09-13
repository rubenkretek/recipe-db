import { z } from "zod";

import { groupNamesForRows } from "@/lib/ingredient-groups";
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
 * One row of the recipe form's ingredient list: an ingredient, or a heading.
 *
 * Headings are rows in the editor so the list stays a single sortable list — an
 * ingredient belongs to the nearest heading above it, and dragging it past a
 * heading moves it into that group. In the database there are no heading rows:
 * the transform on `recipeIngredientRowsSchema` turns each heading into the
 * `group_name` of the lines below it.
 *
 * Every row carries every field so the form has one shape; a heading row simply
 * ignores the ingredient fields, and an ingredient row ignores `heading`.
 *
 * `quantity` and `unit` are entered in whatever unit suits — `1` and `kg` — and
 * converted to base units by `toBase()` in the server action. The database only
 * ever sees grams, millilitres or a count. SPEC.md §5.3.
 *
 * An empty quantity means "to taste": both the quantity and the unit end up
 * null, which is what the check constraint on `recipe_ingredients` requires.
 */
const recipeIngredientRowSchema = z.object({
  kind: z.enum(["ingredient", "heading"]),
  heading: z.string().trim().max(80, "That heading is too long."),
  // Checked per kind below: a heading row has no ingredient.
  ingredientId: z.string(),
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

/** What an editor row looks like before anything is filled in. */
export const BLANK_INGREDIENT_ROW = {
  kind: "ingredient" as const,
  heading: "",
  ingredientId: "",
  quantity: null,
  unit: null,
  note: null,
};

/**
 * The whole ingredient list as the form holds it, and the lines it saves as.
 *
 * Output is the stored shape: ingredient lines only, each with the `groupName`
 * of the heading above it. Heading rows disappear, and so does any heading with
 * no ingredients under it — there is nothing to store it on. SPEC.md §5.5.
 */
export const recipeIngredientRowsSchema = z
  .array(recipeIngredientRowSchema)
  .default([])
  .superRefine((rows, context) => {
    rows.forEach((row, index) => {
      if (row.kind === "ingredient" && !z.uuid().safeParse(row.ingredientId).success) {
        context.addIssue({
          code: "custom",
          path: [index, "ingredientId"],
          message: "Pick an ingredient.",
        });
      }
    });
  })
  .transform((rows) => {
    const groupNames = groupNamesForRows(rows);

    return rows.flatMap((row, index) =>
      row.kind === "heading"
        ? []
        : [
            {
              ingredientId: row.ingredientId,
              quantity: row.quantity,
              unit: row.unit,
              note: row.note,
              groupName: groupNames[index],
            },
          ],
    );
  });

export type RecipeIngredientRowInput = z.input<typeof recipeIngredientRowSchema>;
export type RecipeIngredientValues = z.output<
  typeof recipeIngredientRowsSchema
>[number];
export type RenameIngredientInput = z.infer<typeof renameIngredientSchema>;
export type MergeIngredientsInput = z.infer<typeof mergeIngredientsSchema>;
