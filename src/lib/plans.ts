import { requireKitchenContext } from "@/lib/kitchen";
import { signedUrlsFor } from "@/lib/photo-urls";
import { scaleQuantityForShopping } from "@/lib/servings";
import { createClient } from "@/lib/supabase/server";
import type { MealType } from "@/schemas/recipe";

export type PlanStatus = "active" | "complete";

/** One line in the ingredient picker. SPEC.md §6.3. */
export type PlannedIngredient = {
  ingredientId: string;
  name: string;
  /**
   * BASE UNITS, already scaled to the planned servings and rounded for
   * shopping — so this is the number that will land on the list, and the picker
   * shows exactly what it is about to add.
   */
  quantity: number | null;
  unit: string | null;
  /**
   * Already sent to the list for this planned recipe, so the picker starts it
   * unticked and grey. It can still be ticked again if you genuinely want more.
   */
  alreadyAdded: boolean;
};

export type PlannedRecipe = {
  /** The `meal_plan_recipes` row id, which is what every mutation addresses. */
  id: string;
  recipeId: string;
  name: string;
  mealType: MealType;
  /** Persisted, unlike the recipe page's stepper. SPEC.md §6.2. */
  servings: number;
  sortOrder: number;
  cookedAt: string | null;
  /** Signed URL of the recipe's cover, or null when it has no photos. */
  coverUrl: string | null;
  /**
   * Set when the recipe has been archived since it was planned. It stays on the
   * plan — removing it silently would be worse — but says so.
   */
  archivedAt: string | null;
  /** What the picker offers, scaled to `servings`. Empty for a bare recipe. */
  ingredients: PlannedIngredient[];
  /** How many of them have already been sent, for the "6 of 8 added" subtitle. */
  addedCount: number;
};

export type MealPlan = {
  id: string;
  name: string | null;
  startsOn: string;
  endsOn: string | null;
  status: PlanStatus;
  completedAt: string | null;
  recipes: PlannedRecipe[];
};

export type PlanSummary = {
  id: string;
  name: string | null;
  startsOn: string;
  endsOn: string | null;
  status: PlanStatus;
  recipeCount: number;
  cookedCount: number;
};

// The ingredients and the added-ingredient rows are embedded here rather than
// fetched separately by the picker, because the plan screen needs the counts
// anyway to render "6 of 8 added" on every row.
const PLAN_SELECT = `
  id, name, starts_on, ends_on, status, completed_at,
  meal_plan_recipes (
    id, recipe_id, servings, sort_order, cooked_at,
    meal_plan_recipe_added_ingredients ( ingredient_id ),
    recipes (
      name, meal_type, archived_at, base_servings,
      recipe_photos ( storage_path, sort_order, id ),
      recipe_ingredients (
        id, ingredient_id, quantity, unit, sort_order,
        ingredients ( name )
      )
    )
  )
`;

type PlanRow = {
  id: string;
  name: string | null;
  starts_on: string;
  ends_on: string | null;
  status: PlanStatus;
  completed_at: string | null;
  meal_plan_recipes: {
    id: string;
    recipe_id: string;
    servings: number;
    sort_order: number;
    cooked_at: string | null;
    meal_plan_recipe_added_ingredients: { ingredient_id: string }[];
    recipes: {
      name: string;
      meal_type: MealType;
      archived_at: string | null;
      base_servings: number;
      recipe_photos: { id: string; storage_path: string; sort_order: number }[];
      recipe_ingredients: {
        id: string;
        ingredient_id: string;
        quantity: number | null;
        unit: string | null;
        sort_order: number;
        ingredients: { name: string } | null;
      }[];
    } | null;
  }[];
};

/**
 * The cover photo's storage path, or null when a recipe has none.
 *
 * Lowest `sort_order` wins, tie-broken by id, because deletes leave gaps and
 * nothing guarantees the cover is exactly 0. SPEC.md §5.4.
 */
function coverPathOf(
  photos: { id: string; storage_path: string; sort_order: number }[],
): string | null {
  const cover = [...photos].sort(
    (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id),
  )[0];
  return cover?.storage_path ?? null;
}

/**
 * A planned recipe's ingredients, scaled to the servings it is planned for.
 *
 * Scaled with `scaleQuantityForShopping`, not the recipe view's scaler: counts
 * round **up** here, because you cannot buy 1.5 onions, and rounding to the
 * nearest half first would compound downwards. SPEC.md §6.2.
 */
