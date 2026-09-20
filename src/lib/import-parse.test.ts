import { describe, expect, it } from "vitest";

import {
  cleanText,
  deriveStepTitle,
  fractionToNumber,
  matchIngredientName,
  normaliseUnit,
  parseLeadingQuantity,
  stripLinks,
  stripUnitParenthetical,
  unclaimedLines,
} from "@/lib/import-parse";

describe("stripLinks", () => {
  it("keeps the label and drops the url", () => {
    expect(
      stripLinks(
        "300g [tomatoes](https://www.thedoctorskitchen.com/learn/tomatoes) chopped",
      ),
    ).toBe("300g tomatoes chopped");
  });

  it("handles a label that contains brackets of its own meaning", () => {
    expect(
      stripLinks("150g [red lentils (dried)](https://example.com/lentils)"),
    ).toBe("150g red lentils (dried)");
  });
});

describe("cleanText", () => {
  it("strips the bold markers Notion puts round a heading", () => {
    expect(cleanText("**For the curry paste**")).toBe("For the curry paste");
  });

  it("collapses the trailing whitespace an export leaves behind", () => {
    expect(cleanText("100ml water boiling ")).toBe("100ml water boiling");
  });
});

describe("fractionToNumber", () => {
  it("reads whole numbers and decimals", () => {
    expect(fractionToNumber("2")).toBe(2);
    expect(fractionToNumber("0.5")).toBe(0.5);
  });

  it("reads vulgar fractions", () => {
    expect(fractionToNumber("½")).toBe(0.5);
    expect(fractionToNumber("¼")).toBe(0.25);
  });

  it("reads written and mixed fractions", () => {
    expect(fractionToNumber("1/2")).toBe(0.5);
    expect(fractionToNumber("1 1/2")).toBe(1.5);
    expect(fractionToNumber("1½")).toBe(1.5);
  });

  it("refuses anything else rather than guessing", () => {
    expect(fractionToNumber("a few")).toBeNull();
    expect(fractionToNumber("")).toBeNull();
    expect(fractionToNumber("1/0")).toBeNull();
  });
});

describe("normaliseUnit", () => {
  it("maps the ways a recipe writes our units", () => {
    expect(normaliseUnit("grams")).toBe("g");
    expect(normaliseUnit("tablespoons")).toBe("tbsp");
    expect(normaliseUnit("cloves")).toBe("clove");
  });

  it("maps a tin to a can, which is what the app stores", () => {
    expect(normaliseUnit("tin")).toBe("can");
  });

  it("returns null for words that are not units", () => {
    expect(normaliseUnit("anise")).toBeNull();
    expect(normaliseUnit("sprinkle")).toBeNull();
  });
});

describe("parseLeadingQuantity", () => {
  it("reads the flush-written weights and volumes in the samples", () => {
    expect(parseLeadingQuantity("100ml water boiling")).toEqual({
      quantity: 100,
      unit: "ml",
      rest: "water boiling",
    });
    expect(parseLeadingQuantity("600g monkfish fillet")).toEqual({
      quantity: 600,
      unit: "g",
      rest: "monkfish fillet",
    });
  });

  it("reads spaced units and vulgar fractions", () => {
    expect(parseLeadingQuantity("2 tbsp desiccated coconut")).toEqual({
      quantity: 2,
      unit: "tbsp",
      rest: "desiccated coconut",
    });
    expect(parseLeadingQuantity("½ tsp black pepper")).toEqual({
      quantity: 0.5,
      unit: "tsp",
      rest: "black pepper",
    });
  });

  it("reads a count whose unit follows the name", () => {
    expect(parseLeadingQuantity("6 garlic cloves peeled")).toEqual({
      quantity: 6,
      unit: null,
      rest: "garlic cloves peeled",
    });
  });

  it("leaves a trailing word alone when it is not a unit", () => {
    // "2 star anise" must not become two anise: the number stands alone and the
    // model decides the unit is pieces.
    expect(parseLeadingQuantity("1 star anise")).toEqual({
      quantity: 1,
      unit: null,
      rest: "star anise",
    });
  });

  it("reads a can", () => {
    expect(parseLeadingQuantity("1 can coconut milk")).toEqual({
      quantity: 1,
      unit: "can",
      rest: "coconut milk",
    });
  });

  it("has no quantity for a line that starts with a word", () => {
    expect(parseLeadingQuantity("Sprinkle of kosher salt")).toEqual({
      quantity: null,
      unit: null,
      rest: "Sprinkle of kosher salt",
    });
    expect(parseLeadingQuantity("Scallions, thinly sliced")).toEqual({
      quantity: null,
      unit: null,
      rest: "Scallions, thinly sliced",
    });
  });

  it("takes the lower bound of a range, so you can always add more", () => {
    expect(parseLeadingQuantity("1-2 red chillies")).toEqual({
      quantity: 1,
      unit: null,
      rest: "red chillies",
    });
  });

  it("ignores an approximation marker", () => {
    expect(parseLeadingQuantity("~1/4 cup gochujang")).toEqual({
      quantity: 0.25,
      unit: "cup",
      rest: "gochujang",
    });
  });
});

