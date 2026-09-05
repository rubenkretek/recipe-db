"use server";

import { revalidatePath } from "next/cache";

import { requireKitchenContext } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";
import {
  addRecipeToPlanSchema,
  planIdSchema,
  plannedRecipeIdSchema,
  renamePlanSchema,
  reorderPlannedRecipesSchema,
  setCookedSchema,
  setPlannedServingsSchema,
} from "@/schemas/plan";
import type { ActionError } from "@/server/actions/auth";

/**
 * Refreshes everywhere a plan is visible.
 *
 * The dashboard carries a summary of the active plan and the recipe detail page
 * carries the "on the plan" state of its Add button, so neither can be left
 * behind by a change made on the plan screen itself.
 */
function revalidatePlanViews(): void {
  revalidatePath("/plan");
  revalidatePath("/plan/history");
  revalidatePath("/plan/[id]", "page");
  revalidatePath("/recipes/[id]", "page");
  revalidatePath("/");
}

/**
 * The active plan's id, creating one if the kitchen has never started a plan.
 *
 * Completing a plan is what creates the next one, so this only ever inserts on
 * the very first use of the feature. It lives here rather than in a Server
 * Component because a component cannot write during render, and it is shared by
 * the Start button and Add to plan so that adding a recipe never fails merely
 * because no plan exists yet.
 */
async function ensureActivePlanId(kitchenId: string): Promise<
  { planId: string } | ActionError
> {
  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("meal_plans")
    .select("id")
    .eq("kitchen_id", kitchenId)
    .eq("status", "active")
    .maybeSingle();

  if (readError) {
    return { error: readError.message };
  }
  if (existing) {
    return { planId: existing.id };
  }

  const { data: created, error: insertError } = await supabase
    .from("meal_plans")
    .insert({ kitchen_id: kitchenId })
    .select("id")
    .single();

  if (insertError) {
    return { error: insertError.message };
  }

  return { planId: created.id };
}

/** Starts the kitchen's first plan. Later plans are created by completion. */
export async function startPlan(): Promise<ActionError | void> {
  const { active } = await requireKitchenContext();

  const result = await ensureActivePlanId(active.id);
  if ("error" in result) {
    return result;
  }

  revalidatePlanViews();
}

/**
 * The next `sort_order` on a plan.
 *
 * Deletes leave gaps, so this reads the current maximum rather than counting
 * rows — the same rule photos and supermarkets follow.
 */
async function nextSortOrder(planId: string): Promise<number> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("meal_plan_recipes")
    .select("sort_order")
    .eq("meal_plan_id", planId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.sort_order ?? -1) + 1;
}

/**
 * Puts a recipe on the active plan.
 *
 * Servings defaults to the recipe's own `base_servings` per SPEC.md §5.6, which
 * is what the recipe detail page's button relies on: it sends no servings, and
 * the number is adjusted on the plan screen where it persists.
 *
 * The same recipe may be added twice on purpose — cooking something twice in one
 * period is real — so there is no unique constraint and no dedupe here. The
 * button shows an "on the plan" state so a second add is deliberate.
 */
