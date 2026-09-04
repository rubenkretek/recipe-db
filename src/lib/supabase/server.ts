import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/database.types";

/**
 * Creates a request-scoped Supabase client for Server Components, server
 * actions and route handlers.
 *
 * A new client is created per call rather than shared in a module-level
 * variable, because each one closes over the cookies of a single request.
 * Reusing one across requests would leak sessions between users.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components cannot set cookies. This is safe to swallow
            // because the proxy refreshes the session on every request.
          }
        },
      },
    },
  );
}
