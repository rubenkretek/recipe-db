"use server";

import { revalidatePath } from "next/cache";

import { requireKitchenContext } from "@/lib/kitchen";
import { MAX_PHOTOS_PER_RECIPE, PHOTO_BUCKET } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";
import {
  movePhotoSchema,
  photoIdSchema,
  recordPhotoSchema,
} from "@/schemas/photo";
import type { ActionError } from "@/server/actions/auth";

/** Refreshes both places a photo can appear: the grid and the recipe itself. */
function revalidatePhotoViews(recipeId: string): void {
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath(`/recipes/${recipeId}/edit`);
}

/**
 * Records a photo the browser has already uploaded to Storage.
 *
 * Deliberately does not carry the bytes. Uploads go straight from the browser to
 * Storage, because a Next.js server action caps its request body at 1MB and
 * routing the file through the Next server would double the bandwidth for no
 * gain. The RLS policy on `storage.objects` is what stops a photo being filed
 * into another kitchen's folder. See CLAUDE.md "Gotchas".
 *
 * The path is re-checked against the active kitchen here as well, so a row can
 * never point at a folder this kitchen does not own even if the client lies.
 */
export async function recordPhoto(input: unknown): Promise<ActionError | void> {
  const parsed = recordPhotoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Could not save that." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const [pathKitchenId, pathRecipeId] = parsed.data.storagePath.split("/");
  if (pathKitchenId !== active.id || pathRecipeId !== parsed.data.recipeId) {
    return { error: "That photo does not belong to this recipe." };
  }

  const { data: existing, error: countError } = await supabase
    .from("recipe_photos")
    .select("sort_order")
    .eq("recipe_id", parsed.data.recipeId)
    .eq("kitchen_id", active.id)
    .order("sort_order", { ascending: false })
    .limit(MAX_PHOTOS_PER_RECIPE + 1);

  if (countError) {
    return { error: countError.message };
  }

  if ((existing?.length ?? 0) >= MAX_PHOTOS_PER_RECIPE) {
    return {
      error: `A recipe can hold ${MAX_PHOTOS_PER_RECIPE} photos. Remove one first.`,
    };
  }

  // New photos land at the end, so uploading never silently changes the cover.
  const nextSortOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("recipe_photos").insert({
    kitchen_id: active.id,
    recipe_id: parsed.data.recipeId,
    storage_path: parsed.data.storagePath,
    sort_order: nextSortOrder,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePhotoViews(parsed.data.recipeId);
}

/**
 * Removes a photo.
 *
 * The row goes first and the storage object second, on a best-effort basis. The
 * failure modes are asymmetric: an orphaned file is invisible and costs a few
 * hundred kilobytes, whereas a row whose object has gone renders as a broken
 * image on every visit.
 */
export async function deletePhoto(input: unknown): Promise<ActionError | void> {
  const parsed = photoIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Unknown photo." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { data: photo, error: findError } = await supabase
    .from("recipe_photos")
    .select("id, recipe_id, storage_path")
    .eq("id", parsed.data.photoId)
    .eq("kitchen_id", active.id)
    .maybeSingle();

  if (findError) {
    return { error: findError.message };
  }
  if (!photo) {
    return { error: "That photo no longer exists." };
  }

  const { error: deleteError } = await supabase
    .from("recipe_photos")
    .delete()
    .eq("id", photo.id)
    .eq("kitchen_id", active.id);

  if (deleteError) {
    return { error: deleteError.message };
  }

  await supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);

  revalidatePhotoViews(photo.recipe_id);
}

/**
 * Moves a photo one place earlier or later, by swapping sort orders with its
 * neighbour. The photo with the lowest sort order is the cover, so moving the
 * second photo earlier is how you change the cover one step at a time.
 */
export async function movePhoto(input: unknown): Promise<ActionError | void> {
  const parsed = movePhotoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Unknown photo." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { data: photo } = await supabase
    .from("recipe_photos")
    .select("id, recipe_id, sort_order")
    .eq("id", parsed.data.photoId)
    .eq("kitchen_id", active.id)
    .maybeSingle();

  if (!photo) {
    return { error: "That photo no longer exists." };
  }

  const movingEarlier = parsed.data.direction === "earlier";

  // Neighbour by position rather than by sort_order arithmetic, because deletes
  // leave gaps and sort orders are not guaranteed contiguous.
  const { data: neighbour } = await supabase
    .from("recipe_photos")
    .select("id, sort_order")
    .eq("recipe_id", photo.recipe_id)
    .eq("kitchen_id", active.id)
    [movingEarlier ? "lt" : "gt"]("sort_order", photo.sort_order)
    .order("sort_order", { ascending: !movingEarlier })
    .limit(1)
    .maybeSingle();

  if (!neighbour) {
    // Already at the end it was heading for. Not an error worth surfacing.
    return;
  }

  const swap = await Promise.all([
    supabase
      .from("recipe_photos")
      .update({ sort_order: neighbour.sort_order })
      .eq("id", photo.id)
      .eq("kitchen_id", active.id),
    supabase
      .from("recipe_photos")
      .update({ sort_order: photo.sort_order })
      .eq("id", neighbour.id)
      .eq("kitchen_id", active.id),
  ]);

  const failure = swap.find((result) => result.error);
  if (failure?.error) {
    return { error: failure.error.message };
  }

  revalidatePhotoViews(photo.recipe_id);
}

/**
 * Promotes a photo straight to cover, rather than making the user press "move
 * earlier" repeatedly. Renumbers the whole recipe so sort orders stay tidy.
 */
export async function makeCover(input: unknown): Promise<ActionError | void> {
  const parsed = photoIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Unknown photo." };
  }

  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { data: photo } = await supabase
    .from("recipe_photos")
    .select("id, recipe_id")
    .eq("id", parsed.data.photoId)
    .eq("kitchen_id", active.id)
    .maybeSingle();

  if (!photo) {
    return { error: "That photo no longer exists." };
  }

  const { data: siblings, error: listError } = await supabase
    .from("recipe_photos")
    .select("id, sort_order")
    .eq("recipe_id", photo.recipe_id)
    .eq("kitchen_id", active.id)
    .order("sort_order", { ascending: true });

  if (listError) {
    return { error: listError.message };
  }

  const reordered = [
    photo.id,
    ...(siblings ?? [])
      .map((sibling) => sibling.id)
      .filter((id) => id !== photo.id),
  ];

  const updates = await Promise.all(
    reordered.map((id, index) =>
      supabase
        .from("recipe_photos")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("kitchen_id", active.id),
    ),
  );

  const failure = updates.find((result) => result.error);
  if (failure?.error) {
    return { error: failure.error.message };
  }

  revalidatePhotoViews(photo.recipe_id);
}
