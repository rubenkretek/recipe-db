"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that makes the app installable and usable
 * offline. SPEC.md §8 Phase 8.
 *
 * Production only. In development the cache-first rule on `/_next/static/`
 * would serve stale chunks and break hot reloading, and an installed worker
 * outlives the dev server that installed it — which is a genuinely confusing
 * afternoon. `npm run start` sets production, so that is how it gets tested
 * locally.
 *
 * Renders nothing.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // Registration needs a secure context: HTTPS in production, and localhost
    // is treated as secure, so both work without special handling.
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // A browser that refuses the worker still runs the whole app online.
      // Nothing here is worth interrupting somebody for.
    });
  }, []);

  return null;
}
