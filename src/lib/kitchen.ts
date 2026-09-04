import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireUserId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Name of the cookie holding the active kitchen id.
 *
 * The active kitchen is never taken from a form field or URL parameter, because
 * that would let anyone name any kitchen id. It comes from here, and membership
 * is re-checked on every resolution. See CLAUDE.md "Multi-tenancy".
 */
export const ACTIVE_KITCHEN_COOKIE = "active_kitchen";

export type Kitchen = {
  id: string;
  name: string;
};

export type KitchenContext = {
  /** Every kitchen the user belongs to, earliest membership first. */
  kitchens: Kitchen[];
  /** The one they are currently looking at, or null if they have none. */
  active: Kitchen | null;
};

/**
 * Loads every kitchen the user belongs to and works out which one is active.
 *
 * The cookie is a hint, not an authority. If it names a kitchen the user is not
 * a member of — a stale cookie, or one edited by hand — it is ignored and the
 * earliest-joined kitchen is used instead. Membership is established by the row
 * coming back at all, since RLS filters the query.
 *
 * This returns both halves together because the app shell needs the list for
 * the switcher and the active one for everything else, and splitting it would
 * mean running the same query twice per request.
 */
export async function getKitchenContext(): Promise<KitchenContext> {
  const userId = await requireUserId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("kitchen_members")
    .select("joined_at, kitchens (id, name)")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true });

  if (error) {
    throw new Error(`Could not load kitchens: ${error.message}`);
  }

  const kitchens = (data ?? [])
    .map((row) => row.kitchens)
    .filter((kitchen): kitchen is Kitchen => kitchen !== null);

  if (kitchens.length === 0) {
    return { kitchens, active: null };
  }

  const cookieStore = await cookies();
  const requestedId = cookieStore.get(ACTIVE_KITCHEN_COOKIE)?.value;

  return {
    kitchens,
    active:
      kitchens.find((kitchen) => kitchen.id === requestedId) ?? kitchens[0],
  };
}

/**
 * Loads the kitchen context, sending the user to the kitchens screen if they do
 * not belong to one yet. For anything that cannot render without a kitchen.
 */
export async function requireKitchenContext(): Promise<
  KitchenContext & { active: Kitchen }
> {
  const context = await getKitchenContext();
  if (!context.active) {
    redirect("/kitchens");
  }
  return { ...context, active: context.active };
}
