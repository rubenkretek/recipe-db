import { describe, expect, it } from "vitest";

import {
  INPUT_UNITS,
  canMerge,
  formatQuantity,
  pluraliseName,
  toBase,
} from "@/lib/units";

describe("toBase", () => {
  // SPEC.md §5.3 lists every input unit and its multiplier. One case each, so a
  // change to the table cannot pass unnoticed.
  it.each([
    ["g", 1, 1, "g"],
    ["kg", 1, 1000, "g"],
    ["oz", 1, 28.3495, "g"],
    ["lb", 1, 453.592, "g"],
    ["ml", 1, 1, "ml"],
    ["l", 1, 1000, "ml"],
    ["tsp", 1, 5, "ml"],
    ["tbsp", 1, 15, "ml"],
    ["cup", 1, 240, "ml"],
  ])("converts %s to base", (unit, quantity, expected, expectedUnit) => {
    expect(toBase(quantity, unit)).toEqual({
      quantity: expected,
      unit: expectedUnit,
    });
  });

  it.each(["piece", "clove", "bunch", "pack", "can", "slice", "pinch"])(
    "leaves the count unit %s as itself",
    (unit) => {
      // Count units are not interconvertible: two cloves and two pieces of
      // garlic are not four of anything. SPEC.md §5.3.
      expect(toBase(3, unit)).toEqual({ quantity: 3, unit });
    },
  );

  it("stores 1kg as 1000 g", () => {
    // SPEC.md §8 Phase 4 acceptance criterion 1.
    expect(toBase(1, "kg")).toEqual({ quantity: 1000, unit: "g" });
  });

  it("stores 2 tbsp as 30 ml", () => {
    // SPEC.md §8 Phase 4 acceptance criterion 2.
    expect(toBase(2, "tbsp")).toEqual({ quantity: 30, unit: "ml" });
  });

  it("passes a null quantity straight through", () => {
    expect(toBase(null, "g")).toEqual({ quantity: null, unit: null });
  });

  it("refuses a unit it does not know rather than guessing", () => {
    // SPEC.md §6.1: no fuzzy matching. The editor asks rather than guessing.
    expect(() => toBase(1, "handful")).toThrow(/unknown unit/i);
  });

  it("offers every input unit from the spec, and no base-only duplicates", () => {
    expect(INPUT_UNITS).toEqual([
      "g",
      "kg",
      "oz",
      "lb",
      "ml",
      "l",
      "tsp",
      "tbsp",
      "cup",
      "piece",
      "clove",
      "bunch",
      "pack",
      "can",
      "slice",
      "pinch",
    ]);
  });
});

describe("formatQuantity — weight", () => {
  it("renders under 1000 as grams", () => {
    expect(formatQuantity(250, "g")).toBe("250g");
  });

  it("renders 1000 and above as kilograms", () => {
    expect(formatQuantity(1500, "g")).toBe("1.5kg");
  });

  it("switches exactly at the 1000 threshold", () => {
    expect(formatQuantity(999, "g")).toBe("999g");
    expect(formatQuantity(1000, "g")).toBe("1kg");
  });

  it("trims trailing zeros rather than showing 2.00kg", () => {
    expect(formatQuantity(2000, "g")).toBe("2kg");
  });

  it("rounds to at most two decimal places", () => {
    expect(formatQuantity(1234.5, "g")).toBe("1.23kg");
  });
});

describe("formatQuantity — volume", () => {
  it("renders under 1000 as millilitres", () => {
    expect(formatQuantity(200, "ml")).toBe("200ml");
  });

  it("renders 1000 and above as litres", () => {
    expect(formatQuantity(1500, "ml")).toBe("1.5l");
  });

  it("switches exactly at the 1000 threshold", () => {
    expect(formatQuantity(999, "ml")).toBe("999ml");
    expect(formatQuantity(1000, "ml")).toBe("1l");
  });
});

describe("formatQuantity — counts", () => {
  it("pluralises a count unit when the count is not 1", () => {
    expect(formatQuantity(3, "clove")).toBe("3 cloves");
  });

  it("keeps the singular at exactly 1", () => {
    expect(formatQuantity(1, "clove")).toBe("1 clove");
  });

  it("pluralises the -ch units with -es", () => {
    expect(formatQuantity(2, "bunch")).toBe("2 bunches");
    expect(formatQuantity(2, "pinch")).toBe("2 pinches");
  });

  it("omits `piece` entirely", () => {
    // "2 piece onion" must read "2", leaving the caller to append the name.
    // SPEC.md §5.3.
    expect(formatQuantity(2, "piece")).toBe("2");
    expect(formatQuantity(1, "piece")).toBe("1");
  });

  it("renders a half count", () => {
    expect(formatQuantity(1.5, "clove")).toBe("1.5 cloves");
  });
});

