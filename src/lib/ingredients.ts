import { requireKitchenContext } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";

export type ManagedIngredient = {
  id: string;
  name: string;
  defaultUnit: string | null;
  /** How many recipes use it. Drives the merge decision. */
  usageCount: number;
  /** Ids of the supermarkets it is assigned to. Empty means unassigned. */
  supermarketIds: string[];
};

/**
 * Every ingredient in the active kitchen, alphabetically, with a usage count
 * and its supermarket assignments.
 *
 * The count is what makes the manager usable: you cannot sensibly decide which
 * of "chicken breast" and "Chicken Breasts" to keep without knowing that one is
 * used twelve times and the other once. Counted here rather than in SQL because
 * PostgREST cannot return a plain aggregate alongside the row without a view,
 * and a household's ingredient list is small enough that the difference is
 * unmeasurable.
 */
export async function listIngredients(): Promise<ManagedIngredient[]> {
  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  // Filtered by the active kitchen explicitly, even though RLS would already do
  // it. RLS is the safety net, not the filter. See CLAUDE.md "Multi-tenancy".
  const { data, error } = await supabase
    .from("ingredients")
    .select(
      `id, name, default_unit,
       recipe_ingredients ( recipe_id ),
       ingredient_supermarkets ( supermarket_id )`,
    )
    .eq("kitchen_id", active.id)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load ingredients: ${error.message}`);
  }

  return (data ?? []).map((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    defaultUnit: ingredient.default_unit,
    // Distinct recipes, not rows: a recipe listing an ingredient twice — which
    // a merge can produce — is still one recipe using it.
    usageCount: new Set(
      (ingredient.recipe_ingredients ?? []).map((row) => row.recipe_id),
    ).size,
    supermarketIds: (ingredient.ingredient_supermarkets ?? []).map(
      (row) => row.supermarket_id,
    ),
  }));
}

export type IngredientGroup = {
  /** Null for the "Unassigned" group, which always sorts last. */
  supermarketId: string | null;
  name: string;
  ingredients: ManagedIngredient[];
};

/**
 * Groups ingredients by supermarket, with an "Unassigned" group at the end.
 *
 * An ingredient assigned to two shops appears under **both** — this is not a
 * partition. That is SPEC.md §8 Phase 5 acceptance criterion 1, and the group
 * for ingredients assigned nowhere is criterion 2. Until the shopping list
 * exists in Phase 7, this view is the only place either can be observed.
 *
 * Pure: takes what `listIngredients` and `listSupermarkets` already fetched
 * rather than querying again.
 */
export function groupIngredientsBySupermarket(
  ingredients: ManagedIngredient[],
  supermarkets: { id: string; name: string }[],
): IngredientGroup[] {
  const groups: IngredientGroup[] = supermarkets.map((supermarket) => ({
    supermarketId: supermarket.id,
    name: supermarket.name,
    ingredients: ingredients.filter((ingredient) =>
      ingredient.supermarketIds.includes(supermarket.id),
    ),
  }));

  const unassigned = ingredients.filter(
    (ingredient) => ingredient.supermarketIds.length === 0,
  );

  // Always present, even when empty, so the concept is visible before anything
  // has been assigned.
  groups.push({
    supermarketId: null,
    name: "Unassigned",
    ingredients: unassigned,
  });

  return groups;
}
