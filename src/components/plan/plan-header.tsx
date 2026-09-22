"use client";

import { Check, Flag, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { UNNAMED_PLAN } from "@/lib/plan-dates";
import { completePlan, renamePlan, startPlan } from "@/server/actions/plans";

/**
 * The plan's name, edited in place.
 *
 * A plan is a period rather than a week, so most are unnamed and this shows the
 * default. Naming earns its keep in history, where "Christmas week" reads and
 * "Plan from 5 Sept" does not.
 */
export function PlanTitle({
  planId,
  name,
}: {
  planId: string;
  name: string | null;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(name ?? "");
  const [isPending, startTransition] = useTransition();

  if (!isEditing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">{name ?? UNNAMED_PLAN}</h1>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Rename this plan"
          onClick={() => {
            setDraft(name ?? "");
            setIsEditing(true);
          }}
        >
          <Pencil className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await renamePlan({ planId, name: draft });
          if (result?.error) {
            toast.error(result.error);
          } else {
            router.refresh();
          }
        });
        setIsEditing(false);
      }}
    >
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={UNNAMED_PLAN}
        aria-label="Plan name"
        autoFocus
      />
      <Button type="submit" size="icon" className="size-8" disabled={isPending}>
        <Check className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Cancel"
        onClick={() => setIsEditing(false)}
      >
        <X className="size-4" />
      </Button>
    </form>
  );
}

/**
 * Ends the plan and opens the next one.
 *
 * Behind a confirmation because it is not undoable from the UI: the plan
 * becomes read-only history. An empty plan can be completed — a fortnight where
 * you cooked nothing planned is still a fortnight.
 */
export function CompletePlanButton({
  planId,
  recipeCount,
  cookedCount,
  carryCandidates,
}: {
  planId: string;
  recipeCount: number;
  cookedCount: number;
  /**
   * Unticked items on the current shopping list, offered for carrying over.
   *
   * Ticked items never carry: you have already bought them. SPEC.md §6.4.
   */
  carryCandidates: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [carry, setCarry] = useState<string[]>([]);

  const uncooked = recipeCount - cookedCount;
  const allTicked = carry.length === carryCandidates.length;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Everything ticked each time it opens, so the default is the old
        // behaviour of carrying the lot and unticking is the deliberate act.
        if (next) setCarry(carryCandidates.map((item) => item.id));
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="secondary">
          <Flag className="size-4" />
          Complete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Complete this plan?</AlertDialogTitle>
          <AlertDialogDescription>
            {recipeCount === 0
              ? "It has no recipes on it. A new empty plan starts straight away."
              : uncooked === 0
                ? `All ${recipeCount} recipes are ticked as cooked. This plan moves to history and a new empty one starts.`
                : `${uncooked} of ${recipeCount} ${
                    uncooked === 1 ? "recipe is" : "recipes are"
                  } not ticked as cooked. This plan moves to history either way, and a new empty one starts.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {carryCandidates.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                Still to buy ({carry.length} of {carryCandidates.length})
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setCarry(
                    allTicked ? [] : carryCandidates.map((item) => item.id),
                  )
                }
              >
                {allTicked ? "Untick all" : "Tick all"}
              </Button>
            </div>

            <ul className="max-h-56 overflow-y-auto rounded-lg border">
              {carryCandidates.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0"
                >
                  <Checkbox
                    id={`carry-${item.id}`}
                    checked={carry.includes(item.id)}
                    onCheckedChange={() =>
                      setCarry((current) =>
                        current.includes(item.id)
                          ? current.filter((id) => id !== item.id)
                          : [...current, item.id],
                      )
                    }
                  />
                  <label htmlFor={`carry-${item.id}`} className="text-sm">
                    {item.label}
                  </label>
                </li>
              ))}
            </ul>

            <p className="text-muted-foreground text-xs">
              Unticked items stay on the old list, which moves to history with
              the plan. Nothing is deleted.
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Keep planning</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await completePlan({
                  planId,
                  // Null only when there was nothing to choose between, which
                  // keeps "carry everything" as the meaning of null.
                  carryItemIds: carryCandidates.length > 0 ? carry : null,
                });
                if (result?.error) {
                  toast.error(result.error);
                } else {
                  toast.success("Plan completed. A new one has started.");
                  setOpen(false);
                  router.refresh();
                }
              });
            }}
          >
            {isPending ? "Completing…" : "Complete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Starts the kitchen's very first plan.
 *
 * Only ever needed once: completing a plan creates the next one. It is a button
 * rather than something the page does on load because a Server Component cannot
 * write during render.
 */
export function StartPlanButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await startPlan();
          if (result?.error) {
            toast.error(result.error);
          } else {
            router.refresh();
          }
        })
      }
    >
      {isPending ? "Starting…" : "Start a plan"}
    </Button>
  );
}
