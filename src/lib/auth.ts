import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Returns the signed-in user's id, or null if there is no session.
 *
 * Uses getClaims() rather than getUser() because the claims are verified from
 * the JWT locally, with no round trip to Supabase on every render. RLS is the
 * actual authorisation boundary; this is only identification.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
}

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
 */
export async function requireMyProfile(): Promise<Profile> {
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
}