export async function addRecipeToPlan(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = addRecipeToPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Unknown recipe." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  // Scoped to the kitchen, so a recipe id from elsewhere reads as absent.
  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .select("base_servings, archived_at")
    .eq("id", parsed.data.recipeId)
    .eq("kitchen_id", active.id)
    .maybeSingle();

  if (recipeError) {
    return { error: recipeError.message };
  }
  if (!recipe) {
    return { error: "That recipe is not in this kitchen." };
  }
  if (recipe.archived_at) {
    return { error: "That recipe is archived. Restore it first." };
  }

  const plan = await ensureActivePlanId(active.id);
  if ("error" in plan) {
    return plan;
  }

  const { error } = await supabase.from("meal_plan_recipes").insert({
    kitchen_id: active.id,
    meal_plan_id: plan.planId,
    recipe_id: parsed.data.recipeId,
    servings: parsed.data.servings ?? recipe.base_servings,
    sort_order: await nextSortOrder(plan.planId),
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePlanViews();
}

/**
 * Changes how many servings a planned recipe is for.
 *
 * Unlike the recipe detail page's stepper, which is display only, this persists:
 * it is the number the Phase 7 ingredient picker scales by. SPEC.md §6.2.
 */
export async function setPlannedServings(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = setPlannedServingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the servings." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("meal_plan_recipes")
    .update({ servings: parsed.data.servings })
    .eq("id", parsed.data.plannedRecipeId)
    .eq("kitchen_id", active.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePlanViews();
}

/** Ticks a planned recipe as cooked, or unticks it. */
export async function setCooked(input: unknown): Promise<ActionError | void> {
  const parsed = setCookedSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Unknown planned recipe." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("meal_plan_recipes")
    .update({ cooked_at: parsed.data.cooked ? new Date().toISOString() : null })
    .eq("id", parsed.data.plannedRecipeId)
    .eq("kitchen_id", active.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePlanViews();
}

/** Writes a new ordering, the array index becoming `sort_order`. */
export async function reorderPlannedRecipes(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = reorderPlannedRecipesSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Unknown plan order." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const updates = await Promise.all(
    parsed.data.plannedRecipeIds.map((id, index) =>
      supabase
        .from("meal_plan_recipes")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("kitchen_id", active.id),
    ),
  );

  const failure = updates.find((result) => result.error);
  if (failure?.error) {
    return { error: failure.error.message };
  }

  revalidatePlanViews();
}

/**
 * Takes a recipe off the plan.
 *
 * A plain delete today. From Phase 7 this needs the toast and undo of SPEC.md
 * §9 decision 8, because removing a recipe will leave its ingredients on the
 * shopping list — which is the part worth explaining, and there is no shopping
 * list to explain yet.
 */
export async function removeFromPlan(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = plannedRecipeIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Unknown planned recipe." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("meal_plan_recipes")
    .delete()
    .eq("id", parsed.data.plannedRecipeId)
    .eq("kitchen_id", active.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePlanViews();
}

/** Names a plan, or clears the name back to null. */
export async function renamePlan(input: unknown): Promise<ActionError | void> {
  const parsed = renamePlanSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the name." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("meal_plans")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.planId)
    .eq("kitchen_id", active.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePlanViews();
}

/**
 * Marks the plan complete and opens the next one.
 *
 * Goes through the `complete_meal_plan` RPC rather than two statements from
 * here, because SPEC.md §6.4 requires the swap to be atomic: a dropped
 * connection between the update and the insert would leave the kitchen with no
 * active plan at all. The function grows to archive the shopping list and carry
 * unchecked items over in Phase 7.
 */
export async function completePlan(input: unknown): Promise<ActionError | void> {
  const parsed = planIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Unknown plan." };
  }

  await requireKitchenContext();
  const supabase = await createClient();

  const { error } = await supabase.rpc("complete_meal_plan", {
    plan_id: parsed.data.planId,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePlanViews();
}

/**
 * Copies every recipe from a past plan onto the active one.
 *
 * Servings come across; `cooked_at` does not, because this is a plan to cook
 * again rather than a record of having done so. Nothing is deduplicated against
 * what is already on the current plan — the same recipe twice is allowed, and
 * silently dropping half a copy would be more surprising than a duplicate.
 */
export async function copyPlanToCurrent(
  input: unknown,
): Promise<ActionError | { added: number }> {
  const parsed = planIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Unknown plan." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { data: source, error: sourceError } = await supabase
    .from("meal_plan_recipes")
    .select("recipe_id, servings, sort_order")
    .eq("meal_plan_id", parsed.data.planId)
    .eq("kitchen_id", active.id)
    .order("sort_order", { ascending: true });

  if (sourceError) {
    return { error: sourceError.message };
  }
  if (!source || source.length === 0) {
    return { error: "That plan has no recipes to copy." };
  }

  const plan = await ensureActivePlanId(active.id);
  if ("error" in plan) {
    return plan;
  }

  // Appended after whatever is already there, keeping their relative order.
  const start = await nextSortOrder(plan.planId);

  const { error } = await supabase.from("meal_plan_recipes").insert(
    source.map((planned, index) => ({
      kitchen_id: active.id,
      meal_plan_id: plan.planId,
      recipe_id: planned.recipe_id,
      servings: planned.servings,
      sort_order: start + index,
    })),
  );

  if (error) {
    return { error: error.message };
  }

  revalidatePlanViews();
  return { added: source.length };
}
