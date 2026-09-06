/**
 * Working out what adding ingredients does to the shopping list.
 * SPEC.md §6.3.
 *
 * Pure: no database access. One of the three modules CLAUDE.md requires tests
 * for.
 *
 * §6.3 describes the merge as a sequence of queries — look for a matching row,
 * sum it or create it — which cannot be a pure function. So the work is split:
 * this module **decides**, returning a list of operations, and the server action
 * **executes** them. That split is what makes "refuses to merge into a checked
 * item" testable without a database.
 */

import { canMerge } from "@/lib/units";

/** A row already on the active list, as the planner needs to see it. */
export type ExistingItem = {
  id: string;
  /** Null for a free-text item, which never merges. */
  ingredientId: string | null;
  /** BASE UNITS. Null for an unquantified item. */
  quantity: number | null;
  unit: string | null;
  isChecked: boolean;
};

/** One ticked ingredient from the picker, already scaled and rounded. */
export type MergeCandidate = {
  ingredientId: string;
  /**
   * BASE UNITS, already scaled to the planned servings and rounded with
   * `scaleQuantityForShopping`. The planner never scales or rounds: by the time
   * a candidate reaches it, the number is the number.
   */
  quantity: number | null;
  unit: string | null;
  /**
   * Copied from `ingredient_supermarkets` at this moment, per SPEC.md §5.7.
   * Only used when a new item is created — an existing item keeps whatever
   * assignments it already has, because they are independently editable.
   */
  supermarketIds: string[];
};

export type MergeOperation =
  /** Add `addQuantity` to an item already on the list, and bump `updated_at`. */
  | { kind: "increment"; itemId: string; addQuantity: number }
  /**
   * An unquantified candidate matched an unquantified item. Nothing changes on
   * the row, but the caller still records it as added, so the picker greys it
   * out next time. SPEC.md §6.3 step 2.
   */
  | { kind: "keep"; itemId: string }
  /** Create a new line, copying the supermarket assignments onto it. */
  | {
      kind: "create";
      ingredientId: string;
      quantity: number | null;
      unit: string | null;
      supermarketIds: string[];
    };

/** A line being accumulated: either one already on the list, or one to create. */
type Slot = {
  /** Null when this batch will create the line. */
  itemId: string | null;
  ingredientId: string;
  unit: string | null;
  /** For a create, the running total. Unused for an existing item. */
  quantity: number | null;
  /** For an existing item, how much this batch adds to it. */
  addedQuantity: number;
  supermarketIds: string[];
  /** Whether any candidate landed here at all. */
  touched: boolean;
};

/**
 * Decides what a batch of ticked ingredients does to the list.
 *
 * The rules, all from SPEC.md §6.3:
 *
 * - A candidate merges into an existing item only when the ingredient matches,
 *   the unit strings are identical (`canMerge`), and the item is **unchecked**.
 *   Checked items are never merged into: if you have already bought the onions
 *   and another recipe needs onions, that is a new line.
 * - Different units of the same ingredient never merge, so 500g potatoes and
 *   2 piece potatoes stay two lines.
 * - A null quantity matches another null quantity and stays null.
 * - Free-text items (no `ingredientId`) are never merged into.
 *
 * Candidates also merge **with each other**, which is what makes the plan-wide
 * picker produce one line: two onions from one recipe and three from another,
 * added in the same batch, are a single `create` of five rather than two rows.
 * SPEC.md §8 Phase 7 acceptance criterion 1.
 */
export function planShoppingListAdditions(
  existingItems: ExistingItem[],
  candidates: MergeCandidate[],
): MergeOperation[] {
  const slots: Slot[] = existingItems
    // Checked items and free-text items are both invisible to the merge.
    .filter((item) => !item.isChecked && item.ingredientId !== null)
    .map((item) => ({
      itemId: item.id,
      ingredientId: item.ingredientId as string,
      unit: item.unit,
      quantity: item.quantity,
      addedQuantity: 0,
      supermarketIds: [],
      touched: false,
    }));

  for (const candidate of candidates) {
    const slot = slots.find(
      (existing) =>
        existing.ingredientId === candidate.ingredientId &&
        canMerge(existing.unit, candidate.unit),
    );

    if (!slot) {
      slots.push({
        itemId: null,
        ingredientId: candidate.ingredientId,
        unit: candidate.unit,
        quantity: candidate.quantity,
        addedQuantity: 0,
        supermarketIds: candidate.supermarketIds,
        touched: true,
      });
      continue;
    }

    slot.touched = true;

    // An unquantified candidate adds nothing to an unquantified line: "salt, to
    // taste" twice is still "salt, to taste".
    if (candidate.quantity === null) {
      continue;
    }

    if (slot.itemId === null) {
      slot.quantity = (slot.quantity ?? 0) + candidate.quantity;
    } else {
      slot.addedQuantity += candidate.quantity;
    }
  }

  return slots.filter((slot) => slot.touched).map(toOperation);
}

function toOperation(slot: Slot): MergeOperation {
  if (slot.itemId === null) {
    return {
      kind: "create",
      ingredientId: slot.ingredientId,
      quantity: slot.quantity,
      unit: slot.unit,
      supermarketIds: slot.supermarketIds,
    };
  }

  if (slot.addedQuantity === 0) {
    return { kind: "keep", itemId: slot.itemId };
  }

  return {
    kind: "increment",
    itemId: slot.itemId,
    addQuantity: slot.addedQuantity,
  };
}

/**
 * The quantity an incremented item ends up with.
 *
 * Exists so the server action never re-derives the sum itself, and so the
 * arithmetic is covered by the same tests as the planning. A null existing
 * quantity is treated as zero here: the planner only ever emits an `increment`
 * for a slot whose units matched, and a null quantity carries a null unit, so
 * this cannot silently turn "to taste" into a number.
 */
export function incrementedQuantity(
  currentQuantity: number | null,
  addQuantity: number,
): number {
  return (currentQuantity ?? 0) + addQuantity;
}
