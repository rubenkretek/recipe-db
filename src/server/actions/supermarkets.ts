"use server";

import { revalidatePath } from "next/cache";

import { requireKitchenContext } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";
import {
  createSupermarketSchema,
  renameSupermarketSchema,
  reorderSupermarketsSchema,
  setIngredientSupermarketsSchema,
  supermarketIdSchema,
} from "@/schemas/supermarket";
import type { ActionError } from "@/server/actions/auth";

/** Postgres unique-violation SQLSTATE, for the case-insensitive name index. */
const UNIQUE_VIOLATION = "23505";

/**
 * Refreshes everywhere a supermarket or an assignment is visible.
 *
 * Assignments are edited from three places — the settings card, the ingredient
 * manager and inline on the recipe editor — so a change in any one of them has
 * to reach the other two.
 */
function revalidateSupermarketViews(): void {
  revalidatePath("/settings/kitchen");
  revalidatePath("/settings/ingredients");
  revalidatePath("/recipes/[id]/edit", "page");
}

/** Adds a supermarket, placed last in the ordering. */
export async function createSupermarket(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = createSupermarketSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the name." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("supermarkets")
    .select("sort_order")
    .eq("kitchen_id", active.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("supermarkets").insert({
    kitchen_id: active.id,
    name: parsed.data.name,
    sort_order: (last?.sort_order ?? -1) + 1,
  });

  if (error) {
    return {
      error:
        error.code === UNIQUE_VIOLATION
          ? "You already have a supermarket with that name."
          : error.message,
    };
  }

  revalidateSupermarketViews();
}

/** Renames a supermarket. Assignments follow automatically: they key on the id. */
export async function renameSupermarket(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = renameSupermarketSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the name." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("supermarkets")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.supermarketId)
    .eq("kitchen_id", active.id);

  if (error) {
    return {
      error:
        error.code === UNIQUE_VIOLATION
          ? "You already have a supermarket with that name."
          : error.message,
    };
  }

  revalidateSupermarketViews();
}

/**
 * Writes a new ordering.
 *
 * The order is user-facing rather than incidental: it becomes the order of the
 * supermarket chips on the Phase 7 shopping screen, which is walked in aisle
 * order with a trolley.
 */
export async function reorderSupermarkets(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = reorderSupermarketsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Unknown supermarket order." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const updates = await Promise.all(
    parsed.data.supermarketIds.map((id, index) =>
      supabase
        .from("supermarkets")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("kitchen_id", active.id),
    ),
  );

  const failure = updates.find((result) => result.error);
  if (failure?.error) {
    return { error: failure.error.message };
  }

  revalidateSupermarketViews();
}

/**
 * Deletes a supermarket.
 *
 * Unlike ingredients — which recipes depend on, hence `on delete restrict` —
 * a supermarket can genuinely be removed: the cascade takes only the assignment
 * rows, and no ingredient is harmed. The confirmation in the UI says how many
 * ingredients lose the assignment, because that is the part that is not obvious.
 */
export async function deleteSupermarket(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = supermarketIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Unknown supermarket." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("supermarkets")
    .delete()
    .eq("id", parsed.data.supermarketId)
    .eq("kitchen_id", active.id);

  if (error) {
    return { error: error.message };
  }

  revalidateSupermarketViews();
}

/**
 * Replaces every supermarket assignment for one ingredient.
 *
 * Delete-then-insert rather than a diff, matching `replaceRecipeTags` and
 * `replaceRecipeIngredients`: with a handful of shops the saving is meaningless
 * and a diff is more code to get wrong.
 *
 * This is **ingredient-level shared state**. Assigning "chicken breast" to Aldi
 * from inside one recipe changes it for every recipe that uses chicken breast,
 * which is why the inline control says so and saves immediately rather than
 * pretending to be part of the recipe form. See CLAUDE.md "Gotchas".
 */
export async function setIngredientSupermarkets(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = setIngredientSupermarketsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Unknown ingredient or supermarket." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { error: clearError } = await supabase
    .from("ingredient_supermarkets")
    .delete()
    .eq("ingredient_id", parsed.data.ingredientId)
    .eq("kitchen_id", active.id);

  if (clearError) {
    return { error: clearError.message };
  }

  // An empty set is meaningful: it means "nowhere in particular", which is what
  // puts an ingredient in the Unassigned group. SPEC.md §8 Phase 5.
  if (parsed.data.supermarketIds.length === 0) {
    revalidateSupermarketViews();
    return;
  }

  const { error } = await supabase.from("ingredient_supermarkets").insert(
    parsed.data.supermarketIds.map((supermarketId) => ({
      ingredient_id: parsed.data.ingredientId,
      supermarket_id: supermarketId,
      kitchen_id: active.id,
    })),
  );

  if (error) {
    return { error: error.message };
  }

  revalidateSupermarketViews();
}
