import { BookOpen, CalendarDays, Carrot, ShoppingCart } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getIngredientSummary } from "@/lib/ingredients";
import { requireKitchenContext } from "@/lib/kitchen";
import { describePlanPeriod } from "@/lib/plan-dates";
import { getActivePlanSummary } from "@/lib/plans";
import { getUncheckedItemCount } from "@/lib/shopping";
import { createClient } from "@/lib/supabase/server";

/**
 * The dashboard.
 *
 * It lives in a `(home)` route group for one reason: so its `loading.tsx`
 * scopes to this screen alone. Sitting at `(app)/loading.tsx` it was the
 * **first** boundary the router found, and every prefetch — Shopping, Recipes,
 * Plan — came back carrying the dashboard's skeleton instead of its own.
 * Measured against the real prefetch payloads, not reasoned about. The
 * parentheses change no URL; this is still `/`.
 */
export default async function DashboardPage() {
  const { active } = await requireKitchenContext();
  const [plan, toBuy, ingredients] = await Promise.all([
    getActivePlanSummary(),
    getUncheckedItemCount(),
    getIngredientSummary(),
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

      {/* The three things the app does, in the order the core loop uses them,
          then the library they all draw on. SPEC.md §8. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* `block` so the press scale applies: `transform` is ignored on an
            inline element, which an `<a>` is by default. */}
        <Link href="/recipes" className="group pressable block">
          <Card className="h-full transition-all duration-150 ease-snappy group-hover:border-foreground/20 group-hover:shadow-md">
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

        <Link href="/plan" className="group pressable block">
          <Card className="h-full transition-all duration-150 ease-snappy group-hover:border-foreground/20 group-hover:shadow-md">
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

        <Link href="/shopping" className="group pressable block">
          <Card className="h-full transition-all duration-150 ease-snappy group-hover:border-foreground/20 group-hover:shadow-md">
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

        {/* The unassigned count rather than a bare total: those are the things
            that arrive on a list under "Unassigned" instead of in an aisle, and
            the grid behind this link is where that is fixed. */}
        <Link href="/settings/ingredients" className="group pressable block">
          <Card className="h-full transition-all duration-150 ease-snappy group-hover:border-foreground/20 group-hover:shadow-md">
            <CardHeader>
              <Carrot className="text-muted-foreground size-5" />
              <CardTitle className="text-base">Ingredients</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                {ingredients.total === 0
                  ? "None yet. They appear as you use them."
                  : ingredients.unassigned === 0
                    ? `${ingredients.total} ${
                        ingredients.total === 1 ? "ingredient" : "ingredients"
                      }, all with a shop.`
                    : `${ingredients.unassigned} of ${ingredients.total} without a shop.`}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
