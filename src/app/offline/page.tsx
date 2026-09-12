import { CloudOff } from "lucide-react";

/**
 * The service worker's fallback for a page it has never cached.
 * SPEC.md §8 Phase 8.
 *
 * Deliberately outside the `(app)` group: that layout calls
 * `requireKitchenContext`, which needs the database, which is exactly what is
 * unavailable when this page is being shown. It has no data of its own for the
 * same reason.
 */
export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
      <CloudOff className="text-muted-foreground size-8" />
      <h1 className="text-lg font-semibold">No connection</h1>
      <p className="text-muted-foreground text-sm">
        This page has not been opened on this phone before, so there is nothing
        saved to show. The shopping list works offline once you have opened it
        at least once.
      </p>
    </div>
  );
}
