import { z } from "zod";

/**
 * Servings bounds for a planned recipe.
 *
 * Matches the recipe editor's own limits and the `check (servings > 0)`
 * constraint on `meal_plan_recipes`. SPEC.md §5.6.
 */
export const MIN_PLANNED_SERVINGS = 1;
export const MAX_PLANNED_SERVINGS = 99;

const servings = z.coerce
  .number()
  .int("Servings must be a whole number.")
  .min(MIN_PLANNED_SERVINGS, "At least one serving.")
  .max(MAX_PLANNED_SERVINGS, "That is a lot of servings.");

/**
 * Putting a recipe on the active plan.
 *
 * `servings` is optional because the Add to plan button on the recipe detail
 * page does not send one: the recipe's own `base_servings` is used, and the
 * number is adjusted on the plan screen where it persists. SPEC.md §6.2.
 */
export const addRecipeToPlanSchema = z.object({
  recipeId: z.uuid(),
  servings: servings.optional(),
});

export const plannedRecipeIdSchema = z.object({
  plannedRecipeId: z.uuid(),
});

export const setPlannedServingsSchema = z.object({
  plannedRecipeId: z.uuid(),
  servings,
});

export const setCookedSchema = z.object({
  plannedRecipeId: z.uuid(),
  /** True stamps `cooked_at` with now, false clears it back to null. */
  cooked: z.boolean(),
});

export const reorderPlannedRecipesSchema = z.object({
  /** Every planned recipe on the plan, in the order the array gives them. */
  plannedRecipeIds: z.array(z.uuid()).min(1),
});

export const planIdSchema = z.object({
  planId: z.uuid(),
});

/**
 * Completing a plan, and which unchecked items come with it.
 *
 * `carryItemIds` null means "carry everything", which is what completing a plan
 * did before there was a choice — so an older client, or any caller that does
 * not care, behaves exactly as before. An empty array means "carry nothing" and
 * is a real selection rather than a missing one, which is why the two cannot be
 * collapsed into one falsy case.
 *
 * Anything left unticked stays on the old list as it moves to history. Nothing
 * is deleted by completing a plan.
 */
export const completePlanSchema = z.object({
  planId: z.uuid(),
  carryItemIds: z.array(z.uuid()).nullable().default(null),
});

/**
 * Naming a plan.
 *
 * Optional throughout: an unnamed plan renders as "Current plan", and clearing
 * the field stores null rather than an empty string. Names earn their keep in
 * history, where "Christmas week" reads and "Plan from 5 Sept" does not.
 */
export const renamePlanSchema = z.object({
  planId: z.uuid(),
  name: z
    .string()
    .trim()
    .max(80, "That name is too long.")
    .transform((value) => (value === "" ? null : value))
    .nullable(),
});
