import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/database.types";

/**
 * Creates a Supabase client for use in Client Components.
 *
 * Only needed where the browser talks to Supabase directly. Mutations go
 * through server actions instead, so this is deliberately rare.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
