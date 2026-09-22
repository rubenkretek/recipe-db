"use server";

import { revalidatePath } from "next/cache";

import { requireUserId } from "@/lib/auth";
import { requireKitchenContext } from "@/lib/kitchen";
import { scaleQuantityForShopping } from "@/lib/servings";
import {
  combineRecipeLines,
  incrementedQuantity,
  planShoppingListAdditions,
  type ExistingItem,
  type MergeCandidate,
} from "@/lib/shopping-merge";
import { createClient } from "@/lib/supabase/server";
import { canMerge, toBase } from "@/lib/units";
import {
  addIngredientsSchema,
  addManualItemSchema,
  itemIdSchema,
  setItemCheckedSchema,
  setItemQuantitySchema,
  setItemSupermarketsSchema,
} from "@/schemas/shopping";
import type { ActionError } from "@/server/actions/auth";

/**
 * Refreshes everywhere the list or its counts are visible.
 *
 * The plan screen carries the "6 of 8 added" subtitle and the dashboard the
 * unchecked count, so neither can be left behind by a change made on the
 * shopping screen or in the picker.
 */
function revalidateShoppingViews(): void {
  revalidatePath("/shopping");
  revalidatePath("/plan");
  revalidatePath("/");
}

/**
 * The active list's id, creating one if the kitchen has never started a list.
 *
 * Completing a plan creates the next list, so this only ever inserts on the
 * very first use. It lives here rather than in a Server Component because a
 * component cannot write during render — the same shape as `ensureActivePlanId`.
 */
async function ensureActiveListId(
  kitchenId: string,
): Promise<{ listId: string } | ActionError> {
  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("kitchen_id", kitchenId)
    .eq("status", "active")
    .maybeSingle();

  if (readError) {
    return { error: readError.message };
  }
  if (existing) {
    return { listId: existing.id };
  }

  // Linked to the active plan when there is one: nullable precisely because you
  // can shop without planning.
  const { data: plan } = await supabase
    .from("meal_plans")
    .select("id")
    .eq("kitchen_id", kitchenId)
    .eq("status", "active")
    .maybeSingle();

  const { data: created, error: insertError } = await supabase
    .from("shopping_lists")
    .insert({ kitchen_id: kitchenId, meal_plan_id: plan?.id ?? null })
    .select("id")
    .single();

  if (insertError) {
    return { error: insertError.message };
  }

  return { listId: created.id };
}

/**
 * Sends ticked ingredients from the picker to the shopping list. SPEC.md §6.3.
 *
 * The client sends only identifiers. Quantities are recomputed here from the
 * recipe and the planned servings, so a tampered request cannot state its own
 * amount and the scaling goes through one path.
 *
 * The decision of what merges into what is made by the pure planner in
 * `shopping-merge.ts`; this function only carries it out.
 */
export async function addIngredientsToList(
  input: unknown,
): Promise<ActionError | { added: number }> {
  const parsed = addIngredientsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nothing to add." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const plannedRecipeIds = [
    ...new Set(parsed.data.selections.map((one) => one.plannedRecipeId)),
  ];

  // Scoped to the kitchen, so a planned-recipe id from elsewhere reads as absent.
  const { data: planned, error: plannedError } = await supabase
    .from("meal_plan_recipes")
    .select(
      `id, servings,
       recipes ( base_servings, recipe_ingredients ( ingredient_id, quantity, unit, group_name ) )`,
    )
    .eq("kitchen_id", active.id)
    .in("id", plannedRecipeIds);

  if (plannedError) {
    return { error: plannedError.message };
  }
  if (!planned || planned.length === 0) {
    return { error: "Those recipes are not on a plan in this kitchen." };
  }

  const candidates = await buildCandidates(
    active.id,
    parsed.data.selections,
    planned as unknown as PlannedRecipeRow[],
  );

  if (candidates.length === 0) {
    return { error: "Nothing to add." };
  }

  const list = await ensureActiveListId(active.id);
  if ("error" in list) {
    return list;
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("shopping_list_items")
    .select("id, ingredient_id, quantity, unit, is_checked")
    .eq("kitchen_id", active.id)
    .eq("shopping_list_id", list.listId);

  if (existingError) {
    return { error: existingError.message };
  }

  const existing: ExistingItem[] = (existingRows ?? []).map((row) => ({
    id: row.id,
    ingredientId: row.ingredient_id,
    quantity: row.quantity === null ? null : Number(row.quantity),
    unit: row.unit,
    isChecked: row.is_checked,
  }));

  const operations = planShoppingListAdditions(existing, candidates);
  const currentQuantities = new Map(
    existing.map((item) => [item.id, item.quantity]),
  );

  for (const operation of operations) {
    if (operation.kind === "keep") {
      continue;
    }

    if (operation.kind === "increment") {
      const { error } = await supabase
        .from("shopping_list_items")
        .update({
          quantity: incrementedQuantity(
            currentQuantities.get(operation.itemId) ?? null,
            operation.addQuantity,
          ),
        })
        .eq("id", operation.itemId)
        .eq("kitchen_id", active.id);

      if (error) {
        return { error: error.message };
      }
      continue;
    }

    const { data: createdItem, error: createError } = await supabase
      .from("shopping_list_items")
      .insert({
        kitchen_id: active.id,
        shopping_list_id: list.listId,
        ingredient_id: operation.ingredientId,
        quantity: operation.quantity,
        unit: operation.unit,
      })
      .select("id")
      .single();

    if (createError) {
      return { error: createError.message };
    }

    // Copied, not linked: reassigning the ingredient later will not move this
    // item. SPEC.md §5.7 and CLAUDE.md "Gotchas".
    if (operation.supermarketIds.length > 0) {
      const { error } = await supabase
        .from("shopping_list_item_supermarkets")
        .insert(
          operation.supermarketIds.map((supermarketId) => ({
            kitchen_id: active.id,
            item_id: createdItem.id,
            supermarket_id: supermarketId,
          })),
        );

      if (error) {
        return { error: error.message };
      }
    }
  }

  // Step 5 of §6.3. `upsert` because the same pair can legitimately be sent
  // again later — adding an already-added ingredient again is allowed.
  //
  // Recorded per ingredient, not per unit or per recipe line: line ids are
  // replaced on every recipe save, so anything keyed to them would be wiped by
  // an edit. The pairs are deduplicated first, because one ingredient ticked in
  // two units is two selections with the same pair, and Postgres refuses an
  // upsert that touches the same row twice in one statement.
  const addedPairs = new Map(
    parsed.data.selections.map((one) => [
      `${one.plannedRecipeId}:${one.ingredientId}`,
      {
        kitchen_id: active.id,
        meal_plan_recipe_id: one.plannedRecipeId,
        ingredient_id: one.ingredientId,
      },
    ]),
  );
  const { error: recordError } = await supabase
    .from("meal_plan_recipe_added_ingredients")
    .upsert([...addedPairs.values()], {
      onConflict: "meal_plan_recipe_id,ingredient_id",
    });

  if (recordError) {
    return { error: recordError.message };
  }

  revalidateShoppingViews();
  return { added: operations.length };
}

