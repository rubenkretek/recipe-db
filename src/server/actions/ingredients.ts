"use server";

import { revalidatePath } from "next/cache";

import { requireKitchenContext } from "@/lib/kitchen";
import {
  createIngredientSchema,
  mergeIngredientsSchema,
  renameIngredientSchema,
  setDefaultUnitSchema,
} from "@/schemas/ingredient";
import { createClient } from "@/lib/supabase/server";
import type { ActionError } from "@/server/actions/auth";

/** Postgres unique-violation SQLSTATE, used for the dedupe race below. */
const UNIQUE_VIOLATION = "23505";

export type Ingredient = {
  id: string;
  name: string;
  default_unit: string | null;
};

/** Anything that shows an ingredient needs refreshing after a rename or merge. */
function revalidateIngredientViews(): void {
  revalidatePath("/recipes");
  revalidatePath("/settings/ingredients");
  // Every recipe detail and edit page embeds ingredient names, and there is no
  // way to know which ones without a query, so refresh the whole subtree.
  revalidatePath("/recipes/[id]", "page");
  revalidatePath("/recipes/[id]/edit", "page");
}

/**
 * Finds an ingredient by name, case-insensitively, or creates it.
 *
 * The same shape as `findOrCreateTag`: the name keeps the capitalisation the
 * author typed, but the unique index on `(kitchen_id, lower(name))` means
 * "Chicken Breast" can never become a second row alongside "chicken breast".
 *
 * The lookup-then-insert races if two people add the same new ingredient at the
 * same moment, so the insert catches the unique violation and re-reads. The
 * index is the real guarantee; this just turns losing the race into finding
 * what the winner created.
 */
export async function findOrCreateIngredient(
  input: unknown,
): Promise<ActionError | { ingredient: Ingredient }> {
  const parsed = createIngredientSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the name." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();
  const name = parsed.data.name;

  const existing = await supabase
    .from("ingredients")
    .select("id, name, default_unit")
    .eq("kitchen_id", active.id)
    .ilike("name", name)
    .maybeSingle();

  if (existing.data) {
    return { ingredient: existing.data };
  }

  const created = await supabase
    .from("ingredients")
    .insert({ kitchen_id: active.id, name })
    .select("id, name, default_unit")
    .single();

  if (created.data) {
    revalidateIngredientViews();
    return { ingredient: created.data };
  }

  if (created.error?.code === UNIQUE_VIOLATION) {
    const raced = await supabase
      .from("ingredients")
      .select("id, name, default_unit")
      .eq("kitchen_id", active.id)
      .ilike("name", name)
      .maybeSingle();

    if (raced.data) {
      return { ingredient: raced.data };
    }
  }

  return {
    error: created.error?.message ?? "Could not create the ingredient.",
  };
}

/**
 * Renames an ingredient everywhere it is used.
 *
 * One update: `recipe_ingredients` references the ingredient by id, so every
 * recipe follows automatically. SPEC.md §8 Phase 4 acceptance criterion 5.
 */
export async function renameIngredient(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = renameIngredientSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the name." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("ingredients")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.ingredientId)
    .eq("kitchen_id", active.id);

  if (error) {
    return {
      error:
        error.code === UNIQUE_VIOLATION
          ? "An ingredient with that name already exists. Merge them instead."
          : error.message,
    };
  }

  revalidateIngredientViews();
}

/** Sets the unit the recipe editor prefills for this ingredient. */
export async function setDefaultUnit(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = setDefaultUnitSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "That is not a unit we know." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("ingredients")
    .update({ default_unit: parsed.data.defaultUnit })
    .eq("id", parsed.data.ingredientId)
    .eq("kitchen_id", active.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings/ingredients");
}

/**
 * Merges one ingredient into another, repointing every recipe that used it.
 *
 * Goes through the `merge_ingredients` RPC so the repoint and the delete are one
 * transaction: a partial failure would otherwise leave rows pointing at an
 * ingredient that no longer exists. The function is `security invoker`, so the
 * caller's own RLS still applies and nobody can merge another kitchen's rows.
 *
 * A recipe that used both sides keeps two lines. They may carry different units
 * or notes, and adding quantities together is shopping-list logic (SPEC.md
 * §6.3), not recipe logic.
 */
export async function mergeIngredients(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = mergeIngredientsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Pick two ingredients.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("merge_ingredients", {
    source_id: parsed.data.sourceId,
    target_id: parsed.data.targetId,
  });

  if (error) {
    return { error: error.message };
  }

  revalidateIngredientViews();
}
