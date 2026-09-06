import { BookOpen, CalendarDays, ShoppingCart } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireKitchenContext } from "@/lib/kitchen";
import { describePlanPeriod } from "@/lib/plan-dates";
import { getActivePlanSummary } from "@/lib/plans";
import { getUncheckedItemCount } from "@/lib/shopping";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const { active } = await requireKitchenContext();
  const [plan, toBuy] = await Promise.all([
    getActivePlanSummary(),
    getUncheckedItemCount(),
  ]);
  const supabase = await createClient();

  // Filtered by the active kitchen explicitly, even though RLS would already do
  // it. RLS is the safety net, not the filter. See CLAUDE.md "Multi-tenancy".
  const { data: members } = await supabase
    .from("kitchen_members")
    .select("profiles (display_name)")
    .eq("kitchen_id", active.id)
    .order("joined_at", { ascending: true });

  const memberNames = (members ?? [])
    .map((row) => row.profiles?.display_name)
    .filter((name): name is string => Boolean(name));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">{active.name}</h1>
        <p className="text-muted-foreground text-sm">
          {memberNames.length === 1
            ? "Just you so far."
            : memberNames.join(" and ")}
        </p>
      </div>

      {/* The three things the app does, in the order the core loop uses them.
          Each gains a href in the phase that builds it. SPEC.md §8. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/recipes">
          <Card className="h-full transition-colors hover:border-foreground/20">
            <CardHeader>
              <BookOpen className="text-muted-foreground size-5" />
              <CardTitle className="text-base">Recipes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Browse the library.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/plan">
          <Card className="h-full transition-colors hover:border-foreground/20">
            <CardHeader>
              <CalendarDays className="text-muted-foreground size-5" />
              <CardTitle className="text-base">
                {plan?.name ?? "Meal plan"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                {!plan
                  ? "No plan yet. Start one."
                  : plan.recipeCount === 0
                    ? `Empty. ${describePlanPeriod(plan.startsOn, null)}.`
                    : `${plan.recipeCount} ${
                        plan.recipeCount === 1 ? "recipe" : "recipes"
                      }, ${plan.cookedCount} cooked. ${describePlanPeriod(
                        plan.startsOn,
                        null,
                      )}.`}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/shopping">
          <Card className="h-full transition-colors hover:border-foreground/20">
            <CardHeader>
              <ShoppingCart className="text-muted-foreground size-5" />
              <CardTitle className="text-base">Shopping list</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                {toBuy === 0
                  ? "Nothing to buy."
                  : `${toBuy} ${toBuy === 1 ? "thing" : "things"} to get.`}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
