import { requireKitchenContext } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";

export type Supermarket = {
  id: string;
  name: string;
  sortOrder: number;
  /** How many ingredients are assigned here. Shown before a delete. */
  ingredientCount: number;
};

/**
 * Every supermarket in the active kitchen, in the order the household arranged
 * them.
 *
 * That order is user-facing: it becomes the order of the chips on the Phase 7
 * shopping screen, which is walked in aisle order with a trolley. Sorted by
 * `sort_order` and tie-broken by name, because deletes leave gaps and nothing
 * guarantees the values stay contiguous.
 *
 * The ingredient count exists so a delete confirmation can say what will be
 * lost — deleting a shop cascades its assignments away.
 */
export async function listSupermarkets(): Promise<Supermarket[]> {
  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  // Filtered by the active kitchen explicitly, even though RLS would already do
  // it. RLS is the safety net, not the filter. See CLAUDE.md "Multi-tenancy".
  const { data, error } = await supabase
    .from("supermarkets")
    .select("id, name, sort_order, ingredient_supermarkets ( ingredient_id )")
    .eq("kitchen_id", active.id)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Could not load supermarkets: ${error.message}`);
  }

  return (data ?? [])
    .map((supermarket) => ({
      id: supermarket.id,
      name: supermarket.name,
      sortOrder: supermarket.sort_order,
      ingredientCount: (supermarket.ingredient_supermarkets ?? []).length,
    }))
    .sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
}