function plannedIngredientsOf(
  planned: PlanRow["meal_plan_recipes"][number],
): PlannedIngredient[] {
  const added = new Set(
    (planned.meal_plan_recipe_added_ingredients ?? []).map(
      (row) => row.ingredient_id,
    ),
  );

  const baseServings = planned.recipes?.base_servings ?? 1;

  return [...(planned.recipes?.recipe_ingredients ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .map((ingredient) => ({
      ingredientId: ingredient.ingredient_id,
      name: ingredient.ingredients?.name ?? "Unknown ingredient",
      quantity: scaleQuantityForShopping(
        ingredient.quantity === null ? null : Number(ingredient.quantity),
        ingredient.unit,
        baseServings,
        planned.servings,
      ),
      unit: ingredient.unit,
      alreadyAdded: added.has(ingredient.ingredient_id),
    }));
}

async function toMealPlan(row: PlanRow): Promise<MealPlan> {
  const paths = row.meal_plan_recipes
    .map((planned) => coverPathOf(planned.recipes?.recipe_photos ?? []))
    .filter((path): path is string => path !== null);

  // One batch for the whole plan rather than one round trip per row.
  const urls = await signedUrlsFor(paths);

  const recipes = [...row.meal_plan_recipes]
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .map((planned) => {
      const coverPath = coverPathOf(planned.recipes?.recipe_photos ?? []);
      const ingredients = plannedIngredientsOf(planned);
      return {
        id: planned.id,
        recipeId: planned.recipe_id,
        name: planned.recipes?.name ?? "Unknown recipe",
        mealType: planned.recipes?.meal_type ?? ("dinner" as MealType),
        servings: planned.servings,
        sortOrder: planned.sort_order,
        cookedAt: planned.cooked_at,
        coverUrl: coverPath ? (urls.get(coverPath) ?? null) : null,
        archivedAt: planned.recipes?.archived_at ?? null,
        ingredients,
        addedCount: ingredients.filter((one) => one.alreadyAdded).length,
      };
    });

  return {
    id: row.id,
    name: row.name,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    status: row.status,
    completedAt: row.completed_at,
    recipes,
  };
}

/**
 * The kitchen's active plan, or null if it has never started one.
 *
 * Null is a real state rather than an error: completing a plan creates the next
 * one, so a kitchen only ever starts a plan by hand once, and the plan screen
 * shows an empty state with a Start button until it does. A Server Component
 * cannot write during render, which is why this does not create one lazily.
 */
export async function getActivePlan(): Promise<MealPlan | null> {
  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  // Filtered by the active kitchen explicitly, even though RLS would already do
  // it. RLS is the safety net, not the filter. See CLAUDE.md "Multi-tenancy".
  const { data, error } = await supabase
    .from("meal_plans")
    .select(PLAN_SELECT)
    .eq("kitchen_id", active.id)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load the meal plan: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  return toMealPlan(data as unknown as PlanRow);
}

/**
 * One plan by id, active or complete, or null if it is not in this kitchen.
 * Used by the read-only history detail page.
 */
export async function getPlan(planId: string): Promise<MealPlan | null> {
  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("meal_plans")
    .select(PLAN_SELECT)
    .eq("kitchen_id", active.id)
    .eq("id", planId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load the meal plan: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  return toMealPlan(data as unknown as PlanRow);
}

/**
 * Completed plans, most recently started first.
 *
 * Deliberately excludes the active plan: it has its own screen, and showing it
 * in a list called "history" alongside plans you can no longer edit invites the
 * wrong kind of click. Counts come embedded rather than as photos, because the
 * history list shows no thumbnails and signing URLs for it would be waste.
 */
export async function listCompletedPlans(): Promise<PlanSummary[]> {
  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("meal_plans")
    .select("id, name, starts_on, ends_on, status, meal_plan_recipes ( cooked_at )")
    .eq("kitchen_id", active.id)
    .eq("status", "complete")
    .order("starts_on", { ascending: false });

  if (error) {
    throw new Error(`Could not load plan history: ${error.message}`);
  }

  return (data ?? []).map((plan) => ({
    id: plan.id,
    name: plan.name,
    startsOn: plan.starts_on,
    endsOn: plan.ends_on,
    status: plan.status as PlanStatus,
    recipeCount: (plan.meal_plan_recipes ?? []).length,
    cookedCount: (plan.meal_plan_recipes ?? []).filter(
      (planned) => planned.cooked_at !== null,
    ).length,
  }));
}

/**
 * A one-line summary of the active plan for the dashboard card.
 *
 * Its own small query rather than reusing `getActivePlan`, which embeds every
 * recipe and signs a cover URL for each — all of it discarded to render one
 * sentence.
 */
export async function getActivePlanSummary(): Promise<PlanSummary | null> {
  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("meal_plans")
    .select("id, name, starts_on, ends_on, status, meal_plan_recipes ( cooked_at )")
    .eq("kitchen_id", active.id)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load the meal plan: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    startsOn: data.starts_on,
    endsOn: data.ends_on,
    status: data.status as PlanStatus,
    recipeCount: (data.meal_plan_recipes ?? []).length,
    cookedCount: (data.meal_plan_recipes ?? []).filter(
      (planned) => planned.cooked_at !== null,
    ).length,
  };
}

/**
 * The `meal_plan_recipes` row ids on the active plan for a set of recipes.
 *
 * Feeds the "on the plan" state of the Add to plan button. Returns a Set of
 * recipe ids rather than the rows themselves, because that is all the caller
 * asks — and a recipe may legitimately appear twice.
 */
export async function recipeIdsOnActivePlan(): Promise<Set<string>> {
  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("meal_plan_recipes")
    .select("recipe_id, meal_plans!inner ( status )")
    .eq("kitchen_id", active.id)
    .eq("meal_plans.status", "active");

  if (error) {
    throw new Error(`Could not load the meal plan: ${error.message}`);
  }

  return new Set((data ?? []).map((row) => row.recipe_id));
}
