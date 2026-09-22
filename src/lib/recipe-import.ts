/**
 * Reading a recipe out of a file with the help of a model.
 *
 * **Server-only**, like `shopping.ts` and `photo-urls.ts`: it reads the API key
 * from the environment and must never be imported from a Client Component. The
 * key is not `NEXT_PUBLIC_` precisely so that a mistake here fails the build
 * rather than shipping a secret.
 *
 * The model is given the ambiguous half of the job — which words are the
 * ingredient and which are what you do to it, what a numbered step should be
 * called — and none of the mechanical half. Quantities, units and links are
 * normalised by `import-parse.ts` on the way out, so the model's answer cannot
 * put a unit in the database that `toBase()` would refuse.
 *
 * Nothing here writes to the database. It returns a draft; the user accepts it.
 */

import Anthropic from "@anthropic-ai/sdk";

import {
  cleanText,
  deriveStepTitle,
  stripUnitParenthetical,
  unclaimedLines,
} from "@/lib/import-parse";
import {
  importReviewSchema,
  importedRecipeSchema,
  type ImportFileInput,
  type ImportedRecipe,
} from "@/schemas/import";
import { INPUT_UNITS } from "@/lib/units";

/**
 * Sonnet 5 rather than Opus: a recipe is one page of text, the task is
 * extraction rather than reasoning, and the second pass buys more accuracy per
 * pound than a larger model on the first would.
 */
const IMPORT_MODEL = "claude-sonnet-5";

/** Generous for one recipe; a file that needs more is not a recipe. */
const MAX_TOKENS = 8000;

const SHARED_RULES = `
The file is a recipe exported from a notes app. It was typed by a person, so
its shape varies: headings may be missing, present as markdown headings, or
written as a bare line of text above the block they label.

Rules, all of them absolute:

- Ingredient "name" is the ingredient ALONE, as you would write it on a
  shopping list: "tomatoes", never "300g tomatoes chopped". Preparation
  ("chopped", "roughly chopped", "peeled", "halved", "boiling", "optional")
  goes in "note". Quantity and unit go in their own fields.
- "unit" must be one of: ${INPUT_UNITS.join(", ")}. Nothing else, ever. If the
  file's unit is not in that list, or there is no unit, use null. Never invent
  a unit to fill the field. A countable thing with no stated unit — "1 star
  anise", "2 limes" — is "piece".
- If a quantity cannot be read as a number ("a splash", "a sprinkle of",
  "a portion of"), set quantity and unit to null and put the wording in "note".
  Do not estimate.
- "groupName" is the section the ingredient sat under: "For the curry paste",
  "To serve", "Serving Components". A bare line of text that labels the lines
  under it IS a group heading even without markdown. Ingredients before any
  heading have groupName null.
- Every step needs a "title". If the file titles its steps with numbers
  ("## 1", "## 2") those are not titles: write a short one from what the step
  does. If a step reads "Sear the beef: add the mince...", the title is "Sear
  the beef" and the rest is the description. Put the full prose in
  "description" whenever the step is more than one short sentence.
- Ignore these fields entirely: "Eating this week", any "<year> Reviewed",
  "Rating (out of 10)", "Added to Recipe-db".
- "Tags:" is a comma-separated list of tag names. "Link:" is the sourceUrl.
- A trailing block of general remarks ("Notes & Variations", "Tips") is
  "notes", not a step.
- Strip every markdown link down to its label text. Never keep a URL anywhere
  except sourceUrl.
- If the file does not say how many it serves, use 4.
- Infer mealType from the food: one of breakfast, lunch, dinner, dessert, snack.

Reply with JSON only. No explanation, no markdown fence.
`.trim();

const EXTRACT_PROMPT = `
You extract a recipe from a file into JSON.

${SHARED_RULES}

The JSON shape:

{
  "name": string,
  "mealType": "breakfast" | "lunch" | "dinner" | "dessert" | "snack",
  "baseServings": number,
  "sourceUrl": string | null,
  "notes": string | null,
  "tags": string[],
  "ingredients": [
    { "name": string, "quantity": number | null, "unit": string | null,
      "note": string | null, "groupName": string | null }
  ],
  "steps": [ { "title": string, "description": string | null } ]
}
`.trim();

const REVIEW_PROMPT = `
You are checking another model's extraction of a recipe file for omissions.

Compare the JSON against the original file line by line. Report ONLY what is
missing or wrong — do not restate what is already correct, and do not rewrite
the extraction.

${SHARED_RULES}

The JSON shape:

{
  "missingIngredients": [
    { "name": string, "quantity": number | null, "unit": string | null,
      "note": string | null, "groupName": string | null }
  ],
  "missingSteps": [ { "title": string, "description": string | null } ],
  "warnings": string[]
}

"warnings" is for things a person should look at: a quantity the file states
ambiguously, an ingredient you could not name confidently. Keep each under
twenty words. Empty arrays are the expected answer for a clean extraction.
`.trim();

/** Whether importing is switched on at all. */
export function isImportConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type ImportOutcome =
  | {
      ok: true;
      recipe: ImportedRecipe;
      /** Things the second pass thought a person should check. */
      warnings: string[];
      /** File lines nothing in the draft accounts for. */
      unclaimed: string[];
    }
  | { ok: false; error: string };

/** Pulls the JSON object out of a reply, tolerating a stray fence or preamble. */
function jsonFrom(reply: string): unknown {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : reply;

  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("The model did not return any JSON.");
  }

  return JSON.parse(body.slice(start, end + 1));
}

