"use client";

import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { MoreVertical, Pencil, Store, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatItemLine, type ShoppingItem } from "@/lib/shopping-format";
import type { Supermarket } from "@/lib/supermarkets";
import { INPUT_UNITS } from "@/lib/units";
import {
  deleteItem,
  setItemQuantity,
  setItemSupermarkets,
} from "@/server/actions/shopping";

/** Sentinel for "no unit", since a Select item cannot have an empty value. */
const NO_UNIT = "none";

/**
 * One line on the shopping list. SPEC.md §7.
 *
 * The whole row toggles, with a tap target around 56px tall, because this is
 * used one-handed while pushing a trolley. The trailing menu holds everything
 * else — §7 offers a long-press as an alternative, but a long-press fights the
 * scroll gesture on a list you are thumbing through, and nothing advertises it.
 */
export function ShoppingItemRow({
  item,
  supermarkets,
  onToggle,
}: {
  item: ShoppingItem;
  supermarkets: Supermarket[];
  onToggle: () => void;
}) {
  const [editingQuantity, setEditingQuantity] = useState(false);
  const [editingSupermarkets, setEditingSupermarkets] = useState(false);

  return (
    <li className="flex items-stretch gap-1 border-b last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={item.isChecked}
        className="flex min-h-14 flex-1 items-center gap-3 px-3 text-left"
      >
        {/* Not a real checkbox: the row is the control, and a nested
            interactive element would swallow the tap. */}
        <span
          aria-hidden
          className={
            item.isChecked
              ? "flex size-5 shrink-0 items-center justify-center rounded border-2 border-emerald-600 bg-emerald-600 text-[11px] font-bold text-white"
              : "size-5 shrink-0 rounded border-2"
          }
        >
          {item.isChecked ? "✓" : ""}
        </span>

        <span className="flex min-w-0 flex-col">
          <span
            className={
              item.isChecked
                ? "text-muted-foreground truncate text-sm line-through"
                : "truncate text-sm"
            }
          >
            {formatItemLine(item)}
          </span>
          {item.isChecked && item.checkedByName && (
            <span className="text-muted-foreground text-xs">
              {item.checkedByName}
              {item.checkedAt &&
                ` · ${formatDistanceToNowStrict(parseISO(item.checkedAt))} ago`}
            </span>
          )}
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="my-auto size-9 shrink-0"
            aria-label={`Options for ${item.name}`}
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditingQuantity(true)}>
            <Pencil className="size-4" />
            Edit quantity
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditingSupermarkets(true)}>
            <Store className="size-4" />
            Change supermarkets
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              void deleteItem({ itemId: item.id }).then((result) => {
                if (result?.error) toast.error(result.error);
              });
            }}
          >
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <QuantityDialog
        item={item}
        open={editingQuantity}
        onClose={() => setEditingQuantity(false)}
      />
      <SupermarketsDialog
        item={item}
        supermarkets={supermarkets}
        open={editingSupermarkets}
        onClose={() => setEditingSupermarkets(false)}
      />
    </li>
  );
}

/**
 * Edits a quantity, in whatever unit suits.
 *
 * The stored value is in base units, so it is converted back into the unit
 * being shown before editing and through `toBase` on the way in — the same one
 * validated path the recipe editor uses.
 */
function QuantityDialog({
  item,
  open,
  onClose,
}: {
  item: ShoppingItem;
  open: boolean;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [quantity, setQuantity] = useState(
    item.quantity === null ? "" : String(item.quantity),
  );
  const [unit, setUnit] = useState(item.unit ?? NO_UNIT);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>
            Leave both empty for an item with no quantity.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <div className="flex-1">
            <Label htmlFor={`quantity-${item.id}`}>Quantity</Label>
            <Input
              id={`quantity-${item.id}`}
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>
          <div className="w-28">
            <Label htmlFor={`unit-${item.id}`}>Unit</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger id={`unit-${item.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_UNIT}>None</SelectItem>
                {INPUT_UNITS.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const trimmed = quantity.trim();
                const result = await setItemQuantity({
                  itemId: item.id,
                  quantity: trimmed === "" ? null : trimmed,
                  unit: trimmed === "" || unit === NO_UNIT ? null : unit,
                });
                if (result?.error) {
                  toast.error(result.error);
                  return;
                }
                onClose();
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Changes which shops this **item** appears under.
 *
 * Deliberately not the ingredient-level control from Phase 5: these assignments
 * were copied when the item was created and are independently editable, so
 * changing them here affects this list only and leaves the ingredient alone.
 * SPEC.md §5.7.
 */
function SupermarketsDialog({
  item,
  supermarkets,
  open,
  onClose,
}: {
  item: ShoppingItem;
  supermarkets: Supermarket[];
  open: boolean;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>(item.supermarketIds);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Where to buy {item.name}</DialogTitle>
          <DialogDescription>
            This list only. The ingredient itself is unchanged.
          </DialogDescription>
        </DialogHeader>

        {supermarkets.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No supermarkets yet. Add them in kitchen settings.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {supermarkets.map((supermarket) => {
              const isOn = selected.includes(supermarket.id);
              return (
                <button
                  key={supermarket.id}
                  type="button"
                  aria-pressed={isOn}
                  onClick={() =>
                    setSelected((current) =>
                      isOn
                        ? current.filter((id) => id !== supermarket.id)
                        : [...current, supermarket.id],
                    )
                  }
                  className={
                    isOn
                      ? "bg-primary text-primary-foreground rounded-full px-3 py-1.5 text-xs"
                      : "rounded-full border px-3 py-1.5 text-xs"
                  }
                >
                  {supermarket.name}
                </button>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await setItemSupermarkets({
                  itemId: item.id,
                  supermarketIds: selected,
                });
                if (result?.error) {
                  toast.error(result.error);
                  return;
                }
                onClose();
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
