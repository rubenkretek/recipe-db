import { describe, expect, it } from "vitest";

import {
  collapseToggle,
  discardedCount,
  resolveReplay,
  togglesToSend,
  type PendingToggle,
} from "@/lib/offline-queue";

const ONIONS = "11111111-1111-1111-1111-111111111111";
const MILK = "22222222-2222-2222-2222-222222222222";

const SEEN = "2026-09-06T10:00:00.000000+00:00";
const LATER = "2026-09-06T10:05:00.000000+00:00";

function toggle(overrides: Partial<PendingToggle> = {}): PendingToggle {
  return {
    itemId: ONIONS,
    isChecked: true,
    seenUpdatedAt: SEEN,
    queuedAt: 1_000,
    ...overrides,
  };
}

describe("collapseToggle", () => {
  it("adds a tick for an item not already queued", () => {
    expect(collapseToggle([], toggle())).toEqual([toggle()]);
  });

  it("collapses repeated taps on the same item into the final state", () => {
    // Tapping four times offline is one change, not four round trips.
    let queue = collapseToggle([], toggle({ isChecked: true, queuedAt: 1 }));
    queue = collapseToggle(queue, toggle({ isChecked: false, queuedAt: 2 }));
    queue = collapseToggle(queue, toggle({ isChecked: true, queuedAt: 3 }));
    queue = collapseToggle(queue, toggle({ isChecked: false, queuedAt: 4 }));

    expect(queue).toHaveLength(1);
    expect(queue[0].isChecked).toBe(false);
    expect(queue[0].queuedAt).toBe(4);
  });

  it("keeps the originally seen updated_at when collapsing", () => {
    // The first tap is the last moment this client agreed with the server.
    // Later taps are against local state, so their seenUpdatedAt is meaningless
    // and must not overwrite the real one.
    const first = toggle({ seenUpdatedAt: SEEN, queuedAt: 1 });
    const second = toggle({ seenUpdatedAt: LATER, queuedAt: 2, isChecked: false });

    const queue = collapseToggle(collapseToggle([], first), second);

    expect(queue[0].seenUpdatedAt).toBe(SEEN);
    expect(queue[0].isChecked).toBe(false);
  });

  it("keeps separate items separate", () => {
    const queue = collapseToggle(
      collapseToggle([], toggle({ itemId: ONIONS })),
      toggle({ itemId: MILK }),
    );

    expect(queue.map((one) => one.itemId)).toEqual([ONIONS, MILK]);
  });
});

describe("resolveReplay", () => {
  it("applies a tick when nothing has changed on the server", () => {
    const decisions = resolveReplay(
      [toggle()],
      [{ id: ONIONS, updatedAt: SEEN }],
    );

    expect(decisions).toEqual([{ kind: "apply", toggle: toggle() }]);
  });

  it("discards a tick the server has moved past", () => {
    // Somebody else wrote to this item while we were offline, so their change
    // is the later real write and ours loses.
    const decisions = resolveReplay(
      [toggle()],
      [{ id: ONIONS, updatedAt: LATER }],
    );

    expect(decisions[0].kind).toBe("superseded");
  });

  it("discards a tick for a row that no longer exists", () => {
    // Deleted, or its list was archived by a plan completing — §6.4 copies
    // unchecked items onto a new list with new ids, so this row is unreachable.
    const decisions = resolveReplay([toggle()], []);

    expect(decisions[0].kind).toBe("gone");
  });

  it("judges each queued tick independently", () => {
    const decisions = resolveReplay(
      [toggle({ itemId: ONIONS }), toggle({ itemId: MILK })],
      [
        { id: ONIONS, updatedAt: SEEN },
        { id: MILK, updatedAt: LATER },
      ],
    );

    expect(decisions.map((one) => one.kind)).toEqual(["apply", "superseded"]);
  });

  it("never compares clocks, so a skewed phone changes nothing", () => {
    // queuedAt is wildly wrong in both directions; only seenUpdatedAt matters.
    const fromTheFuture = toggle({ queuedAt: 9_999_999_999_999 });
    const fromThePast = toggle({ itemId: MILK, queuedAt: 0 });

    const decisions = resolveReplay(
      [fromTheFuture, fromThePast],
      [
        { id: ONIONS, updatedAt: SEEN },
        { id: MILK, updatedAt: SEEN },
      ],
    );

    expect(decisions.map((one) => one.kind)).toEqual(["apply", "apply"]);
  });
});

describe("togglesToSend", () => {
  it("sends only the applicable ticks, oldest first", () => {
    const decisions = resolveReplay(
      [
        toggle({ itemId: MILK, queuedAt: 500 }),
        toggle({ itemId: ONIONS, queuedAt: 100 }),
      ],
      [
        { id: MILK, updatedAt: SEEN },
        { id: ONIONS, updatedAt: SEEN },
      ],
    );

    expect(togglesToSend(decisions).map((one) => one.itemId)).toEqual([
      ONIONS,
      MILK,
    ]);
  });

  it("sends nothing when everything was superseded", () => {
    const decisions = resolveReplay(
      [toggle()],
      [{ id: ONIONS, updatedAt: LATER }],
    );

    expect(togglesToSend(decisions)).toEqual([]);
  });
});

describe("discardedCount", () => {
  it("counts everything that will not be sent", () => {
    const decisions = resolveReplay(
      [
        toggle({ itemId: ONIONS }),
        toggle({ itemId: MILK }),
        toggle({ itemId: "33333333-3333-3333-3333-333333333333" }),
      ],
      [
        { id: ONIONS, updatedAt: SEEN },
        { id: MILK, updatedAt: LATER },
      ],
    );

    // One applies, one superseded, one gone.
    expect(discardedCount(decisions)).toBe(2);
  });

  it("counts nothing when everything applies", () => {
    const decisions = resolveReplay(
      [toggle()],
      [{ id: ONIONS, updatedAt: SEEN }],
    );

    expect(discardedCount(decisions)).toBe(0);
  });
});
