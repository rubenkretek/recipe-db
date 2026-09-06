import { describe, expect, it } from "vitest";

import {
  incrementedQuantity,
  planShoppingListAdditions,
  type ExistingItem,
  type MergeCandidate,
} from "@/lib/shopping-merge";

const ONION = "11111111-1111-1111-1111-111111111111";
const POTATO = "22222222-2222-2222-2222-222222222222";
const TESCO = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ALDI = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

/** An existing list row, with the boring fields filled in. */
function item(overrides: Partial<ExistingItem> & { id: string }): ExistingItem {
  return {
    ingredientId: ONION,
    quantity: 2,
    unit: "piece",
    isChecked: false,
    ...overrides,
  };
}

/** A ticked ingredient from the picker. */
function candidate(
  overrides: Partial<MergeCandidate> = {},
): MergeCandidate {
  return {
    ingredientId: ONION,
    quantity: 3,
    unit: "piece",
    supermarketIds: [],
    ...overrides,
  };
}

describe("planShoppingListAdditions", () => {
  it("merges into an existing unchecked item of the same unit", () => {
    // SPEC.md §6.3 step 3.
    const operations = planShoppingListAdditions(
      [item({ id: "existing", quantity: 2 })],
      [candidate({ quantity: 3 })],
    );

    expect(operations).toEqual([
      { kind: "increment", itemId: "existing", addQuantity: 3 },
    ]);
    expect(incrementedQuantity(2, 3)).toBe(5);
  });

  it("produces one line of five onions from two recipes", () => {
    // SPEC.md §8 Phase 7 acceptance criterion 1, in the plan-wide case where
    // both recipes are added in the same batch and there is nothing on the list
    // to merge into. The two candidates must fold into each other.
    const operations = planShoppingListAdditions(
      [],
      [candidate({ quantity: 2 }), candidate({ quantity: 3 })],
    );

    expect(operations).toEqual([
      {
        kind: "create",
        ingredientId: ONION,
        quantity: 5,
        unit: "piece",
        supermarketIds: [],
      },
    ]);
  });

  it("refuses to merge into a checked item", () => {
    // SPEC.md §6.3: if you have already bought the onions and another recipe
    // needs onions, that is a new line.
    const operations = planShoppingListAdditions(
      [item({ id: "bought", quantity: 2, isChecked: true })],
      [candidate({ quantity: 3 })],
    );

    expect(operations).toEqual([
      {
        kind: "create",
        ingredientId: ONION,
        quantity: 3,
        unit: "piece",
        supermarketIds: [],
      },
    ]);
  });

  it("refuses to merge different units of the same ingredient", () => {
    // 500g of potatoes and 2 potatoes are not 502 of anything. SPEC.md §5.3.
    const operations = planShoppingListAdditions(
      [item({ id: "weighed", ingredientId: POTATO, quantity: 500, unit: "g" })],
      [candidate({ ingredientId: POTATO, quantity: 2, unit: "piece" })],
    );

    expect(operations).toEqual([
      {
        kind: "create",
        ingredientId: POTATO,
        quantity: 2,
        unit: "piece",
        supermarketIds: [],
      },
    ]);
  });

  it("keeps a null quantity null when it matches another null", () => {
    // "salt, to taste" added twice is still "salt, to taste". SPEC.md §6.3.
    const operations = planShoppingListAdditions(
      [item({ id: "to-taste", quantity: null, unit: null })],
      [candidate({ quantity: null, unit: null })],
    );

    // A `keep`, not an `increment`: nothing changes on the row, but the caller
    // still records it as added so the picker greys it out next time.
    expect(operations).toEqual([{ kind: "keep", itemId: "to-taste" }]);
  });

  it("does not merge a null quantity into a quantified item", () => {
    const operations = planShoppingListAdditions(
      [item({ id: "counted", quantity: 2, unit: "piece" })],
      [candidate({ quantity: null, unit: null })],
    );

    expect(operations).toEqual([
      {
        kind: "create",
        ingredientId: ONION,
        quantity: null,
        unit: null,
        supermarketIds: [],
      },
    ]);
  });

  it("copies supermarket assignments onto a new item only", () => {
    // SPEC.md §5.7: assignments are copied when the item is created, then
    // independently editable — so an existing row keeps whatever it has.
    const created = planShoppingListAdditions(
      [],
      [candidate({ supermarketIds: [TESCO, ALDI] })],
    );
    expect(created).toEqual([
      {
        kind: "create",
        ingredientId: ONION,
        quantity: 3,
        unit: "piece",
        supermarketIds: [TESCO, ALDI],
      },
    ]);

    const merged = planShoppingListAdditions(
      [item({ id: "existing" })],
      [candidate({ supermarketIds: [TESCO, ALDI] })],
    );
    expect(merged).toEqual([
      { kind: "increment", itemId: "existing", addQuantity: 3 },
    ]);
  });

  it("never merges into a free-text item", () => {
    // A manual "onions" line has no ingredient_id, so nothing can match it.
    const operations = planShoppingListAdditions(
      [item({ id: "manual", ingredientId: null, quantity: null, unit: null })],
      [candidate({ quantity: null, unit: null })],
    );

    expect(operations).toEqual([
      {
        kind: "create",
        ingredientId: ONION,
        quantity: null,
        unit: null,
        supermarketIds: [],
      },
    ]);
  });

  it("leaves untouched items out of the plan entirely", () => {
    // Unticking an ingredient means it never reaches the list. SPEC.md §8
    // Phase 7 acceptance criterion 2.
    const operations = planShoppingListAdditions(
      [item({ id: "existing", ingredientId: POTATO })],
      [],
    );

    expect(operations).toEqual([]);
  });

  it("adds to the same existing item once for two candidates", () => {
    // Two recipes both needing onions, with onions already on the list: one
    // increment of the total, not two writes to the same row.
    const operations = planShoppingListAdditions(
      [item({ id: "existing", quantity: 1 })],
      [candidate({ quantity: 2 }), candidate({ quantity: 3 })],
    );

    expect(operations).toEqual([
      { kind: "increment", itemId: "existing", addQuantity: 5 },
    ]);
  });

  it("keeps separate ingredients on separate lines", () => {
    const operations = planShoppingListAdditions(
      [],
      [
        candidate({ ingredientId: ONION, quantity: 2 }),
        candidate({ ingredientId: POTATO, quantity: 500, unit: "g" }),
      ],
    );

    expect(operations).toHaveLength(2);
    expect(operations).toContainEqual({
      kind: "create",
      ingredientId: POTATO,
      quantity: 500,
      unit: "g",
      supermarketIds: [],
    });
  });
});

describe("incrementedQuantity", () => {
  it("sums the existing quantity and the addition", () => {
    expect(incrementedQuantity(2, 3)).toBe(5);
  });

  it("treats a null existing quantity as zero", () => {
    expect(incrementedQuantity(null, 3)).toBe(3);
  });
});
