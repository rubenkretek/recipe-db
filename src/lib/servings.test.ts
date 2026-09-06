import { describe, expect, it } from "vitest";

import {
  roundCountForRecipe,
  roundCountForShopping,
  scaleQuantity,
  scaleQuantityForShopping,
} from "@/lib/servings";
import { formatQuantity } from "@/lib/units";

describe("scaleQuantity", () => {
  it("scales by target over base", () => {
    // SPEC.md §8 Phase 4 acceptance criterion 3: 200g at 2 servings is 300g at 3.
    expect(scaleQuantity(200, "g", 2, 3)).toBe(300);
  });

  it("returns the quantity unchanged at the base servings", () => {
    expect(scaleQuantity(200, "g", 2, 2)).toBe(200);
  });

  it("halves correctly", () => {
    expect(scaleQuantity(200, "g", 4, 2)).toBe(100);
  });

  it("never scales a null quantity", () => {
    // "salt, to taste" stays "to taste" however many people are eating.
    expect(scaleQuantity(null, null, 2, 8)).toBeNull();
  });

  it("rounds weight to at most two decimal places", () => {
    // 200g across 3 servings scaled to 1 is 66.666..., not a sensible display.
    expect(scaleQuantity(200, "g", 3, 1)).toBe(66.67);
  });

  it("rounds volume to at most two decimal places", () => {
    expect(scaleQuantity(5, "ml", 3, 1)).toBe(1.67);
  });

  it("rounds counts to the nearest half, not to two decimals", () => {
    // SPEC.md §8 Phase 4 acceptance criterion 4: 1 clove at 4 from a base of 2.
    expect(scaleQuantity(1, "clove", 2, 4)).toBe(2);
  });

  it("gives half an onion where that is the honest answer", () => {
    // Half an onion is a real quantity in a recipe. SPEC.md §6.2.
    expect(scaleQuantity(1, "piece", 2, 3)).toBe(1.5);
  });

  it("treats a base of zero as unscalable rather than dividing by zero", () => {
    expect(scaleQuantity(200, "g", 0, 4)).toBe(200);
  });
});

describe("roundCountForRecipe", () => {
  it("rounds to the nearest half", () => {
    expect(roundCountForRecipe(1.25)).toBe(1.5);
    expect(roundCountForRecipe(1.2)).toBe(1);
    expect(roundCountForRecipe(1.75)).toBe(2);
  });

  it("leaves whole and half numbers alone", () => {
    expect(roundCountForRecipe(2)).toBe(2);
    expect(roundCountForRecipe(2.5)).toBe(2.5);
  });

  it("never rounds a real quantity down to nothing", () => {
    expect(roundCountForRecipe(0.1)).toBe(0.5);
  });
});

describe("roundCountForShopping", () => {
  it("rounds up to a whole number", () => {
    // You cannot buy 1.5 onions. SPEC.md §6.2.
    expect(roundCountForShopping(1.5)).toBe(2);
    expect(roundCountForShopping(1.1)).toBe(2);
  });

  it("leaves a whole number alone", () => {
    expect(roundCountForShopping(3)).toBe(3);
  });

  it("rounds any fraction up to one", () => {
    expect(roundCountForShopping(0.25)).toBe(1);
  });
});

describe("the two rounding rules differ, which is the point", () => {
  it("shows 1.5 onions in a recipe but buys 2", () => {
    const scaled = 1.5;
    expect(roundCountForRecipe(scaled)).toBe(1.5);
    expect(roundCountForShopping(scaled)).toBe(2);
  });
});

describe("scaling and formatting together", () => {
  it("shows 300g chicken at 3 servings from a base of 2", () => {
    // Acceptance criterion 3, end to end through both modules.
    const scaled = scaleQuantity(200, "g", 2, 3);
    expect(formatQuantity(scaled, "g")).toBe("300g");
  });

  it("shows 2 cloves garlic at 4 servings from a base of 2", () => {
    // Acceptance criterion 4, end to end.
    const scaled = scaleQuantity(1, "clove", 2, 4);
    expect(formatQuantity(scaled, "clove")).toBe("2 cloves");
  });

  it("keeps tablespoons readable when scaling stays clean", () => {
    const scaled = scaleQuantity(30, "ml", 2, 3);
    expect(formatQuantity(scaled, "ml", "tbsp")).toBe("3 tbsp");
  });

  it("crosses the kilogram threshold when scaled up", () => {
    const scaled = scaleQuantity(600, "g", 2, 4);
    expect(formatQuantity(scaled, "g")).toBe("1.2kg");
  });
});

describe("scaleQuantityForShopping", () => {
  it("rounds a scaled count up to a whole number", () => {
    // SPEC.md §6.2: you cannot buy 1.5 onions.
    expect(scaleQuantityForShopping(1, "piece", 2, 3)).toBe(2);
  });

  it("does not round a count twice", () => {
    // The reason this function exists rather than composing the other two.
    // A recipe for 5 using 6 eggs, planned for 1 serving, needs 1.2 eggs, so
    // you must buy 2. Rounding to the nearest half first gives 1.0, whose
    // ceiling is 1 — one egg short.
    expect(scaleQuantityForShopping(6, "piece", 5, 1)).toBe(2);
    expect(roundCountForShopping(scaleQuantity(6, "piece", 5, 1) as number)).toBe(1);
  });

  it("agrees with the recipe scaling for weight", () => {
    // Only counts diverge; weight and volume behave identically.
    expect(scaleQuantityForShopping(200, "g", 2, 3)).toBe(300);
    expect(scaleQuantityForShopping(30, "ml", 2, 1)).toBe(15);
  });

  it("rounds weight to at most two decimal places", () => {
    expect(scaleQuantityForShopping(200, "g", 3, 1)).toBe(66.67);
  });

  it("never scales a null quantity", () => {
    expect(scaleQuantityForShopping(null, null, 2, 8)).toBeNull();
  });

  it("leaves the quantity alone when base servings are impossible", () => {
    expect(scaleQuantityForShopping(200, "g", 0, 4)).toBe(200);
  });

  it("keeps a needed count above zero", () => {
    // A quarter of an onion still means buying one.
    expect(scaleQuantityForShopping(1, "piece", 8, 2)).toBe(1);
  });
});
