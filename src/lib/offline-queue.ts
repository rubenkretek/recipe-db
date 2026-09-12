/**
 * Deciding which queued offline ticks still apply when the connection returns.
 * SPEC.md §8 Phase 8.
 *
 * Pure: no database access, no Dexie, no browser APIs. §10 calls offline sync
 * "the classic source of subtle bugs", and this module is where those bugs would
 * live, so it is testable in isolation.
 *
 * **Conflict resolution is compare-and-swap, not clock comparison.** §8 asks for
 * "last-write-wins by `updated_at`", which read literally means comparing the
 * server's `updated_at` against the time of the tap. Those are two different
 * clocks — a database trigger sets one, a phone sets the other — so a phone a
 * minute out of step would either overwrite a newer change or discard its own.
 *
 * Instead a queued tick records the `updated_at` it *saw* when it was queued. On
 * replay, if the server still holds that exact value, nothing has happened since
 * and the tick applies. If it differs, somebody else has written and the queued
 * tick loses. No clocks are compared, so skew cannot affect the outcome, and the
 * effective behaviour is the one §8 wants: the later real write wins.
 */

/** One tick waiting to reach the server. */
export type PendingToggle = {
  itemId: string;
  /** The state the tap asked for, not the delta. */
  isChecked: boolean;
  /**
   * The item's `updated_at` as it stood when this was queued. The compare half
   * of the compare-and-swap; see the module note above.
   */
  seenUpdatedAt: string;
  /** Epoch milliseconds. Ordering and "queued 3 minutes ago" only, never compared to the server. */
  queuedAt: number;
};

/** What the server currently holds for an item the queue wants to change. */
export type ServerItemState = {
  id: string;
  updatedAt: string;
};

export type ReplayDecision =
  /** Nothing changed since it was queued: send it. */
  | { kind: "apply"; toggle: PendingToggle }
  /** Somebody else wrote to this item after the tick was queued. Drop it. */
  | { kind: "superseded"; toggle: PendingToggle }
  /** The row is gone — deleted, or the list was archived by a plan completion. */
  | { kind: "gone"; toggle: PendingToggle };

/**
 * Adds a tick to the queue, replacing any earlier one for the same item.
 *
 * Tapping the same item four times offline is one change, not four: only the
 * final state matters, and replaying the intermediate states would be four
 * round trips to reach the same place.
 *
 * `seenUpdatedAt` is deliberately taken from the **existing** queued entry when
 * there is one. The first tap is the last moment this client agreed with the
 * server about the item; every tap after that is against its own local state, so
 * carrying the original value keeps the compare-and-swap honest.
 */
export function collapseToggle(
  pending: PendingToggle[],
  next: PendingToggle,
): PendingToggle[] {
  const existing = pending.find((one) => one.itemId === next.itemId);

  if (!existing) {
    return [...pending, next];
  }

  return pending.map((one) =>
    one.itemId === next.itemId
      ? { ...next, seenUpdatedAt: existing.seenUpdatedAt }
      : one,
  );
}

/**
 * Works out what to do with every queued tick, given what the server now holds.
 *
 * An item absent from `serverItems` is `gone` rather than `apply`: it was
 * deleted, or its list was archived by a plan completing while this client was
 * offline, and §6.4 copies unchecked items onto a *new* list with new ids — so
 * the row this tick names no longer exists to be ticked.
 */
export function resolveReplay(
  pending: PendingToggle[],
  serverItems: ServerItemState[],
): ReplayDecision[] {
  const byId = new Map(serverItems.map((item) => [item.id, item]));

  return pending.map((toggle) => {
    const server = byId.get(toggle.itemId);

    if (!server) {
      return { kind: "gone" as const, toggle };
    }

    if (server.updatedAt !== toggle.seenUpdatedAt) {
      return { kind: "superseded" as const, toggle };
    }

    return { kind: "apply" as const, toggle };
  });
}

/**
 * The ticks that should actually be sent, oldest first.
 *
 * Ordered by `queuedAt` so a burst of offline taps reaches the server in the
 * order they were made. Within one client that ordering is meaningful even
 * though the timestamps are never compared against the server's.
 */
export function togglesToSend(decisions: ReplayDecision[]): PendingToggle[] {
  return decisions
    .filter((decision) => decision.kind === "apply")
    .map((decision) => decision.toggle)
    .sort((a, b) => a.queuedAt - b.queuedAt);
}

/**
 * How many queued ticks were thrown away, for the toast that says so.
 *
 * Silently discarding somebody's tick is worse than telling them: they ticked
 * five things in a shop and expect five things ticked. SPEC.md §8 Phase 8
 * decision 10.
 */
export function discardedCount(decisions: ReplayDecision[]): number {
  return decisions.filter((decision) => decision.kind !== "apply").length;
}
