"use server";

import {
  listIngredientAliases,
  listIngredients,
} from "@/lib/ingredients";
import { matchIngredientName, type IngredientMatch } from "@/lib/import-parse";
import { requireKitchenContext } from "@/lib/kitchen";
import { extractRecipe } from "@/lib/recipe-import";
import { listTags } from "@/lib/recipes";
import { importFileSchema, type ImportedIngredient } from "@/schemas/import";
import type { MealType } from "@/schemas/recipe";
import type { ActionError } from "@/server/actions/auth";

/** An imported ingredient with its standing against the kitchen's own list. */
export type DraftIngredient = ImportedIngredient & { match: IngredientMatch };

/** A tag the file asked for, and whether the kitchen already has it. */
export type DraftTag = { name: string; existingId: string | null };

export type RecipeDraft = {
  name: string;
  mealType: MealType;
  baseServings: number;
  sourceUrl: string | null;
  notes: string | null;
  tags: DraftTag[];
  ingredients: DraftIngredient[];
  steps: { title: string; description: string | null }[];
  /** Things the checking pass thought a person should look at. */
  warnings: string[];
  /** Lines of the file nothing in the draft accounts for. */
  unclaimed: string[];
};

/**
 * Reads a dropped file into a draft recipe, writing nothing.
 *
 * Deliberately a server action rather than the route handler SPEC.md §8
 * describes: the file is a few kilobytes of text the browser has already read,
 * so the 1MB action body limit is irrelevant, and this way the import inherits
 * the session and kitchen context every other mutation uses instead of needing
 * its own authentication.
 *
 * **Nothing is created here** — not the recipe, not its tags, not its
 * ingredients. The draft goes back to the browser, the user corrects it, and
 * the existing `createRecipe` writes it. An import the user abandons leaves no
 * trace, which is the whole reason the review step exists.
 */
export async function importRecipeFile(
  input: unknown,
): Promise<ActionError | { draft: RecipeDraft }> {
  const parsed = importFileSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the file." };
  }

  // Membership, before spending anything on a model call.
  await requireKitchenContext();

  const outcome = await extractRecipe(parsed.data);
  if (!outcome.ok) {
    return { error: outcome.error };
  }

  const [ingredients, aliases, tags] = await Promise.all([
    listIngredients(),
    listIngredientAliases(),
    listTags(),
  ]);

  const known = ingredients.map((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
  }));

  return {
    draft: {
      name: outcome.recipe.name,
      mealType: outcome.recipe.mealType,
      baseServings: outcome.recipe.baseServings,
      sourceUrl: outcome.recipe.sourceUrl,
      notes: outcome.recipe.notes,
      tags: outcome.recipe.tags.map((name) => ({
        name,
        existingId:
          tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase())
            ?.id ?? null,
      })),
      ingredients: outcome.recipe.ingredients.map((ingredient) => ({
        ...ingredient,
        match: matchIngredientName(ingredient.name, known, aliases),
      })),
      steps: outcome.recipe.steps,
      warnings: outcome.warnings,
      unclaimed: outcome.unclaimed,
    },
  };
}