describe("formatQuantity — null and zero", () => {
  it("renders nothing at all for a null quantity", () => {
    // Leaves just the ingredient name and note: "salt, to taste". SPEC.md §5.3.
    expect(formatQuantity(null, null)).toBe("");
    expect(formatQuantity(null, "g")).toBe("");
  });

  it("renders an explicit zero rather than treating it as unquantified", () => {
    expect(formatQuantity(0, "g")).toBe("0g");
  });
});

describe("formatQuantity — display_unit", () => {
  it("honours the entered unit when it converts back cleanly", () => {
    // SPEC.md §8 Phase 4 acceptance criterion 2: 30ml entered as tbsp.
    expect(formatQuantity(30, "ml", "tbsp")).toBe("2 tbsp");
  });

  it("falls back to the display rule without a display unit", () => {
    expect(formatQuantity(30, "ml")).toBe("30ml");
  });

  it("honours cups and kilograms", () => {
    expect(formatQuantity(240, "ml", "cup")).toBe("1 cup");
    expect(formatQuantity(480, "ml", "cup")).toBe("2 cups");
    expect(formatQuantity(1000, "g", "kg")).toBe("1kg");
  });

  it("falls back when the value does not convert back cleanly", () => {
    // 100g entered as oz is 3.5274oz. Nobody writes that, so show grams.
    expect(formatQuantity(100, "g", "oz")).toBe("100g");
  });

  it("falls back mid-scale when scaling breaks the clean conversion", () => {
    // 2 tbsp scaled by 1.33 is 40ml, which is 2.667 tbsp. The unit changes as
    // you press the servings stepper. Surprising but correct.
    expect(formatQuantity(40, "ml", "tbsp")).toBe("40ml");
  });

  it("ignores a display unit from the wrong dimension", () => {
    expect(formatQuantity(30, "ml", "g")).toBe("30ml");
  });

  it("ignores a display unit that is not a real unit", () => {
    expect(formatQuantity(30, "ml", "splash")).toBe("30ml");
  });
});

describe("canMerge", () => {
  it("is true only for identical unit strings", () => {
    // The whole merge rule. SPEC.md §5.3.
    expect(canMerge("g", "g")).toBe(true);
    expect(canMerge("clove", "clove")).toBe(true);
  });

  it("is false across dimensions and across count units", () => {
    expect(canMerge("g", "ml")).toBe(false);
    expect(canMerge("clove", "piece")).toBe(false);
  });

  it("treats two nulls as mergeable", () => {
    // A null quantity matches another null for the same ingredient. §6.3.
    expect(canMerge(null, null)).toBe(true);
  });

  it("does not merge a null with a real unit", () => {
    expect(canMerge(null, "g")).toBe(false);
    expect(canMerge("g", null)).toBe(false);
  });
});

describe("pluraliseName", () => {
  it("adds -s to a plain name", () => {
    expect(pluraliseName("onion", 2)).toBe("onions");
  });

  it("keeps the singular at exactly 1", () => {
    expect(pluraliseName("onion", 1)).toBe("onion");
  });

  it("turns -y into -ies", () => {
    expect(pluraliseName("cherry", 3)).toBe("cherries");
  });

  it("keeps -ay and -ey as plain -s", () => {
    expect(pluraliseName("bay", 2)).toBe("bays");
  });

  it("adds -es after s, x, ch and sh", () => {
    expect(pluraliseName("squash", 2)).toBe("squashes");
    expect(pluraliseName("box", 2)).toBe("boxes");
    expect(pluraliseName("anchovy", 2)).toBe("anchovies");
  });

  it("leaves a name that is already plural alone", () => {
    expect(pluraliseName("greens", 2)).toBe("greens");
  });

  it("is best effort and gets irregulars wrong", () => {
    // Documented limitation: name the ingredient "bay leaves" instead.
    expect(pluraliseName("leaf", 2)).toBe("leafs");
  });
});
