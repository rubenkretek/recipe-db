"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireUserId } from "@/lib/auth";
import { ACTIVE_KITCHEN_COOKIE } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";
import {
  createKitchenSchema,
  inviteIdSchema,
  kitchenIdSchema,
  redeemInviteSchema,
  renameKitchenSchema,
} from "@/schemas/kitchen";
import type { ActionError } from "@/server/actions/auth";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

/**
 * Writes the active kitchen cookie.
 *
 * Callers must have already established that the user is a member. Nothing here
 * checks, because this is a private helper and every caller in this file either
 * just created the membership or verified it.
 */
async function writeActiveKitchenCookie(kitchenId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_KITCHEN_COOKIE, kitchenId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_IN_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

/**
 * Creates a kitchen and makes the caller its first member.
 *
 * Goes through the create_kitchen RPC rather than a direct insert, because
 * kitchen_members has no insert policy: the first membership row could not
 * otherwise be written. See CLAUDE.md "Gotchas".
 */
export async function createKitchen(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = createKitchenSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const supabase = await createClient();
  const { data: kitchenId, error } = await supabase.rpc("create_kitchen", {
    kitchen_name: parsed.data.name,
  });

  if (error || !kitchenId) {
    return { error: error?.message ?? "Could not create the kitchen." };
  }

  // A newly created kitchen becomes the active one, otherwise creating a second
  // kitchen would silently leave you looking at the first.
  await writeActiveKitchenCookie(kitchenId);
  redirect("/");
}

/**
 * Joins the caller to a kitchen using a shared code.
 *
 * Goes through the redeem_invite RPC because kitchen_invites is readable only
 * by members, and someone holding a code is by definition not a member yet.
 * See CLAUDE.md "Gotchas".
 */
export async function redeemInvite(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = redeemInviteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the code." };
  }

  const supabase = await createClient();
  const { data: kitchenId, error } = await supabase.rpc("redeem_invite", {
    invite_code: parsed.data.code,
  });

  if (error || !kitchenId) {
    return { error: "That code is not valid, or it has expired." };
  }

  await writeActiveKitchenCookie(kitchenId);
  redirect("/");
}

/**
 * Changes which kitchen the user is looking at.
 *
 * Membership is verified here rather than trusted, because the kitchen id
 * arrives from a form. See CLAUDE.md "Multi-tenancy".
 */
export async function switchKitchen(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = kitchenIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Unknown kitchen." };
  }

  const userId = await requireUserId();
  const supabase = await createClient();

  const { data: membership } = await supabase
    .from("kitchen_members")
    .select("kitchen_id")
    .eq("kitchen_id", parsed.data.kitchenId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return { error: "You are not a member of that kitchen." };
  }

  await writeActiveKitchenCookie(parsed.data.kitchenId);
  revalidatePath("/", "layout");
}

/** Renames a kitchen. Any member may do this: all members are equal, SPEC.md §2. */
export async function renameKitchen(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = renameKitchenSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("kitchens")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.kitchenId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
}

/**
 * Mints a fresh 7-day join code, superseding any live one. SPEC.md §9 decision 2.
 *
 * Regenerating revokes the previous code rather than leaving both working, so
 * there is only ever one answer to "what is our code?". The schema allows many
 * live invites per kitchen; this is a product decision, not a database one.
 */
export async function createInvite(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = kitchenIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Unknown kitchen." };
  }

  const supabase = await createClient();

  const { error: revokeError } = await supabase
    .from("kitchen_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("kitchen_id", parsed.data.kitchenId)
    .is("revoked_at", null);

  if (revokeError) {
    return { error: revokeError.message };
  }

  const { error } = await supabase.rpc("create_invite", {
    target_kitchen_id: parsed.data.kitchenId,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings/kitchen");
}

/** Revokes a join code so it can no longer be redeemed. */
export async function revokeInvite(input: unknown): Promise<ActionError | void> {
  const parsed = inviteIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Unknown invite." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("kitchen_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data.inviteId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings/kitchen");
}

/**
 * Removes the caller from a kitchen.
 *
 * Leaving as the only member is refused: nobody could ever reach the kitchen
 * again, and deleting kitchens is not in Phase 1 scope. The RLS delete policy
 * already limits this to your own membership row, so there is no way to remove
 * anybody else.
 */
export async function leaveKitchen(
  input: unknown,
): Promise<ActionError | void> {
  const parsed = kitchenIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Unknown kitchen." };
  }

  const userId = await requireUserId();
  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("kitchen_members")
    .select("user_id", { count: "exact", head: true })
    .eq("kitchen_id", parsed.data.kitchenId);

  if (countError) {
    return { error: countError.message };
  }

  if ((count ?? 0) <= 1) {
    return {
      error:
        "You are the only member of this kitchen, so you cannot leave it yet.",
    };
  }

  const { error } = await supabase
    .from("kitchen_members")
    .delete()
    .eq("kitchen_id", parsed.data.kitchenId)
    .eq("user_id", userId);

  if (error) {
    return { error: error.message };
  }

  // The cookie may now point at a kitchen the user has just left. Dropping it
  // makes the next resolution fall back to one they are still in.
  const cookieStore = await cookies();
  if (cookieStore.get(ACTIVE_KITCHEN_COOKIE)?.value === parsed.data.kitchenId) {
    cookieStore.delete(ACTIVE_KITCHEN_COOKIE);
  }

  redirect("/kitchens");
}
