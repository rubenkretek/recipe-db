import { z } from "zod";

import { IMPORT_DEFAULT_SERVINGS } from "@/lib/import-parse";
import { INPUT_UNITS } from "@/lib/units";
import { MEAL_TYPES } from "@/schemas/recipe";

/**
 * A unit the model is allowed to return.
 *
 * The same list the editor offers, validated the same way, so a unit the model
 * invented cannot reach `toBase()` and throw on save. SPEC.md §5.3.
 */
const unitCode = z.enum(INPUT_UNITS as [string, ...string[]]);

/** Blank strings mean "nothing here", whatever the model intended by them. */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .default(null);

/**
 * One ingredient as the model reads it out of the file.
 *
 * `name` is the ingredient itself — "tomatoes", not "300g tomatoes chopped" —
 * because it has to match against the kitchen's existing ingredients. What was
 * done to it goes in `note`, and which section it sat under in `groupName`,
 * which becomes the heading in the editor. SPEC.md §5.5.
 */
export const importedIngredientSchema = z.object({
  name: z.string().trim().min(1, "An ingredient needs a name.").max(80),
  quantity: z
    .number()
    .nonnegative("A quantity cannot be negative.")
    .nullable()
    .default(null),
  unit: unitCode.nullable().default(null),
  note: z.string().trim().max(120).nullable().default(null),
  groupName: z.string().trim().max(80).nullable().default(null),
});

/**
 * One step of the method.
 *
 * The title is required here even though the file may not have one: a file that
 * numbers its steps "## 1" gives a title that means nothing, so the title is
 * written from the text. See `deriveStepTitle`.
 */
export const importedStepSchema = z.object({
  title: z.string().trim().min(1, "A step needs a title.").max(200),
  description: optionalText,
});

/**
 * The whole recipe, as the model returns it.
 *
 * Every field has a default so a sparse answer still parses: a file with no
 * tags, no link and no servings — which the Gochujang sample is — must import
 * rather than fail. What cannot be defaulted is the name, because a recipe
 * without one is not a recipe.
 */
export const importedRecipeSchema = z.object({
  name: z.string().trim().min(1, "The file has no recipe name.").max(200),
  mealType: z.enum(MEAL_TYPES).default("dinner"),
  baseServings: z
    .number()
    .int()
    .min(1)
    .max(99)
    .default(IMPORT_DEFAULT_SERVINGS),
  sourceUrl: optionalText,
  notes: optionalText,
  /** Tag names, not ids. Matched or created when the recipe is saved. */
  tags: z.array(z.string().trim().min(1).max(40)).default([]),
  ingredients: z.array(importedIngredientSchema).default([]),
  steps: z.array(importedStepSchema).default([]),
});

export type ImportedRecipe = z.infer<typeof importedRecipeSchema>;
export type ImportedIngredient = z.infer<typeof importedIngredientSchema>;

/**
 * What the second pass returns: the things the first pass missed.
 *
 * Deliberately not the whole recipe again. Asking for a fresh extraction would
 * produce a second, differently-wrong answer with no way to tell which to
 * trust; asking only for omissions gives something that can be appended.
 */
export const importReviewSchema = z.object({
  missingIngredients: z.array(importedIngredientSchema).default([]),
  missingSteps: z.array(importedStepSchema).default([]),
  /** Anything the model wants to say about what it could not read. */
  warnings: z.array(z.string().trim().min(1).max(200)).default([]),
});

export type ImportReview = z.infer<typeof importReviewSchema>;

/** The file the user dropped, as text. */
export const importFileSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  /**
   * Capped well below the server action body limit. A recipe is a page of
   * text; anything approaching this is not one, and sending it would only burn
   * tokens before the model said so.
   */
  text: z
    .string()
    .trim()
    .min(1, "That file is empty.")
    .max(60_000, "That file is too long to be a recipe."),
});

export type ImportFileInput = z.infer<typeof importFileSchema>;