type PlannedRecipeRow = {
  id: string;
  servings: number;
  recipes: {
    base_servings: number;
    recipe_ingredients: {
      ingredient_id: string;
      quantity: number | null;
      unit: string | null;
      group_name: string | null;
    }[];
  } | null;
};

/**
 * Turns the picker's selections into merge candidates.
 *
 * Quantities come from the recipe and are scaled to the servings the recipe is
 * planned for, then rounded up for counts. Supermarket assignments are read now
 * and copied onto anything created, per SPEC.md §5.7.
 */
async function buildCandidates(
  kitchenId: string,
  rawSelections: {
    plannedRecipeId: string;
    ingredientId: string;
    unit: string | null;
  }[],
  planned: PlannedRecipeRow[],
): Promise<MergeCandidate[]> {
  const supabase = await createClient();
  const byPlannedId = new Map(planned.map((row) => [row.id, row]));

  // One candidate per picker row. A request repeating a selection must not
  // double its quantity.
  const selections = [
    ...new Map(
      rawSelections.map((one) => [
        `${one.plannedRecipeId}:${one.ingredientId}:${one.unit ?? ""}`,
        one,
      ]),
    ).values(),
  ];

  // Each planned recipe's lines, with repeats of one ingredient in one unit
  // already summed — the same rows the picker showed. See `combineRecipeLines`.
  const combinedByPlannedId = new Map(
    planned.map((row) => [
      row.id,
      combineRecipeLines(
        (row.recipes?.recipe_ingredients ?? []).map((line) => ({
          ingredientId: line.ingredient_id,
          quantity: line.quantity === null ? null : Number(line.quantity),
          unit: line.unit,
          groupName: line.group_name,
        })),
      ),
    ]),
  );

  const ingredientIds = [...new Set(selections.map((one) => one.ingredientId))];

  const { data: assignments } = await supabase
    .from("ingredient_supermarkets")
    .select("ingredient_id, supermarket_id")
    .eq("kitchen_id", kitchenId)
    .in("ingredient_id", ingredientIds);

  const supermarketsByIngredient = new Map<string, string[]>();
  for (const row of assignments ?? []) {
    const current = supermarketsByIngredient.get(row.ingredient_id) ?? [];
    current.push(row.supermarket_id);
    supermarketsByIngredient.set(row.ingredient_id, current);
  }

  const candidates: MergeCandidate[] = [];

  for (const selection of selections) {
    const plannedRecipe = byPlannedId.get(selection.plannedRecipeId);
    const line = combinedByPlannedId
      .get(selection.plannedRecipeId)
      ?.find(
        (row) =>
          row.ingredientId === selection.ingredientId &&
          canMerge(row.unit, selection.unit),
      );

    // A selection naming an ingredient the recipe does not have is silently
    // dropped rather than guessed at.
    if (!plannedRecipe || !line) {
      continue;
    }

    candidates.push({
      ingredientId: selection.ingredientId,
      quantity: scaleQuantityForShopping(
        line.quantity,
        line.unit,
        plannedRecipe.recipes?.base_servings ?? 1,
        plannedRecipe.servings,
      ),
      unit: line.unit,
      supermarketIds: supermarketsByIngredient.get(selection.ingredientId) ?? [],
    });
  }

  return candidates;
}

