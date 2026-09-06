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
  /** Copied from the ingredient when the item was created, then editable. */
  supermarketIds: string[];
};

export type ShoppingGroup = {
  /** Null for the "Unassigned" group, which always sorts last. */
  supermarketId: string | null;
  name: string;
  items: ShoppingItem[];
};

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
 * Unchecked items only — a list of things you have already bought is no use to
 * anyone. Under a single supermarket it is one item per line; under "All" the
 * lines are grouped under supermarket headings with a blank line between,
 * mirroring both the screen and the Google Keep note this replaces. An item in
 * two shops appears under both headings, for the same reason it does on screen.
 */
export function shoppingListText(
  items: ShoppingItem[],
  supermarkets: { id: string; name: string }[],
  selectedSupermarketId: string,
): string {
  const unchecked = items.filter((item) => !item.isChecked);

  if (selectedSupermarketId !== ALL_SUPERMARKETS) {
    return filterBySupermarket(unchecked, selectedSupermarketId)
      .map(formatItemLine)
      .join("\n");
  }

  return groupItemsBySupermarket(unchecked, supermarkets)
    .map((group) =>
      [group.name, ...group.items.map(formatItemLine)].join("\n"),
    )
    .join("\n\n");
}
