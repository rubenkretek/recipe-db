"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { ACTIVE_KITCHEN_COOKIE } from "@/lib/kitchen";
import { safeRedirectPath } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";
import { logInSchema, signUpSchema } from "@/schemas/auth";

/**
 * What a server action hands back to a form when something went wrong.
 * Success is signalled by a redirect or a revalidation, never by a payload.
 */
export type ActionError = { error: string };

/**
 * Creates an account and signs the new user in.
 *
 * The display name is passed as options.data.display_name so the profile
 * trigger can read it from raw_user_meta_data. Email confirmation is disabled
 * in the Supabase dashboard, so the session is live immediately and there is no
 * "check your inbox" step. See CLAUDE.md "Gotchas".
 */
export async function signUp(input: unknown): Promise<ActionError | void> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const { displayName, email, password, next } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });

  if (error) {
    return { error: error.message };
  }

  // A brand new user belongs to no kitchen yet, so send them where they can
  // make or join one, unless an invite link is waiting for them to come back.
  // SPEC.md §8 Phase 1 acceptance.
  redirect(safeRedirectPath(next) ?? "/kitchens");
}

/** Signs an existing user in and drops them on the dashboard. */
export async function logIn(input: unknown): Promise<ActionError | void> {
  const parsed = logInSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const { email, password, next } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect(safeRedirectPath(next) ?? "/");
}

/**
 * Signs the user out and forgets which kitchen they were in.
 *
 * Clearing the cookie matters on a shared device: without it the next person to
 * sign in would inherit a stale kitchen id. It would be ignored (membership is
 * re-checked on every resolution) but leaving it behind is untidy.
 */
export async function logOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_KITCHEN_COOKIE);

  redirect("/login");
}
