"use client";

import { Check, CloudOff, RefreshCw } from "lucide-react";

import type { ConnectionState } from "@/components/shopping/use-shopping-list";

/**
 * Says whether ticks are reaching the server. SPEC.md §8 Phase 8.
 *
 * Only on the shopping screen, because it is the only screen that works
 * offline: a global indicator would be promising something the rest of the app
 * cannot do.
 *
 * "Online" is deliberately quiet — a permanent green badge is noise, and the
 * thing worth interrupting someone for is the state where their taps are not
 * landing yet.
 */
export function ConnectionIndicator({
  connection,
  pendingCount,
}: {
  connection: ConnectionState;
  pendingCount: number;
}) {
  if (connection === "online" && pendingCount === 0) {
    return (
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Check className="size-3.5" />
        Saved
      </p>
    );
  }

  if (connection === "syncing") {
    return (
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <RefreshCw className="size-3.5 animate-spin" />
        Syncing…
      </p>
    );
  }

  return (
    <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500">
      <CloudOff className="size-3.5" />
      {pendingCount === 0
        ? "Offline — ticks are saved on this phone"
        : `Offline — ${pendingCount} ${
            pendingCount === 1 ? "tick" : "ticks"
          } waiting to sync`}
    </p>
  );
}
