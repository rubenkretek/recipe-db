import { History } from "lucide-react";
import Link from "next/link";

import { PlanBoard } from "@/components/plan/plan-board";
import {
  CompletePlanButton,
  PlanTitle,
  StartPlanButton,
} from "@/components/plan/plan-header";
import { RecipePicker } from "@/components/plan/recipe-picker";
import { Button } from "@/components/ui/button";
import { describePlanPeriod } from "@/lib/plan-dates";
import { getActivePlan } from "@/lib/plans";
import { listRecipes } from "@/lib/recipes";

/**
 * The active meal plan. SPEC.md §7 and §8 Phase 6.
 *
 * "Add ingredients" per recipe, and the "6 of 8 added" subtitle that goes with
 * it, arrive in Phase 7 with the shopping list.
 */
export default async function PlanPage() {
  const [plan, recipes] = await Promise.all([getActivePlan(), listRecipes()]);

  // Null is a real state, not an error: completing a plan creates the next one,
  // so a kitchen only ever starts one by hand once.
  if (!plan) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Meal plan</h1>
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed px-4 py-12 text-center">
          <p className="text-muted-foreground text-sm">
            No plan yet. A plan is a period of any length — it ends when you
            complete it, and completing it starts the next one.
          </p>
          <StartPlanButton />
        </div>
      </div>
    );
  }

  const cookedCount = plan.recipes.filter(
    (planned) => planned.cookedAt !== null,
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PlanTitle planId={plan.id} name={plan.name} />
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" asChild>
              <Link href="/plan/history">
                <History className="size-4" />
                History
              </Link>
            </Button>
            <CompletePlanButton
              planId={plan.id}
              recipeCount={plan.recipes.length}
              cookedCount={cookedCount}
            />
          </div>
        </div>

        <p className="text-muted-foreground text-sm">
          {describePlanPeriod(plan.startsOn, null)}
          {plan.recipes.length > 0 &&
            ` · ${plan.recipes.length} ${
              plan.recipes.length === 1 ? "recipe" : "recipes"
            }, ${cookedCount} cooked`}
        </p>
      </div>

      <PlanBoard recipes={plan.recipes} />

      <div>
        <RecipePicker
          recipes={recipes}
          recipeIdsOnPlan={plan.recipes.map((planned) => planned.recipeId)}
        />
      </div>
    </div>
  );
}
