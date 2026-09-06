"use client";

import { ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { PlannedIngredient, PlannedRecipe } from "@/lib/plans";
import { formatQuantity, pluraliseName } from "@/lib/units";
import { addIngredientsToList } from "@/server/actions/shopping";

/**
 * Whether the picker is for one planned recipe or the whole plan.
 *
 * The two differ in how they treat already-added ingredients, and deliberately
 * so. Per recipe, they are shown greyed and unticked so you can see what has
 * already gone and add more if you genuinely want it (SPEC.md §6.3). Plan-wide,
 * they are left out entirely — it is a bulk action, and rows you cannot
 * meaningfully act on are noise (SPEC.md §7).
 */
type PickerMode = "recipe" | "plan";

/** A selection is one ingredient of one planned recipe. */
function keyFor(plannedRecipeId: string, ingredientId: string): string {
  return `${plannedRecipeId}:${ingredientId}`;
}

/**
 * The ingredient picker. SPEC.md §6.3.
 *
 * Everything offered starts ticked; tapping unticks. Quantities shown are
 * already scaled to the planned servings and rounded up for counts, so what you
 * see is exactly what lands on the list. Nothing reaches the shopping list
 * without confirming here.
 */
export function IngredientPicker({
  recipes,
  mode,
  trigger,
}: {
  recipes: PlannedRecipe[];
  mode: PickerMode;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Rows this picker is willing to show, per the mode.
  const sections = recipes
    .map((recipe) => ({
      recipe,
      ingredients:
        mode === "plan"
          ? recipe.ingredients.filter((one) => !one.alreadyAdded)
          : recipe.ingredients,
    }))
    .filter((section) => section.ingredients.length > 0);

  const [ticked, setTicked] = useState<Set<string>>(() => initialTicked(sections));

  // Reopening must reflect what has been added since it last closed, so the
  // selection is rebuilt from the server's data rather than kept across opens.
  function onOpenChange(next: boolean) {
    if (next) {
      setTicked(initialTicked(sections));
    }
    setOpen(next);
  }

  function confirm() {
    const selections = [...ticked].map((key) => {
      const [plannedRecipeId, ingredientId] = key.split(":");
      return { plannedRecipeId, ingredientId };
    });

    startTransition(async () => {
      const result = await addIngredientsToList({ selections });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `${result.added} ${result.added === 1 ? "item" : "items"} on the list.`,
        { action: { label: "View", onClick: () => router.push("/shopping") } },
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>

      {/* Bottom sheet: this is used one-handed, with a thumb. */}
      <SheetContent side="bottom" className="max-h-[85svh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {mode === "plan" ? "Add ingredients for all recipes" : "Add ingredients"}
          </SheetTitle>
          <SheetDescription>
            Everything is ticked. Tap to leave something off — quantities are
            already scaled to the servings you planned.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4">
          {sections.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
              {mode === "plan"
                ? "Everything on the plan has already been added."
                : "This recipe has no ingredients yet."}
            </p>
          ) : (
            sections.map((section) => (
              <section key={section.recipe.id} className="flex flex-col gap-1.5">
                {/* Recipe headings only make sense when there is more than one. */}
                {(mode === "plan" || sections.length > 1) && (
                  <h3 className="text-muted-foreground text-xs font-medium">
                    {section.recipe.name} · {section.recipe.servings}{" "}
                    {section.recipe.servings === 1 ? "serving" : "servings"}
                  </h3>
                )}

                <ul className="flex flex-col gap-1.5">
                  {section.ingredients.map((ingredient) => {
                    const key = keyFor(
                      section.recipe.id,
                      ingredient.ingredientId,
                    );
                    return (
                      <IngredientRow
                        key={key}
                        ingredient={ingredient}
                        isTicked={ticked.has(key)}
                        onToggle={() =>
                          setTicked((current) => {
                            const next = new Set(current);
                            if (next.has(key)) {
                              next.delete(key);
                            } else {
                              next.add(key);
                            }
                            return next;
                          })
                        }
                      />
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        <SheetFooter>
          <Button
            type="button"
            disabled={isPending || ticked.size === 0}
            onClick={confirm}
          >
            <ShoppingCart className="size-4" />
            {isPending
              ? "Adding…"
              : `Add ${ticked.size} ${ticked.size === 1 ? "item" : "items"}`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Everything offered starts ticked, except what has already been added. */
function initialTicked(
  sections: { recipe: PlannedRecipe; ingredients: PlannedIngredient[] }[],
): Set<string> {
  const ticked = new Set<string>();

  for (const section of sections) {
    for (const ingredient of section.ingredients) {
      if (!ingredient.alreadyAdded) {
        ticked.add(keyFor(section.recipe.id, ingredient.ingredientId));
      }
    }
  }

  return ticked;
}

/**
 * One tappable ingredient line.
 *
 * Green when ticked, grey when not — SPEC.md §6.3 is specific about this,
 * because the whole row is the tap target and a checkbox alone would be too
 * small to hit reliably.
 */
function IngredientRow({
  ingredient,
  isTicked,
  onToggle,
}: {
  ingredient: PlannedIngredient;
  isTicked: boolean;
  onToggle: () => void;
}) {
  const quantity = formatQuantity(ingredient.quantity, ingredient.unit);

  // `piece` drops its unit, so the name carries the plural. CLAUDE.md "Gotchas".
  const name =
    ingredient.unit === "piece" && ingredient.quantity !== null
      ? pluraliseName(ingredient.name, ingredient.quantity)
      : ingredient.name;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={isTicked}
        className={
          isTicked
            ? "flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-left text-sm"
            : "text-muted-foreground flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm"
        }
      >
        <span className={isTicked ? "" : "line-through"}>
          {quantity ? `${quantity} ${name}` : name}
        </span>
        {ingredient.alreadyAdded && (
          <Badge variant="secondary" className="shrink-0">
            Already added
          </Badge>
        )}
      </button>
    </li>
  );
}
