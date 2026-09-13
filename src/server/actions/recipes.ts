"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUserId } from "@/lib/auth";
import { requireKitchenContext } from "@/lib/kitchen";
import { PHOTO_BUCKET } from "@/lib/photos";
import { toBase } from "@/lib/units";
import { createClient } from "@/lib/supabase/server";
import {
  createRecipeSchema,
  createTagSchema,
  rateRecipeSchema,
  recipeIdSchema,
  updateRecipeSchema,
  type RecipeStepValues,
} from "@/schemas/recipe";
import type { RecipeIngredientValues } from "@/schemas/ingredient";
import type { ActionError } from "@/server/actions/auth";

/** Postgres unique-violation SQLSTATE, used for the tag dedupe race below. */
const UNIQUE_VIOLATION = "23505";

/**
 * Replaces a recipe's tag links with exactly the ids given.
 *
 * Delete-then-insert rather than a diff: with a handful of tags per recipe the
 * saving is meaningless and the diff is more code to get wrong. Every insert
 * sets kitchen_id explicitly rather than inferring it from the parent recipe,
 * per CLAUDE.md "Multi-tenancy".
 */
async function replaceRecipeTags(
  recipeId: string,
  kitchenId: string,
  tagIds: string[],
): Promise<string | null> {
  const supabase = await createClient();

  const { error: clearError } = await supabase
    .from("recipe_tags")
    .delete()
    .eq("recipe_id", recipeId)
    .eq("kitchen_id", kitchenId);

  if (clearError) {
    return clearError.message;
  }

  if (tagIds.length === 0) {
    return null;
  }

  const { error: insertError } = await supabase.from("recipe_tags").insert(
    tagIds.map((tagId) => ({
      recipe_id: recipeId,
      tag_id: tagId,
      kitchen_id: kitchenId,
    })),
  );

  return insertError?.message ?? null;
}

/**
 * Replaces a recipe's ingredient rows with exactly the list given.
 *
 * Delete-then-insert for the same reason as tags: a diff is more code to get
 * wrong for no measurable saving on a list of this size, and it keeps
 * `sort_order` trivially correct — the array index *is* the order.
 *
 * This is where entered units become base units. Everything below this line is
 * grams, millilitres or a count; `display_unit` remembers what was typed so a
 * tablespoon recipe still reads in tablespoons. SPEC.md §5.3.
 */
async function replaceRecipeIngredients(
  recipeId: string,
  kitchenId: string,
  ingredients: RecipeIngredientValues[],
): Promise<string | null> {
  const supabase = await createClient();

  const { error: clearError } = await supabase
    .from("recipe_ingredients")
    .delete()
    .eq("recipe_id", recipeId)
    .eq("kitchen_id", kitchenId);

  if (clearError) {
    return clearError.message;
  }

  if (ingredients.length === 0) {
    return null;
  }

  let rows;
  try {
    rows = ingredients.map((ingredient, index) => {
      const { quantity, unit } = toBase(ingredient.quantity, ingredient.unit);

      return {
        kitchen_id: kitchenId,
        recipe_id: recipeId,
        ingredient_id: ingredient.ingredientId,
        quantity,
        unit,
        // Only meaningful alongside a quantity: "to taste" has no unit to
        // remember. Keeping it null here matches the check constraint.
        display_unit: quantity === null ? null : ingredient.unit,
        note: ingredient.note,
        // The heading this line sits under; a group is a consecutive run of
        // lines sharing it, so `sort_order` is what keeps a group together.
        group_name: ingredient.groupName,
        sort_order: index,
      };
    });
  } catch (error) {
    // toBase throws rather than guessing at an unknown unit. The zod schema
    // should have caught it first, so this is the belt to that pair of braces.
    return error instanceof Error ? error.message : "Unknown unit.";
  }

  const { error: insertError } = await supabase
    .from("recipe_ingredients")
    .insert(rows);

  return insertError?.message ?? null;
}

