"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUserId } from "@/lib/auth";
import { requireKitchenContext } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";
import {
  createRecipeSchema,
  createTagSchema,
  rateRecipeSchema,
  recipeIdSchema,
  updateRecipeSchema,
} from "@/schemas/recipe";
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
      method: parsed.data.method,
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
      method: parsed.data.method,
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
