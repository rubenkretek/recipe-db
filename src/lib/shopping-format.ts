/**
 * Grouping and text formatting for the shopping list.
 *
 * Pure and client-safe: no database access, no `next/headers`. Split from
 * `src/lib/shopping.ts` for the same reason `plan-dates.ts` is split from
 * `plans.ts` — that module builds a Supabase client, which reads cookies, so
 * importing from it into a Client Component fails the build. See CLAUDE.md.
 */

import { formatQuantity, pluraliseName } from "@/lib/units";

export type ShoppingItem = {
  id: string;
  /** The ingredient's name, or the free text typed for a manual item. */
  name: string;
  ingredientId: string | null;
  /** BASE UNITS. Null for an unquantified or free-text item. */
  quantity: number | null;
  unit: string | null;
  isChecked: boolean;
  /** Who ticked it, for the "Got it" section. Null if nobody has. */
  checkedByName: string | null;
  checkedAt: string | null;
  /**
   * The server's `updated_at`. Carried so an offline tick can record the value
   * it saw, which is the compare half of the compare-and-swap that decides
   * whether it still applies on reconnect. See `src/lib/offline-queue.ts`.
   */
  updatedAt: string;
  /** Copied from the ingredient when the item was created, then editable. */
  supermarketIds: string[];
};

export type ShoppingGroup = {
  /** Null for the "Unassigned" group, which always sorts last. */
  supermarketId: string | null;
  name: string;
  items: ShoppingItem[];
};

/**
 * The columns and embedded rows an item needs, wherever it is fetched from.
 *
 * Shared by the server query in `shopping.ts` and the browser query behind the
 * shopping screen, so the two cannot drift into returning different shapes for
 * the same row. Phase 8.
 */
export const ITEM_SELECT = `
  id, ingredient_id, manual_name, quantity, unit, is_checked, checked_at, updated_at,
  ingredients ( name ),
  profiles ( display_name ),
  shopping_list_item_supermarkets ( supermarket_id )
`;

/** One `shopping_list_items` row as PostgREST returns it under `ITEM_SELECT`. */
export type ShoppingItemRow = {
  id: string;
  ingredient_id: string | null;
  manual_name: string | null;
  quantity: number | null;
  unit: string | null;
  is_checked: boolean;
  checked_at: string | null;
  updated_at: string;
  ingredients: { name: string } | null;
  profiles: { display_name: string } | null;
  shopping_list_item_supermarkets: { supermarket_id: string }[];
};

/**
 * Maps a raw row to the shape the screen renders.
 *
 * Client-safe and shared, for the same reason `ITEM_SELECT` is.
 */
export function toShoppingItem(row: ShoppingItemRow): ShoppingItem {
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
    updatedAt: row.updated_at,
    supermarketIds: (row.shopping_list_item_supermarkets ?? []).map(
      (link) => link.supermarket_id,
    ),
  };
}

/** Alphabetical, which is the only ordering that helps until Phase 12's aisles. */
export function sortItems(items: ShoppingItem[]): ShoppingItem[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

/** The "All" chip's value. Not a uuid, so it cannot collide with a real one. */
export const ALL_SUPERMARKETS = "all";

/** The heading unassigned items appear under, on screen and in the clipboard. */
export const UNASSIGNED_GROUP = "Unassigned";

/**
 * Renders one line: the quantity, then the name.
 *
 * `formatQuantity` omits the unit for `piece` entirely — "2 piece onion" has to
 * read "2 onions" — so the name is pluralised here, which is the only place
 * that knows it. SPEC.md §5.3 and CLAUDE.md "Gotchas".
 *
 * `display_unit` is deliberately not consulted: SPEC.md §5.3 says the shopping
 * list always uses the display rule, so 30ml reads as "30ml" even where the
 * recipe wrote "2 tbsp". You are buying a bottle, not measuring a spoon.
 */
export function formatItemLine(item: ShoppingItem): string {
  const quantity = formatQuantity(item.quantity, item.unit);

  const name =
    item.unit === "piece" && item.quantity !== null
      ? pluraliseName(item.name, item.quantity)
      : item.name;

  return quantity ? `${quantity} ${name}` : name;
}

/**
 * Groups items by supermarket, with "Unassigned" at the end.
 *
 * An item assigned to two shops appears under **both**: this is not a
 * partition, exactly as the ingredient manager groups in Phase 5. The item
 * itself still exists once, so ticking it anywhere removes it everywhere —
 * SPEC.md §5.7 and §8 Phase 7 acceptance criterion 4.
 */
export function groupItemsBySupermarket(
  items: ShoppingItem[],
  supermarkets: { id: string; name: string }[],
): ShoppingGroup[] {
  const groups: ShoppingGroup[] = supermarkets.map((supermarket) => ({
    supermarketId: supermarket.id,
    name: supermarket.name,
    items: items.filter((item) => item.supermarketIds.includes(supermarket.id)),
  }));

  groups.push({
    supermarketId: null,
    name: UNASSIGNED_GROUP,
    items: items.filter((item) => item.supermarketIds.length === 0),
  });

  // Empty groups are noise on a screen used one-handed in a shop, unlike the
  // ingredient manager where an empty shop is a prompt to fill it.
  return groups.filter((group) => group.items.length > 0);
}

/** The items a supermarket chip selection shows. */
export function filterBySupermarket(
  items: ShoppingItem[],
  supermarketId: string,
): ShoppingItem[] {
  if (supermarketId === ALL_SUPERMARKETS) {
    return items;
  }
  if (supermarketId === UNASSIGNED_GROUP) {
    return items.filter((item) => item.supermarketIds.length === 0);
  }
  return items.filter((item) => item.supermarketIds.includes(supermarketId));
}

/**
 * The clipboard text for what is currently on screen. SPEC.md §7.
 *
 * **Names only, one per line.** No quantities and no supermarket headings,
 * because this is pasted into an online shop's bulk-add box: "2kg potatoes"
 * searches for a product called "2kg potatoes", and a heading searches for a
 * product called "Aldi". Filter to a shop first and the list is that shop's
 * order, ready to paste.
 *
 * Unchecked items only — a list of things already in the trolley is no use to
 * anyone. Names are deduplicated: two lines that say "milk" are one thing to
 * buy, and the screen still shows both.
 *
 * *(Changed 2026-09-22. It previously wrote `2kg potatoes` and, under "All",
 * grouped the lines under supermarket headings to mirror the Google Keep note
 * this replaced. Both are wrong for the target that actually gets pasted into.)*
 */
export function shoppingListText(
  items: ShoppingItem[],
  selectedSupermarketId: string,
): string {
  const names = filterBySupermarket(items, selectedSupermarketId)
    .filter((item) => !item.isChecked)
    .map((item) => item.name);

  return [...new Set(names)].join("\n");
}