/**
 * Replaces a recipe's method steps with exactly the list given.
 *
 * Delete-then-insert, the same shape as ingredients: the array index is the
 * order, so reordering needs no bookkeeping.
 *
 * Every photo path is checked against this recipe's own folder. The storage
 * policy already stops an upload landing in another kitchen, but a *row* could
 * otherwise point at a path in a different recipe, or at somebody else's folder
 * whose URL then gets signed on this page.
 *
 * Photos that a step held before this save and no step holds after it are
 * removed from Storage — but only once the new steps are written, so a failed
 * save never costs a photo. Removal is best effort for the same reason as
 * `deletePhoto`: an orphaned file is invisible, a missing one is a broken image.
 */
async function replaceRecipeSteps(
  recipeId: string,
  kitchenId: string,
  steps: RecipeStepValues[],
): Promise<string | null> {
  const folder = `${kitchenId}/${recipeId}/`;
  if (
    steps.some(
      (step) => step.photoPath !== null && !step.photoPath.startsWith(folder),
    )
  ) {
    return "A step photo does not belong to this recipe.";
  }

  const supabase = await createClient();

  const { data: previous, error: readError } = await supabase
    .from("recipe_steps")
    .select("photo_path")
    .eq("recipe_id", recipeId)
    .eq("kitchen_id", kitchenId);

  if (readError) {
    return readError.message;
  }

  const { error: clearError } = await supabase
    .from("recipe_steps")
    .delete()
    .eq("recipe_id", recipeId)
    .eq("kitchen_id", kitchenId);

  if (clearError) {
    return clearError.message;
  }

  if (steps.length > 0) {
    const { error: insertError } = await supabase.from("recipe_steps").insert(
      steps.map((step, index) => ({
        kitchen_id: kitchenId,
        recipe_id: recipeId,
        title: step.title,
        description: step.description,
        photo_path: step.photoPath,
        sort_order: index,
      })),
    );

    if (insertError) {
      return insertError.message;
    }
  }

  const kept = new Set(steps.map((step) => step.photoPath));
  const orphaned = (previous ?? [])
    .map((row) => row.photo_path)
    .filter((path): path is string => path !== null && !kept.has(path));

  if (orphaned.length > 0) {
    await supabase.storage.from(PHOTO_BUCKET).remove(orphaned);
  }

  return null;
}

/** Creates a recipe and goes straight to it. Only the name is required. */
export async function createRecipe(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = createRecipeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const { active } = await requireKitchenContext();
  const userId = await requireUserId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("recipes")
    .insert({
      kitchen_id: active.id,
      created_by: userId,
      name: parsed.data.name,
      meal_type: parsed.data.mealType,
      base_servings: parsed.data.baseServings,
      source_url: parsed.data.sourceUrl,
      notes: parsed.data.notes,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not create the recipe." };
  }

  const tagError = await replaceRecipeTags(
    data.id,
    active.id,
    parsed.data.tagIds,
  );
  if (tagError) {
    return { error: tagError };
  }

  const ingredientError = await replaceRecipeIngredients(
    data.id,
    active.id,
    parsed.data.ingredients,
  );
  if (ingredientError) {
    return { error: ingredientError };
  }

  // A brand new recipe cannot carry step photos — their folder is named after
  // the id created just above — so the folder check rejects any a client sends.
  const stepError = await replaceRecipeSteps(
    data.id,
    active.id,
    parsed.data.steps,
  );
  if (stepError) {
    return { error: stepError };
  }

  revalidatePath("/recipes");
  redirect(`/recipes/${data.id}`);
}

/** Saves an edited recipe. Any member may edit any recipe: SPEC.md §2. */
export async function updateRecipe(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = updateRecipeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("recipes")
    .update({
      name: parsed.data.name,
      meal_type: parsed.data.mealType,
      base_servings: parsed.data.baseServings,
      source_url: parsed.data.sourceUrl,
      notes: parsed.data.notes,
    })
    .eq("id", parsed.data.recipeId)
    .eq("kitchen_id", active.id);

  if (error) {
    return { error: error.message };
  }

  const tagError = await replaceRecipeTags(
    parsed.data.recipeId,
    active.id,
    parsed.data.tagIds,
  );
  if (tagError) {
    return { error: tagError };
  }

  const ingredientError = await replaceRecipeIngredients(
    parsed.data.recipeId,
    active.id,
    parsed.data.ingredients,
  );
  if (ingredientError) {
    return { error: ingredientError };
  }

  const stepError = await replaceRecipeSteps(
    parsed.data.recipeId,
    active.id,
    parsed.data.steps,
  );
  if (stepError) {
    return { error: stepError };
  }

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${parsed.data.recipeId}`);
  redirect(`/recipes/${parsed.data.recipeId}`);
}

/**
 * Archives a recipe. This is the only removal there is: SPEC.md §8 Phase 2
 * specifies soft delete, and the table has no delete policy at all, so an
 * archived recipe can always be restored.
 */
export async function archiveRecipe(
  input: unknown,
): Promise<ActionError | void> {
  return setArchivedAt(input, new Date().toISOString());
}

/** Restores an archived recipe to the main grid. */
export async function restoreRecipe(
  input: unknown,
): Promise<ActionError | void> {
  return setArchivedAt(input, null);
}

async function setArchivedAt(
  input: unknown,
  archivedAt: string | null,
): Promise<ActionError | void> {
  const parsed = recipeIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Unknown recipe." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("recipes")
    .update({ archived_at: archivedAt })
    .eq("id", parsed.data.recipeId)
    .eq("kitchen_id", active.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${parsed.data.recipeId}`);
}

