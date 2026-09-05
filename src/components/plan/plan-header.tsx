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
}: {
  planId: string;
  recipeCount: number;
  cookedCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const uncooked = recipeCount - cookedCount;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="secondary">
          <Flag className="size-4" />
          Complete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
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
        <AlertDialogFooter>
          <AlertDialogCancel>Keep planning</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await completePlan({ planId });
                if (result?.error) {
                  toast.error(result.error);
                } else {
                  toast.success("Plan completed. A new one has started.");
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
