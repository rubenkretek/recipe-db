import Dexie, { type EntityTable } from "dexie";

import { collapseToggle, type PendingToggle } from "@/lib/offline-queue";

/**
 * The browser-side store for ticks made without a connection.
 * SPEC.md §8 Phase 8.
 *
 * Deliberately tiny. §10 keeps the offline surface to "one table and one
 * operation, toggling checked" — nothing else in the app works offline, so
 * nothing else is stored here. The shopping list itself is not mirrored: the
 * service worker's cached page supplies the base state and this queue is
 * overlaid on top of it, which is the same answer with one moving part fewer.
 *
 * Everything here degrades to a no-op rather than throwing. IndexedDB is absent
 * during server rendering and can be refused outright in a private window, and
 * neither should stop the shopping list working online.
 */

const DATABASE_NAME = "recipe-db-offline";

type OfflineDatabase = Dexie & {
  pendingToggles: EntityTable<PendingToggle, "itemId">;
};

let database: OfflineDatabase | null = null;

/**
 * The Dexie instance, or null where IndexedDB does not exist.
 *
 * Created lazily rather than at module scope because a `"use client"` module is
 * still executed on the server during SSR, where there is no IndexedDB at all.
 */
function db(): OfflineDatabase | null {
  if (typeof indexedDB === "undefined") {
    return null;
  }

  if (!database) {
    const instance = new Dexie(DATABASE_NAME) as OfflineDatabase;
    // Keyed by itemId, so a repeated tap on the same item replaces rather than
    // appends. queuedAt is indexed for the oldest-first replay ordering.
    instance.version(1).stores({ pendingToggles: "itemId, queuedAt" });
    database = instance;
  }

  return database;
}

/** Every tick still waiting to reach the server, or an empty list. */
export async function readQueue(): Promise<PendingToggle[]> {
  const instance = db();
  if (!instance) return [];

  try {
    return await instance.pendingToggles.toArray();
  } catch {
    return [];
  }
}

/**
 * Records a tick made offline, collapsing it into any earlier one for the item.
 *
 * The collapsing rule lives in `offline-queue.ts` so it is the same code the
 * tests exercise — including the part that keeps the *originally* seen
 * `updated_at` rather than the one attached to this tap.
 */
export async function queueToggle(toggle: PendingToggle): Promise<void> {
  const instance = db();
  if (!instance) return;

  try {
    const pending = await instance.pendingToggles.toArray();
    const collapsed = collapseToggle(pending, toggle);
    const merged = collapsed.find((one) => one.itemId === toggle.itemId);

    if (merged) {
      await instance.pendingToggles.put(merged);
    }
  } catch {
    // A queue that cannot be written is not worth failing a tap over: the tick
    // still applies locally and will simply not survive a reload.
  }
}

/** Removes ticks that have been sent, superseded or dropped. */
export async function clearQueued(itemIds: string[]): Promise<void> {
  const instance = db();
  if (!instance || itemIds.length === 0) return;

  try {
    await instance.pendingToggles.bulkDelete(itemIds);
  } catch {
    // Ignored: a stale queue entry replays harmlessly, because the
    // compare-and-swap in offline-queue.ts refuses anything already applied.
  }
}

/**
 * Wipes every trace of the list from this browser.
 *
 * Called on sign-out. Without it a queued tick and the service worker's cached
 * copy of the shopping page — which contains the list itself, because the page
 * is server-rendered — would outlive the session on a shared device.
 */
export async function clearOfflineData(): Promise<void> {
  const instance = db();

  if (instance) {
    try {
      await instance.pendingToggles.clear();
    } catch {
      // Nothing useful to do; the cache clearing below still matters.
    }
  }

  if (typeof caches !== "undefined") {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    } catch {
      // Same: best effort.
    }
  }
}
