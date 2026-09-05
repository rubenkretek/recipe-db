import { requireKitchenContext } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";

export type ManagedIngredient = {
  id: string;
  name: string;
  defaultUnit: string | null;
  /** How many recipes use it. Drives the merge decision. */
  usageCount: number;
};

/**
 * Every ingredient in the active kitchen, alphabetically, with a usage count.
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
    .select("id, name, default_unit, recipe_ingredients ( recipe_id )")
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
  }));
}