describe("stripUnitParenthetical", () => {
  it("drops a bracketed second opinion about the quantity", () => {
    expect(stripUnitParenthetical("225 g (1/2 lb) 90/10 ground beef")).toBe(
      "225 g 90/10 ground beef",
    );
    expect(stripUnitParenthetical("50 g (~1/4 cup) gochujang paste")).toBe(
      "50 g gochujang paste",
    );
  });

  it("keeps a bracket that says something the quantity does not", () => {
    expect(stripUnitParenthetical("12 curry leaves (optional)")).toBe(
      "12 curry leaves (optional)",
    );
    expect(stripUnitParenthetical("150g red lentils (dried)")).toBe(
      "150g red lentils (dried)",
    );
    expect(
      stripUnitParenthetical("Splash of water (as needed to adjust sauce)"),
    ).toBe("Splash of water (as needed to adjust sauce)");
  });
});

describe("deriveStepTitle", () => {
  it("uses a label the writer already supplied", () => {
    expect(
      deriveStepTitle(
        "Sear the beef: Add the ground beef to a pan over medium heat. Add a sprinkle of salt.",
      ),
    ).toEqual({
      title: "Sear the beef",
      description:
        "Add the ground beef to a pan over medium heat. Add a sprinkle of salt.",
    });
  });

  it("makes a title from the first sentence of a long paragraph", () => {
    const text =
      "Add the lentils, coconut milk and stock. Bring to a simmer and cook gently for 20 minutes until the lentils are soft.";
    const result = deriveStepTitle(text);

    expect(result.title).toBe("Add the lentils, coconut milk and stock");
    expect(result.description).toBe(text);
  });

  it("never cuts a title mid-word", () => {
    const result = deriveStepTitle(
      "Tip the soaked chillies and coconut along with the water into a food processor and blend until completely smooth and glossy throughout.",
    );

    expect(result.title.length).toBeLessThanOrEqual(60);
    expect(result.title.endsWith(" ")).toBe(false);
    expect(
      "Tip the soaked chillies and coconut along with the water into a food processor and blend until completely smooth and glossy throughout.",
    ).toContain(result.title);
  });

  it("keeps a short paragraph as the title with nothing underneath", () => {
    expect(deriveStepTitle("Drain the lentils.")).toEqual({
      title: "Drain the lentils",
      description: null,
    });
  });
});

describe("unclaimedLines", () => {
  const source = [
    "# Gochujang Beef",
    "",
    "Eating this week: No",
    "2025 Reviewed: No",
    "",
    "## Ingredients",
    "225 g (1/2 lb) 90/10 ground beef",
    "Sprinkle of kosher salt",
    "89 g (1/2 cup) frozen peas",
  ].join("\n");

  it("reports a line the draft never accounted for", () => {
    const claimed = ["Gochujang Beef", "ground beef", "kosher salt"];
    expect(unclaimedLines(source, claimed)).toEqual(["89 g (1/2 cup) frozen peas"]);
  });

  it("is quiet when everything was read", () => {
    const claimed = ["Gochujang Beef", "ground beef", "kosher salt", "frozen peas"];
    expect(unclaimedLines(source, claimed)).toEqual([]);
  });

  it("does not report the fields we deliberately drop", () => {
    // "Eating this week" and "2025 Reviewed" are preamble, never imported, and
    // must not be reported as missed.
    const reported = unclaimedLines(source, [
      "Gochujang Beef",
      "ground beef",
      "kosher salt",
      "frozen peas",
    ]);
    expect(reported.join(" ")).not.toContain("Eating");
    expect(reported.join(" ")).not.toContain("Reviewed");
  });

  it("does not mistake a method label for preamble", () => {
    const method = [
      "# A recipe",
      "## Instructions",
      "Sear the beef: brown the mince in a hot pan.",
    ].join("\n");

    expect(unclaimedLines(method, ["A recipe"])).toEqual([
      "Sear the beef: brown the mince in a hot pan.",
    ]);
  });
});

describe("matchIngredientName", () => {
  const existing = [
    { id: "11111111-1111-4111-8111-111111111111", name: "red lentils" },
    { id: "22222222-2222-4222-8222-222222222222", name: "monkfish fillet" },
    { id: "33333333-3333-4333-8333-333333333333", name: "baby spinach" },
  ];

  it("matches an exact name whatever its case", () => {
    expect(matchIngredientName("Monkfish Fillet", existing)).toEqual({
      status: "matched",
      ingredientId: "22222222-2222-4222-8222-222222222222",
      name: "monkfish fillet",
    });
  });

  it("matches through a recorded alias", () => {
    expect(
      matchIngredientName("spinach", existing, [
        {
          ingredientId: "33333333-3333-4333-8333-333333333333",
          alias: "spinach",
        },
      ]),
    ).toEqual({
      status: "matched",
      ingredientId: "33333333-3333-4333-8333-333333333333",
      name: "baby spinach",
    });
  });

  it("only suggests a near match, never takes it", () => {
    const result = matchIngredientName("red lentils (dried)", existing);
    expect(result.status).toBe("suggested");
    if (result.status === "suggested") {
      expect(result.name).toBe("red lentils");
    }
  });

  it("reports something genuinely new as new", () => {
    expect(matchIngredientName("gochujang paste", existing)).toEqual({
      status: "new",
    });
  });
});
