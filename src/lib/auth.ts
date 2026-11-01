import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * Returns the signed-in user's id, or null if there is no session.
 *
 * Uses getClaims() rather than getUser() because the claims are verified from
 * the JWT locally, with no round trip to Supabase on every render. RLS is the
 * actual authorisation boundary; this is only identification.
 *
 * Wrapped in React's `cache()`, which memoises **for one request only** — a
 * different thing from `unstable_cache`, and without any of its hazards: there
 * is no lifetime to get wrong, nothing is shared between users, and reading
 * `cookies()` inside is perfectly fine. It exists because a single page render
 * asks for the current user several times over.
 */
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
});

/**
 * Returns the signed-in user's id, redirecting to the login page if there is
 * no session. For pages and actions that cannot function without a user.
 */
export async function requireUserId(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }
  return userId;
}

export type Profile = {
  id: string;
  display_name: string;
};

/**
 * The signed-in user's profile row, which is where the display name lives.
 *
 * Separate from requireUserId() because the id comes free from the JWT whereas
 * this costs a query, and most callers only need the id.
 *
 * Per-request memoised, for the same reason as `getCurrentUserId`.
 */
export const requireMyProfile = cache(async (): Promise<Profile> => {
  const userId = await requireUserId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new Error(`Could not load your profile: ${error?.message}`);
  }

  return data;
});
