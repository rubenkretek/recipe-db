"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * The TanStack Query cache. SPEC.md §4 and §8 Phase 8.
 *
 * Only the shopping list uses it — everything else is server-rendered and
 * mutates through server actions, which is still the rule. It exists because
 * Realtime needs somewhere to push changes into and the offline queue needs
 * somewhere to read the current state from.
 *
 * Created inside `useState` rather than at module scope, so each request gets
 * its own cache during server rendering. A module-level client would be shared
 * across every user the Node process serves — one household's shopping list
 * leaking into another's render.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Realtime pushes changes, so polling would be waste. This only
            // governs the refetch on a remount or a window focus, which is the
            // safety net for a missed event.
            staleTime: 30_000,
            // Offline, a retry storm achieves nothing and drains a phone.
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
