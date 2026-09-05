"use client";

import { Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { copyPlanToCurrent } from "@/server/actions/plans";

/**
 * Copies a past plan's recipes onto the current one. SPEC.md §8 Phase 6.
 *
 * Servings come across; whether something was cooked does not, because this is
 * a plan to cook again rather than a record of having done so. Nothing is
 * deduplicated against the current plan — quietly dropping half a copy would be
 * more surprising than a duplicate, and duplicates are allowed anyway.
 */
export function CopyPlanButton({
  planId,
  recipeCount,
}: {
  planId: string;
  recipeCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={isPending || recipeCount === 0}
      onClick={() =>
        startTransition(async () => {
          const result = await copyPlanToCurrent({ planId });

          if ("error" in result) {
            toast.error(result.error);
            return;
          }

          toast.success(
            `${result.added} ${
              result.added === 1 ? "recipe" : "recipes"
            } copied to the current plan.`,
          );
          router.push("/plan");
        })
      }
    >
      <Copy className="size-4" />
      {isPending ? "Copying…" : "Copy to current plan"}
    </Button>
  );
}
