"use server";

import { revalidatePath } from "next/cache";

import { requireUserId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateProfileSchema } from "@/schemas/profile";
import type { ActionError } from "@/server/actions/auth";

/**
 * Changes the signed-in user's display name.
 *
 * Writes to profiles rather than to auth user metadata. The metadata is only
 * ever read once, by the signup trigger, so keeping it in step afterwards would
 * be two sources of truth for no gain.
 */
export async function updateDisplayName(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const userId = await requireUserId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName })
    .eq("id", userId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
}
