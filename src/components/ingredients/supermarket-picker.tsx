"use client";

import { Check, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Supermarket } from "@/lib/supermarkets";
import { setIngredientSupermarkets } from "@/server/actions/supermarkets";

/**
 * The sentence that has to appear wherever assignments are edited.
 *
 * A supermarket assignment belongs to the *ingredient*, not to the recipe line
 * or to the row you happen to be looking at. Changing it anywhere changes it
 * everywhere. That is correct, but invisible without saying so, and the spec
 * does not mention it at all. See CLAUDE.md "Gotchas".
 */
const SHARED_STATE_HINT =
  "Applies to every recipe using this ingredient.";

/**
 * Toggle chips for assigning an ingredient to supermarkets.
 *
 * Saves on every toggle rather than on a form Save. These are ingredient-level
 * shared data, so holding them in a recipe form's state would imply they are
 * part of the recipe — and worse, the form's Cancel would appear to undo them
 * while being unable to.
 */
export function SupermarketChips({
  ingredientId,
  supermarkets,
  assignedIds,
  showHint = false,
}: {
  ingredientId: string;
  supermarkets: Supermarket[];
  assignedIds: string[];
  showHint?: boolean;
}) {
  const router = useRouter();
  const [assigned, setAssigned] = useState(assignedIds);
  const [isPending, startTransition] = useTransition();

  function toggle(supermarketId: string) {
    const next = assigned.includes(supermarketId)
      ? assigned.filter((id) => id !== supermarketId)
      : [...assigned, supermarketId];

    // Optimistic: the chip should respond to the tap, not to the round trip.
    setAssigned(next);

    startTransition(async () => {
      const result = await setIngredientSupermarkets({
        ingredientId,
        supermarketIds: next,
      });

      if (result?.error) {
        setAssigned(assigned);
        toast.error(result.error);
      } else {
        router.refresh();
      }
    });
  }

  if (supermarkets.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        No supermarkets yet. Add them in kitchen settings.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {supermarkets.map((supermarket) => {
          const isAssigned = assigned.includes(supermarket.id);
          return (
            <Button
              key={supermarket.id}
              type="button"
              size="sm"
              variant={isAssigned ? "secondary" : "outline"}
              className="h-7 gap-1 px-2 text-xs"
              disabled={isPending}
              aria-pressed={isAssigned}
              onClick={() => toggle(supermarket.id)}
            >
              {isAssigned && <Check className="size-3" />}
              {supermarket.name}
            </Button>
          );
        })}
      </div>
      {showHint && (
        <p className="text-muted-foreground text-xs">{SHARED_STATE_HINT}</p>
      )}
    </div>
  );
}

/**
 * The same control, folded into a popover.
 *
 * Used on the recipe editor's ingredient rows, where a fifteen-ingredient list
 * would otherwise become a wall of chips. The trigger shows the count so the
 * state is legible without opening it.
 */
export function SupermarketPickerButton({
  ingredientId,
  supermarkets,
  assignedIds,
}: {
  ingredientId: string;
  supermarkets: Supermarket[];
  assignedIds: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label={
            assignedIds.length === 0
              ? "Assign supermarkets"
              : `Assigned to ${assignedIds.length} supermarket${assignedIds.length === 1 ? "" : "s"}`
          }
          title="Where to buy it"
        >
          <Store
            className={
              assignedIds.length > 0
                ? "size-4"
                : "text-muted-foreground/50 size-4"
            }
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <p className="mb-2 text-sm font-medium">Where to buy it</p>
        <SupermarketChips
          ingredientId={ingredientId}
          supermarkets={supermarkets}
          assignedIds={assignedIds}
          showHint
        />
      </PopoverContent>
    </Popover>
  );
}
