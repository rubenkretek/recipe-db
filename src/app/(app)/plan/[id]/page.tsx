import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CopyPlanButton } from "@/components/plan/copy-plan-button";
import { PlanBoard } from "@/components/plan/plan-board";
import { Button } from "@/components/ui/button";
import { UNNAMED_PLAN, describePlanPeriod } from "@/lib/plan-dates";
import { getPlan } from "@/lib/plans";

/**
 * One past plan, read-only, with "copy to current plan". SPEC.md §8 Phase 6.
 *
 * The active plan is not viewable here: it redirects to /plan so there is one
 * canonical URL for the plan you can actually edit.
 */
export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const plan = await getPlan(id);

  if (!plan) {
    notFound();
  }
  if (plan.status === "active") {
    redirect("/plan");
  }

  const cookedCount = plan.recipes.filter(
    (planned) => planned.cookedAt !== null,
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">
            {plan.name ?? UNNAMED_PLAN}
          </h1>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" asChild>
              <Link href="/plan/history">History</Link>
            </Button>
            <CopyPlanButton
              planId={plan.id}
              recipeCount={plan.recipes.length}
            />
          </div>
        </div>

        <p className="text-muted-foreground text-sm">
          {describePlanPeriod(plan.startsOn, plan.endsOn)} ·{" "}
          {plan.recipes.length}{" "}
          {plan.recipes.length === 1 ? "recipe" : "recipes"}, {cookedCount}{" "}
          cooked
        </p>
      </div>

      <PlanBoard recipes={plan.recipes} readOnly />
    </div>
  );
}
