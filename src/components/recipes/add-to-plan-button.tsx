"use client";

import { CalendarPlus, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { addRecipeToPlan } from "@/server/actions/plans";

/**
 * Puts this recipe on the active plan. SPEC.md §8 Phase 6.
 *
 * Adds at the recipe's own `base_servings` rather than reading the servings
 * stepper further down the page. That stepper is display only, and it does not
 * render at all for a recipe with no ingredients — which is most of the library
 * until it is backfilled. Servings are adjusted on the plan screen, where they
 * persist. SPEC.md §6.2.
 *
 * `isOnPlan` marks rather than disables: adding the same recipe twice is
 * allowed, because cooking it twice in one period is real. The state is there
 * so the second add is deliberate.
 */
export function AddToPlanButton({
  recipeId,
  recipeName,
  isOnPlan,
}: {
  recipeId: string;
  recipeName: string;
  isOnPlan: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={isOnPlan ? "outline" : "secondary"}
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await addRecipeToPlan({ recipeId });

          if (result?.error) {
            toast.error(result.error);
            return;
          }

          toast.success(`${recipeName} added to the plan.`, {
            action: { label: "View plan", onClick: () => router.push("/plan") },
          });
          router.refresh();
        })
      }
    >
      {isOnPlan ? (
        <Check className="size-4" />
      ) : (
        <CalendarPlus className="size-4" />
      )}
      {isOnPlan ? "On the plan" : "Add to plan"}
    </Button>
  );
}
