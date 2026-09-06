import { requireKitchenContext } from "@/lib/kitchen";
import type { ShoppingItem } from "@/lib/shopping-format";
import { createClient } from "@/lib/supabase/server";

export type ShoppingList = {
  id: string;
  items: ShoppingItem[];
};

const ITEM_SELECT = `
  id, ingredient_id, manual_name, quantity, unit, is_checked, checked_at, created_at,
  ingredients ( name ),
  profiles ( display_name ),
  shopping_list_item_supermarkets ( supermarket_id )
`;

type ItemRow = {
  id: string;
  ingredient_id: string | null;
  manual_name: string | null;
  quantity: number | null;
  unit: string | null;
  is_checked: boolean;
  checked_at: string | null;
  created_at: string;
  ingredients: { name: string } | null;
  profiles: { display_name: string } | null;
  shopping_list_item_supermarkets: { supermarket_id: string }[];
};

function toShoppingItem(row: ItemRow): ShoppingItem {
  return {
    id: row.id,
    // One of the two is always present: the check constraint on the table
    // guarantees it, so the fallback is defensive rather than expected.
    name: row.ingredients?.name ?? row.manual_name ?? "Unnamed item",
    ingredientId: row.ingredient_id,
    quantity: row.quantity === null ? null : Number(row.quantity),
    unit: row.unit,
    isChecked: row.is_checked,
    checkedByName: row.profiles?.display_name ?? null,
    checkedAt: row.checked_at,
    supermarketIds: (row.shopping_list_item_supermarkets ?? []).map(
      (link) => link.supermarket_id,
    ),
  };
}

/**
 * The kitchen's active shopping list, or null if it has never started one.
 *
 * Null is a real state rather than an error, exactly as with meal plans:
 * completing a plan creates the next list, so a kitchen only ever starts one by
 * hand once. A Server Component cannot write during render, so nothing is
 * created here — `ensureActiveListId` in the server action does it on the first
 * add.
 */
export async function getActiveShoppingList(): Promise<ShoppingList | null> {
  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  // Filtered by the active kitchen explicitly, even though RLS would already do
  // it. RLS is the safety net, not the filter. See CLAUDE.md "Multi-tenancy".
  const { data, error } = await supabase
    .from("shopping_lists")
    .select(`id, shopping_list_items ( ${ITEM_SELECT} )`)
    .eq("kitchen_id", active.id)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load the shopping list: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  const rows = (data.shopping_list_items ?? []) as unknown as ItemRow[];

  return {
    id: data.id,
    // Alphabetical within the screen's grouping. Aisle order within a shop is
    // Phase 12; until then a name sort is the only ordering that helps.
    items: rows
      .map(toShoppingItem)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * How many unchecked items are on the active list, for the dashboard card.
 *
 * Its own small query rather than reusing `getActiveShoppingList`, which embeds
 * every item and its assignments — all of it discarded to render one number.
 */
export async function getUncheckedItemCount(): Promise<number> {
  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { data: list } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("kitchen_id", active.id)
    .eq("status", "active")
    .maybeSingle();

  if (!list) {
    return 0;
  }

  const { count, error } = await supabase
    .from("shopping_list_items")
    .select("id", { count: "exact", head: true })
    .eq("kitchen_id", active.id)
    .eq("shopping_list_id", list.id)
    .eq("is_checked", false);

  if (error) {
    throw new Error(`Could not count shopping items: ${error.message}`);
  }

  return count ?? 0;
}
