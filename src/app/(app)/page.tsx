import { BookOpen, CalendarDays, ShoppingCart } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireKitchenContext } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";

/**
 * The three things the app will do, in the order the core loop uses them.
 * Each becomes a real link in the phase that builds it. SPEC.md §8.
 */
const UPCOMING = [
  { icon: BookOpen, title: "Recipes", phase: "Phase 2" },
  { icon: CalendarDays, title: "Meal plan", phase: "Phase 6" },
  { icon: ShoppingCart, title: "Shopping list", phase: "Phase 7" },
];

export default async function DashboardPage() {
  const { active } = await requireKitchenContext();
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

      <div className="grid gap-4 sm:grid-cols-3">
        {UPCOMING.map(({ icon: Icon, title, phase }) => (
          <Card key={title} className="border-dashed shadow-none">
            <CardHeader>
              <Icon className="text-muted-foreground size-5" />
              <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">Coming in {phase}.</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