/** One call, returning the text of the reply. */
async function ask(
  client: Anthropic,
  system: string,
  content: string,
): Promise<string> {
  // No `temperature`: this model rejects it outright — "`temperature` is
  // deprecated for this model", a 400 that only shows against the real API.
  // Consistency comes from the prompt being specific and from the second pass,
  // not from a sampling parameter.
  const message = await client.messages.create({
    model: IMPORT_MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user", content }],
  });

  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
}

/**
 * Calls the model and parses the reply, retrying once on malformed JSON.
 *
 * One retry, not a loop: a model that has produced unparseable output twice
 * with temperature 0 is not going to find it on the third go, and the user is
 * waiting.
 */
async function askForJson<T>(
  client: Anthropic,
  system: string,
  content: string,
  parse: (value: unknown) => T,
): Promise<T> {
  try {
    return parse(jsonFrom(await ask(client, system, content)));
  } catch {
    const retry = await ask(
      client,
      system,
      `${content}\n\nYour previous reply could not be parsed. Reply with the JSON object alone.`,
    );
    return parse(jsonFrom(retry));
  }
}

/**
 * Tidies one ingredient the model returned.
 *
 * The model is told to strip links and leave preparation out of the name, and
 * mostly does. This makes it true regardless — and enforces the database's own
 * rule that a quantity and its unit live or die together, since a unit with no
 * quantity violates the check constraint on `recipe_ingredients`.
 */
function tidyIngredient(ingredient: ImportedRecipe["ingredients"][number]) {
  const name = cleanText(stripUnitParenthetical(ingredient.name));
  const hasQuantity = ingredient.quantity !== null;

  return {
    ...ingredient,
    name,
    quantity: ingredient.quantity,
    // A quantity with no unit is the one pair the database refuses, and the
    // model does produce it for a bare count it could not name ("2 limes").
    // `piece` is what the prompt asks for in that case and what the editor
    // renders as a plain number, so filling it in beats importing a row that
    // cannot be saved.
    unit: hasQuantity ? (ingredient.unit ?? "piece") : null,
    note: ingredient.note ? cleanText(ingredient.note).slice(0, 120) : null,
    groupName: ingredient.groupName ? cleanText(ingredient.groupName) : null,
  };
}

/** Same ingredient, same unit, already present: the review pass re-listing one. */
function alreadyPresent(
  existing: ImportedRecipe["ingredients"],
  candidate: ImportedRecipe["ingredients"][number],
): boolean {
  return existing.some(
    (line) =>
      line.name.toLowerCase() === candidate.name.toLowerCase() &&
      line.unit === candidate.unit,
  );
}

/**
 * Reads a recipe out of a file.
 *
 * Two passes, because a single one quietly drops an ingredient now and then and
 * nothing downstream can tell. The second is given the file and the first
 * answer and asked only what is missing, which is a question with a checkable
 * answer — unlike "try again", which just produces a differently wrong result.
 * A mechanical sweep for unaccounted-for lines runs afterwards, because a model
 * asked whether it missed anything is not a disinterested witness.
 */
export async function extractRecipe(
  file: ImportFileInput,
): Promise<ImportOutcome> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "Importing is not configured: ANTHROPIC_API_KEY is not set.",
    };
  }

  const client = new Anthropic({ apiKey });

  try {
    const first = await askForJson(
      client,
      EXTRACT_PROMPT,
      `File: ${file.filename}\n\n${file.text}`,
      (value) => importedRecipeSchema.parse(value),
    );

    const review = await askForJson(
      client,
      REVIEW_PROMPT,
      `Original file: ${file.filename}\n\n${file.text}\n\n` +
        `The extraction to check:\n\n${JSON.stringify(first, null, 2)}`,
      (value) => importReviewSchema.parse(value),
    );

    const ingredients = [...first.ingredients];
    for (const missing of review.missingIngredients) {
      const tidied = tidyIngredient(missing);
      if (!alreadyPresent(ingredients, tidied)) ingredients.push(tidied);
    }

    const steps = [...first.steps];
    for (const missing of review.missingSteps) {
      const known = steps.some(
        (step) => step.title.toLowerCase() === missing.title.toLowerCase(),
      );
      if (!known) steps.push(missing);
    }

    const recipe: ImportedRecipe = {
      ...first,
      ingredients: ingredients.map(tidyIngredient),
      steps: steps.map((step) => {
        // A title that is just a number is the file's numbering, not a title.
        if (/^\d+[.)]?$/.test(step.title.trim())) {
          const derived = deriveStepTitle(step.description ?? step.title);
          return {
            title: derived.title || `Step ${steps.indexOf(step) + 1}`,
            description: step.description ?? derived.description,
          };
        }
        return { ...step, title: cleanText(step.title) };
      }),
    };

    // Everything the draft can be said to have read, for the sweep.
    const claimed = [
      recipe.name,
      recipe.notes ?? "",
      ...recipe.tags,
      ...recipe.ingredients.flatMap((line) => [
        line.name,
        line.note ?? "",
        line.groupName ?? "",
      ]),
      ...recipe.steps.flatMap((step) => [step.title, step.description ?? ""]),
    ];

    return {
      ok: true,
      recipe,
      warnings: review.warnings,
      unclaimed: unclaimedLines(file.text, claimed),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The import failed.";
    return { ok: false, error: `Could not read that file: ${message}` };
  }
}
