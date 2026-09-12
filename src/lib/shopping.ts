import { requireKitchenContext } from "@/lib/kitchen";
import {
  ITEM_SELECT,
  sortItems,
  toShoppingItem,
  type ShoppingItem,
  type ShoppingItemRow,
} from "@/lib/shopping-format";
import { createClient } from "@/lib/supabase/server";

export type ShoppingList = {
  id: string;
  items: ShoppingItem[];
};

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

  const rows = (data.shopping_list_items ?? []) as unknown as ShoppingItemRow[];

  return { id: data.id, items: sortItems(rows.map(toShoppingItem)) };
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
