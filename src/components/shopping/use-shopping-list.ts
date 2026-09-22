"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";

import { clearQueued, queueToggle, readQueue } from "@/lib/offline-db";
import {
  discardedCount,
  resolveReplay,
  togglesToSend,
} from "@/lib/offline-queue";
import {
  ITEM_SELECT,
  sortItems,
  toShoppingItem,
  type ShoppingItem,
  type ShoppingItemRow,
} from "@/lib/shopping-format";
import { createClient } from "@/lib/supabase/client";

/** Three states, exactly as SPEC.md §8 asks for. */
export type ConnectionState = "online" | "offline" | "syncing";

export type ShoppingListState = {
  items: ShoppingItem[];
  connection: ConnectionState;
  /** How many ticks are waiting to reach the server. */
  pendingCount: number;
  toggle: (item: ShoppingItem) => void;
  /**
   * Refetches the list now.
   *
   * For the mutations that still go through a server action — delete, edit a
   * quantity, change an item's shops. Those revalidate the *server* route, but
   * the rows on screen come from this cache, which is seeded from props once on
   * mount and never re-reads them. Without this a delete stays on screen until
   * a full page load.
   */
  refresh: () => void;
};

/** Subscribes to the browser's own connectivity events. */
function subscribeToConnectivity(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Whether the browser thinks it has a network.
 *
 * `useSyncExternalStore` rather than an effect writing state: connectivity is
 * an external store, which is exactly what this hook is for, and reading it in
 * an effect trips `react-hooks/set-state-in-effect`. The server snapshot is
 * `true` because there is no network stack to ask during rendering, and the
 * value corrects itself on hydration.
 *
 * It reports the network interface, not whether Supabase is reachable — so a
 * failed write falls back to the queue as well.
 */
function useIsOnline(): boolean {
  return useSyncExternalStore(
    subscribeToConnectivity,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * The shopping list's live, offline-tolerant data.
 * SPEC.md §8 Phase 8.
 *
 * Three things happen here that do not happen anywhere else in the app:
 *
 * 1. **Writes go from the browser straight to Supabase**, not through a server
 *    action. A server action is a request to the Next server, so it cannot work
 *    with no connection, and a queued one cannot be replayed after a deploy
 *    because its action id changes. RLS is the security boundary, exactly as it
 *    is for photo uploads. Every other shopping mutation keeps its server action.
 * 2. **Realtime invalidates rather than patches.** A Postgres Changes payload
 *    carries the raw row and none of its embedded relations, so a tick would
 *    arrive without the ingredient's name or the ticker's display name.
 *    Refetching a household-sized list costs one small round trip and is always
 *    right; patching would need the relations reconstructed by hand.
 * 3. **A tick made offline is queued and replayed** under the compare-and-swap
 *    in `offline-queue.ts`.
 */
export function useShoppingList({
  listId,
  initialItems,
}: {
  /** Null when the kitchen has never started a list; nothing to subscribe to. */
  listId: string | null;
  /** Server-rendered, so the first paint needs no client fetch. */
  initialItems: ShoppingItem[];
}): ShoppingListState {
  const queryClient = useQueryClient();
  const [supabase] = useState(() => createClient());
  const isOnline = useIsOnline();
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Memoised so it can be an honest dependency of the callbacks below rather
  // than a new array on every render.
  const queryKey = useMemo(() => ["shopping-items", listId] as const, [listId]);

  const { data: items = initialItems } = useQuery({
    queryKey,
    enabled: listId !== null,
    initialData: initialItems,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopping_list_items")
        .select(ITEM_SELECT)
        .eq("shopping_list_id", listId!);

      if (error) throw new Error(error.message);

      return sortItems(
        (data as unknown as ShoppingItemRow[]).map(toShoppingItem),
      );
    },
  });

  /** Overlays the queue on whatever was fetched, so an offline tick stays visible. */
  const applyQueueToCache = useCallback(async () => {
    const pending = await readQueue();
    setPendingCount(pending.length);

    if (pending.length === 0) return;

    queryClient.setQueryData<ShoppingItem[]>(queryKey, (current) =>
      (current ?? []).map((item) => {
        const queued = pending.find((one) => one.itemId === item.id);
        return queued ? { ...item, isChecked: queued.isChecked } : item;
      }),
    );
  }, [queryClient, queryKey]);

  /**
   * Sends everything the queue still holds, dropping what no longer applies.
   *
   * The `.eq("updated_at", …)` filter is the swap half of the compare-and-swap:
   * the decision was made against a row read a moment ago, and this makes the
   * write refuse to land if anything changed in between.
   */
  const replayQueue = useCallback(async () => {
    const pending = await readQueue();
    if (pending.length === 0) {
      setPendingCount(0);
      return;
    }

    setIsSyncing(true);

    try {
      const { data, error } = await supabase
        .from("shopping_list_items")
        .select("id, updated_at")
        .in(
          "id",
          pending.map((one) => one.itemId),
        );

      if (error) throw new Error(error.message);

      const decisions = resolveReplay(
        pending,
        (data ?? []).map((row) => ({ id: row.id, updatedAt: row.updated_at })),
      );

      for (const toggle of togglesToSend(decisions)) {
        await supabase
          .from("shopping_list_items")
          .update({ is_checked: toggle.isChecked })
          .eq("id", toggle.itemId)
          .eq("updated_at", toggle.seenUpdatedAt);
      }

      await clearQueued(pending.map((one) => one.itemId));
      setPendingCount(0);

      const dropped = discardedCount(decisions);
      if (dropped > 0) {
        // Saying so beats silence: they ticked five things and expect five.
        toast.warning(
          `${dropped} ${dropped === 1 ? "change" : "changes"} could not be applied — somebody else got there first.`,
        );
      }

      await queryClient.invalidateQueries({ queryKey });
    } catch {
      // Still offline, or the round trip failed. The queue is untouched and the
      // next time connectivity returns it tries again.
    } finally {
      setIsSyncing(false);
    }
  }, [supabase, queryClient, queryKey]);

  // On mount, and whenever connectivity returns: show anything queued from a
  // previous session, then try to send it. This is what makes "tick five, kill
  // the app, reopen, reconnect" work.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await applyQueueToCache();
      if (!cancelled && isOnline) {
        await replayQueue();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyQueueToCache, replayQueue, isOnline]);

  // Realtime. The filter is bound to one list, so another kitchen's traffic
  // never reaches this client at all, and RLS refuses it besides.
  useEffect(() => {
    if (!listId) return;

    const channel = supabase
      .channel(`shopping-list-${listId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shopping_list_items",
          filter: `shopping_list_id=eq.${listId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, queryClient, queryKey, listId]);

  const toggle = useCallback(
    (item: ShoppingItem) => {
      const next = !item.isChecked;

      // Local first, always: a tap must land instantly whether or not there is
      // a connection to send it over.
      queryClient.setQueryData<ShoppingItem[]>(queryKey, (current) =>
        (current ?? []).map((one) =>
          one.id === item.id ? { ...one, isChecked: next } : one,
        ),
      );

      void (async () => {
        async function queue() {
          await queueToggle({
            itemId: item.id,
            isChecked: next,
            seenUpdatedAt: item.updatedAt,
            queuedAt: Date.now(),
          });
          const pending = await readQueue();
          setPendingCount(pending.length);
        }

        if (!navigator.onLine) {
          await queue();
          return;
        }

        const { data: user } = await supabase.auth.getUser();

        // No compare-and-swap guard here, unlike the replay. A tick made online
        // is made against state seen moments ago, so it should win; the guard
        // exists for changes that sat in a queue while the world moved on.
        const { error } = await supabase
          .from("shopping_list_items")
          .update({
            is_checked: next,
            checked_by: next ? (user.user?.id ?? null) : null,
            checked_at: next ? new Date().toISOString() : null,
          })
          .eq("id", item.id);

        if (error) {
          // `navigator.onLine` said yes and the write still failed, which is
          // the normal shape of a supermarket connection.
          await queue();
        }
      })();
    },
    [queryClient, queryKey, supabase],
  );

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const connection: ConnectionState = isSyncing
    ? "syncing"
    : isOnline
      ? "online"
      : "offline";

  return { items, connection, pendingCount, toggle, refresh };
}