/**
 * Finds a tag by name, case-insensitively, or creates it.
 *
 * The name keeps the capitalisation the author typed, but the unique index on
 * `(kitchen_id, lower(name))` means "Healthy" can never become a second row
 * alongside "healthy". SPEC.md §8 Phase 2 acceptance.
 *
 * The lookup-then-insert has a race if two people add the same new tag at the
 * same moment. Rather than reach for a database function, the insert catches
 * the unique violation and re-reads: the index is the real guarantee, and this
 * just turns losing the race into finding what the winner created.
 */
export async function findOrCreateTag(
  input: unknown,
): Promise<ActionError | { tag: { id: string; name: string } }> {
  const parsed = createTagSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the tag name." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();
  const name = parsed.data.name;

  const existing = await supabase
    .from("tags")
    .select("id, name")
    .eq("kitchen_id", active.id)
    .ilike("name", name)
    .maybeSingle();

  if (existing.data) {
    return { tag: existing.data };
  }

  const created = await supabase
    .from("tags")
    .insert({ kitchen_id: active.id, name })
    .select("id, name")
    .single();

  if (created.data) {
    revalidatePath("/recipes");
    return { tag: created.data };
  }

  if (created.error?.code === UNIQUE_VIOLATION) {
    const raced = await supabase
      .from("tags")
      .select("id, name")
      .eq("kitchen_id", active.id)
      .ilike("name", name)
      .maybeSingle();

    if (raced.data) {
      return { tag: raced.data };
    }
  }

  return { error: created.error?.message ?? "Could not create the tag." };
}

/**
 * Sets the signed-in member's own score on a recipe.
 *
 * Note that the RLS policy on `ratings` is the uniform "members full access"
 * shape from SPEC.md §5.8, so the database would permit writing somebody else's
 * score. This action always writes `auth.uid()`'s own row, which is the only
 * thing the UI ever needs. See CLAUDE.md "Gotchas".
 */
export async function rateRecipe(input: unknown): Promise<ActionError | void> {
  const parsed = rateRecipeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Could not save that." };
  }

  const { active } = await requireKitchenContext();
  const userId = await requireUserId();
  const supabase = await createClient();

  const { error } = await supabase.from("ratings").upsert(
    {
      kitchen_id: active.id,
      recipe_id: parsed.data.recipeId,
      user_id: userId,
      score: parsed.data.score,
    },
    { onConflict: "recipe_id,user_id" },
  );

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${parsed.data.recipeId}`);
}

/**
 * Removes the signed-in member's score, returning the recipe to "Not rated"
 * for them. Deleting the row rather than storing 0 keeps "unrated" and "rated
 * zero" distinguishable.
 */
export async function clearRating(input: unknown): Promise<ActionError | void> {
  const parsed = recipeIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Unknown recipe." };
  }

  const userId = await requireUserId();
  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("ratings")
    .delete()
    .eq("recipe_id", parsed.data.recipeId)
    .eq("user_id", userId)
    .eq("kitchen_id", active.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${parsed.data.recipeId}`);
}
