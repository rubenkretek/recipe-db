"use client";

import { ClipboardCopy, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { ShoppingItemRow } from "@/components/shopping/shopping-item";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ALL_SUPERMARKETS,
  UNASSIGNED_GROUP,
  filterBySupermarket,
  groupItemsBySupermarket,
  shoppingListText,
  type ShoppingItem,
} from "@/lib/shopping-format";
import type { Supermarket } from "@/lib/supermarkets";
import {
  addManualItem,
  clearList,
  setItemChecked,
} from "@/server/actions/shopping";

/**
 * The shopping screen. SPEC.md §7.
 *
 * Ticking is optimistic through `useOptimistic`, so a tap lands instantly on a
 * patchy supermarket connection rather than waiting for a round trip. This is
 * **not** live between phones: Realtime and the offline queue are Phase 8, so
 * the other person's ticks appear on the next refresh.
 */
export function ShoppingScreen({
  items,
  supermarkets,
}: {
  items: ShoppingItem[];
  supermarkets: Supermarket[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>(ALL_SUPERMARKETS);
  const [, startTransition] = useTransition();

  const [optimisticItems, applyTick] = useOptimistic(
    items,
    (current: ShoppingItem[], tick: { itemId: string; isChecked: boolean }) =>
      current.map((item) =>
        item.id === tick.itemId ? { ...item, isChecked: tick.isChecked } : item,
      ),
  );

  function toggle(item: ShoppingItem) {
    startTransition(async () => {
      applyTick({ itemId: item.id, isChecked: !item.isChecked });

      const result = await setItemChecked({
        itemId: item.id,
        isChecked: !item.isChecked,
      });

      if (result?.error) {
        toast.error(result.error);
      }
      router.refresh();
    });
  }

  const hasUnassigned = optimisticItems.some(
    (item) => item.supermarketIds.length === 0,
  );

  const visible = filterBySupermarket(optimisticItems, selected);
  const unchecked = visible.filter((item) => !item.isChecked);
  const checked = visible.filter((item) => item.isChecked);

  // Under "All" the unchecked items are grouped by shop, which is how the list
  // is actually walked. Under one shop the grouping would be a single heading
  // repeating the chip, so it is flat.
  const groups =
    selected === ALL_SUPERMARKETS
      ? groupItemsBySupermarket(unchecked, supermarkets)
      : [{ supermarketId: selected, name: "", items: unchecked }];

  return (
    <div className="flex flex-col gap-4">
      {(supermarkets.length > 0 || hasUnassigned) && (
        <SupermarketChips
          supermarkets={supermarkets}
          hasUnassigned={hasUnassigned}
          selected={selected}
          onSelect={setSelected}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={unchecked.length === 0}
          onClick={() => {
            const text = shoppingListText(
              optimisticItems,
              supermarkets,
              selected,
            );
            // The clipboard API needs a secure context and can be refused
            // outright. Failing silently would look like the button is broken.
            navigator.clipboard.writeText(text).then(
              () => toast.success("Copied."),
              () => toast.error("Could not reach the clipboard."),
            );
          }}
        >
          <ClipboardCopy className="size-4" />
          Copy
        </Button>

        <ClearListButton itemCount={optimisticItems.length} />
      </div>

      {optimisticItems.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center text-sm">
          Nothing on the list. Add ingredients from the plan, or type something
          below.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {unchecked.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
              All done here.
            </p>
          ) : (
            groups.map((group) => (
              <section
                key={group.supermarketId ?? UNASSIGNED_GROUP}
                className="flex flex-col gap-1.5"
              >
                {group.name && (
                  <h2 className="text-sm font-medium">
                    {group.name}
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      ({group.items.length})
                    </span>
                  </h2>
                )}
                <ul className="flex flex-col rounded-lg border">
                  {group.items.map((item) => (
                    <ShoppingItemRow
                      key={item.id}
                      item={item}
                      supermarkets={supermarkets}
                      onToggle={() => toggle(item)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}

          {checked.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <h2 className="text-muted-foreground text-sm font-medium">
                Got it ({checked.length})
              </h2>
              <ul className="flex flex-col rounded-lg border">
                {checked.map((item) => (
                  <ShoppingItemRow
                    key={item.id}
                    item={item}
                    supermarkets={supermarkets}
                    onToggle={() => toggle(item)}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <ManualItemForm />
    </div>
  );
}

/**
 * The supermarket selector. SPEC.md §7.
 *
 * "All" first, then the shops in the order the household arranged them in
 * settings — that order is walked with a trolley, which is why it is
 * user-editable. "Unassigned" appears only when something is actually
 * unassigned, so it is not permanent clutter.
 */
function SupermarketChips({
  supermarkets,
  hasUnassigned,
  selected,
  onSelect,
}: {
  supermarkets: Supermarket[];
  hasUnassigned: boolean;
  selected: string;
  onSelect: (value: string) => void;
}) {
  const chips = [
    { value: ALL_SUPERMARKETS, label: "All" },
    ...supermarkets.map((one) => ({ value: one.id, label: one.name })),
    ...(hasUnassigned
      ? [{ value: UNASSIGNED_GROUP, label: UNASSIGNED_GROUP }]
      : []),
  ];

  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
      {chips.map((chip) => (
        <button
          key={chip.value}
          type="button"
          aria-pressed={selected === chip.value}
          onClick={() => onSelect(chip.value)}
          className={
            selected === chip.value
              ? "bg-primary text-primary-foreground shrink-0 rounded-full px-3.5 py-1.5 text-sm"
              : "shrink-0 rounded-full border px-3.5 py-1.5 text-sm"
          }
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

/** Empties the list. Destructive, so it asks first. SPEC.md §7. */
function ClearListButton({ itemCount }: { itemCount: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive"
          disabled={itemCount === 0}
        >
          <Trash2 className="size-4" />
          Clear
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear the whole list?</AlertDialogTitle>
          <AlertDialogDescription>
            All {itemCount} {itemCount === 1 ? "item" : "items"} are deleted,
            ticked or not. Completing the plan instead keeps the unticked ones
            and carries them onto the next list.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await clearList();
                if (result?.error) {
                  toast.error(result.error);
                } else {
                  toast.success("List cleared.");
                  router.refresh();
                }
              });
            }}
          >
            Clear
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The free-text add box, pinned below the list. SPEC.md §7.
 *
 * Free-text items have no quantity and no unit, and never merge into anything:
 * two lines both reading "birthday candles" are not obviously the same thing.
 */
function ManualItemForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="bg-background sticky bottom-0 flex gap-2 border-t py-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;

        startTransition(async () => {
          const result = await addManualItem({ name });
          if (result?.error) {
            toast.error(result.error);
            return;
          }
          setName("");
          router.refresh();
        });
      }}
    >
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Add anything else"
        aria-label="New item"
      />
      <Button type="submit" variant="secondary" disabled={isPending}>
        <Plus className="size-4" />
        Add
      </Button>
    </form>
  );
}