/**
 * Ticks an item, or unticks it.
 *
 * The item exists once however many shops it appears under, so this removes it
 * from every supermarket view at once. SPEC.md §5.7 and §8 acceptance
 * criterion 4.
 */
export async function setItemChecked(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = setItemCheckedSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Unknown item." };
  }

  const { active } = await requireKitchenContext();
  const userId = await requireUserId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("shopping_list_items")
    .update({
      is_checked: parsed.data.isChecked,
      // Cleared on unticking, so the "Got it" section never attributes an item
      // nobody has actually bought.
      checked_by: parsed.data.isChecked ? userId : null,
      checked_at: parsed.data.isChecked ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.itemId)
    .eq("kitchen_id", active.id);

  if (error) {
    return { error: error.message };
  }

  revalidateShoppingViews();
}

/** Adds a free-text item. No quantity, no unit. SPEC.md §7. */
export async function addManualItem(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = addManualItemSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the name." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const list = await ensureActiveListId(active.id);
  if ("error" in list) {
    return list;
  }

  const { data: created, error } = await supabase
    .from("shopping_list_items")
    .insert({
      kitchen_id: active.id,
      shopping_list_id: list.listId,
      manual_name: parsed.data.name,
    })
    .select("id")
    .single();

  if (error || !created) {
    return { error: error?.message ?? "Could not add that item." };
  }

  // Filed under whichever shop the list was filtered to. No membership check is
  // needed: the composite foreign key on (supermarket_id, kitchen_id) refuses a
  // shop belonging to another kitchen outright. See CLAUDE.md "Multi-tenancy".
  if (parsed.data.supermarketId) {
    const { error: linkError } = await supabase
      .from("shopping_list_item_supermarkets")
      .insert({
        kitchen_id: active.id,
        item_id: created.id,
        supermarket_id: parsed.data.supermarketId,
      });

    if (linkError) {
      return { error: linkError.message };
    }
  }

  revalidateShoppingViews();
}

/**
 * Edits an item's quantity.
 *
 * Entered in whatever unit suits and converted by the same `toBase` the recipe
 * editor uses, so the database only ever holds grams, millilitres or a count.
 */
export async function setItemQuantity(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = setItemQuantitySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the quantity." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const base = toBase(parsed.data.quantity, parsed.data.unit);

  const { error } = await supabase
    .from("shopping_list_items")
    .update({ quantity: base.quantity, unit: base.unit })
    .eq("id", parsed.data.itemId)
    .eq("kitchen_id", active.id);

  if (error) {
    return { error: error.message };
  }

  revalidateShoppingViews();
}

/**
 * Replaces an item's supermarkets.
 *
 * Unlike the ingredient-level control, this changes **only this item**: the
 * assignments were copied when it was created and are independently editable
 * from then on. SPEC.md §5.7.
 */
export async function setItemSupermarkets(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = setItemSupermarketsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Unknown item or supermarket." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { error: clearError } = await supabase
    .from("shopping_list_item_supermarkets")
    .delete()
    .eq("item_id", parsed.data.itemId)
    .eq("kitchen_id", active.id);

  if (clearError) {
    return { error: clearError.message };
  }

  // An empty set is meaningful: it puts the item in the Unassigned group.
  if (parsed.data.supermarketIds.length > 0) {
    const { error } = await supabase
      .from("shopping_list_item_supermarkets")
      .insert(
        parsed.data.supermarketIds.map((supermarketId) => ({
          kitchen_id: active.id,
          item_id: parsed.data.itemId,
          supermarket_id: supermarketId,
        })),
      );

    if (error) {
      return { error: error.message };
    }
  }

  revalidateShoppingViews();
}

/** Removes one item from the list. */
export async function deleteItem(input: unknown): Promise<ActionError | void> {
  const parsed = itemIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Unknown item." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("id", parsed.data.itemId)
    .eq("kitchen_id", active.id);

  if (error) {
    return { error: error.message };
  }

  revalidateShoppingViews();
}

/**
 * Empties the active list. SPEC.md §7.
 *
 * Deletes every item, checked or not, and is destructive: the UI puts it behind
 * a confirmation. Distinct from completing a plan, which archives the list and
 * carries the unchecked items over.
 */
export async function clearList(): Promise<ActionError | void> {
  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { data: list } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("kitchen_id", active.id)
    .eq("status", "active")
    .maybeSingle();

  if (!list) {
    return;
  }

  const { error } = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("kitchen_id", active.id)
    .eq("shopping_list_id", list.id);

  if (error) {
    return { error: error.message };
  }

  revalidateShoppingViews();
}
