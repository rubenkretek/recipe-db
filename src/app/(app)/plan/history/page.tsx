import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { describePlanPeriod } from "@/lib/plan-dates";
import { listCompletedPlans } from "@/lib/plans";

/**
 * Past plans, read-only. SPEC.md §7 and §8 Phase 6.
 *
 * Deliberately excludes the active plan: it has its own screen, and listing it
 * under "history" alongside plans that can no longer be changed invites the
 * wrong kind of click.
 */
export default async function PlanHistoryPage() {
  const plans = await listCompletedPlans();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Plan history</h1>
          <p className="text-muted-foreground text-sm">
            Completed plans, kept as a record.
          </p>
        </div>
        <Button variant="secondary" asChild>
          <Link href="/plan">Current plan</Link>
        </Button>
      </div>

      {plans.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center text-sm">
          Nothing here yet. Completing a plan moves it into history.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {plans.map((plan) => (
            <li key={plan.id}>
              <Link
                href={`/plan/${plan.id}`}
                className="hover:bg-muted/50 flex items-center gap-3 p-4"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {plan.name ?? describePlanPeriod(plan.startsOn, plan.endsOn)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {plan.name
                      ? `${describePlanPeriod(plan.startsOn, plan.endsOn)} · `
                      : ""}
                    {plan.recipeCount}{" "}
                    {plan.recipeCount === 1 ? "recipe" : "recipes"},{" "}
                    {plan.cookedCount} cooked
                  </p>
                </div>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
