import { z } from "zod";

import { recipeIngredientRowsSchema } from "@/schemas/ingredient";
import { PHOTO_PATH_PATTERN } from "@/schemas/photo";

/**
 * The meal types from SPEC.md §5.1, mirroring the `meal_type` Postgres enum.
 *
 * Duplicated from the generated database types deliberately: zod needs a value
 * at runtime to validate against, and the generated types are erased at compile
 * time. If the enum changes in a migration, change it here too.
 */
export const MEAL_TYPES = [
  "breakfast",
  "lunch",
  "dinner",
  "dessert",
  "snack",
] as const;

export type MealType = (typeof MEAL_TYPES)[number];

/** Ratings run 0 to 10 in halves, matching the numeric(3,1) check constraint. */
export const RATING_MIN = 0;
export const RATING_MAX = 10;
export const RATING_STEP = 0.5;

/**
 * A recipe as entered in the editor.
 *
 * Only the name is required; SPEC.md §8 Phase 2 acceptance is explicit that a
 * recipe can be created with a name and nothing else. Every other field is
 * optional and empty strings are normalised to null, so a blank textarea does
 * not store "" and then render as an empty method section.
 */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable();

/**
 * One step of the method, as entered in the editor.
 *
 * The title is what makes it a step; the description is optional markdown, and
 * the photo is a storage path the browser has already uploaded to — never the
 * bytes themselves. See CLAUDE.md "Exception: file uploads".
 *
 * The title is allowed to be empty *here* only so that a wholly blank step can
 * be recognised and dropped below. A step with anything else in it must have a
 * title.
 */
const recipeStepSchema = z.object({
  title: z.string().trim().max(200, "That step title is too long."),
  description: optionalText,
  photoPath: z
    .string()
    .regex(PHOTO_PATH_PATTERN, "That is not a valid photo path.")
    .nullable(),
});

/** What the editor appends when the plus button is pressed. */
export const BLANK_STEP = { title: "", description: "", photoPath: null };

export const recipeFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the recipe a name.")
    .max(200, "That name is too long."),
  mealType: z.enum(MEAL_TYPES),
  baseServings: z.coerce
    .number()
    .int("Servings must be a whole number.")
    .min(1, "At least one serving.")
    .max(99, "That is a lot of servings."),
  // Not z.url(): people paste bare domains and half-remembered links, and this
  // is provenance rather than something the app fetches. Phase 10 validates
  // properly at the point it actually loads the page.
  sourceUrl: optionalText,
  notes: optionalText,
  /**
   * The method, as ordered steps. The array index becomes `sort_order`.
   *
   * Wholly blank steps are dropped rather than rejected. The editor always
   * starts with one empty step, and without this a recipe saved with only a
   * name would fail — breaking SPEC.md §8 Phase 2's "a recipe can be created
   * with a name only". A step with a description or photo but no title is an
   * error, reported against the step so the author can find it.
   */
  steps: z
    .array(recipeStepSchema)
    .default([])
    .superRefine((steps, context) => {
      steps.forEach((step, index) => {
        const hasContent = step.description !== null || step.photoPath !== null;
        if (step.title === "" && hasContent) {
          context.addIssue({
            code: "custom",
            path: [index, "title"],
            message: `Give step ${index + 1} a title.`,
          });
        }
      });
    })
    .transform((steps) =>
      steps.filter(
        (step) =>
          step.title !== "" ||
          step.description !== null ||
          step.photoPath !== null,
      ),
    ),
  /** Tag ids already attached. Tag creation happens before submit. */
  tagIds: z.array(z.uuid()).default([]),
  /**
   * The ingredient list, in display order. Unlike photos — which are files and
   * upload immediately — ingredients are plain data and save with the form.
   * Quantities arrive in whatever unit was picked and are converted to base
   * units server-side. SPEC.md §5.3.
   */
  //
  // Held as rows that may be headings ("Salad", "Dressing"); saved as lines that
  // each carry the heading above them. See `recipeIngredientRowsSchema`.
  ingredients: recipeIngredientRowsSchema,
});

export type RecipeFormInput = z.input<typeof recipeFormSchema>;
export type RecipeFormValues = z.output<typeof recipeFormSchema>;
export type RecipeStepValues = RecipeFormValues["steps"][number];

export const createRecipeSchema = recipeFormSchema;

export const updateRecipeSchema = recipeFormSchema.extend({
  recipeId: z.uuid(),
});

export const recipeIdSchema = z.object({
  recipeId: z.uuid(),
});

/**
 * A new tag name typed into the combobox.
 *
 * Trimmed but *not* lower-cased: the tag keeps the capitalisation the author
 * used, while the unique index on `(kitchen_id, lower(name))` stops a second
 * tag differing only in case. SPEC.md §8 Phase 2 acceptance.
 */
export const createTagSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the tag a name.")
    .max(40, "That tag name is too long."),
});

export type CreateTagInput = z.infer<typeof createTagSchema>;

/** Setting your own score on a recipe. */
export const rateRecipeSchema = z.object({
  recipeId: z.uuid(),
  score: z
    .number()
    .min(RATING_MIN, "Ratings start at 0.")
    .max(RATING_MAX, "Ratings stop at 10."),
});

export type RateRecipeInput = z.infer<typeof rateRecipeSchema>;
