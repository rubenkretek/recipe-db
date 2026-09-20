"use client";

import { Merge } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ManagedIngredient } from "@/lib/ingredients";
import type { Supermarket } from "@/lib/supermarkets";
import { INPUT_UNITS } from "@/lib/units";
import {
  mergeIngredients,
  renameIngredient,
  setDefaultUnit,
} from "@/server/actions/ingredients";
import { setIngredientSupermarkets } from "@/server/actions/supermarkets";

/** Sentinel for "no default unit", since a Select item cannot have an empty value. */
const NO_UNIT = "none";

/**
 * How strongly a shop's colour tints its column.
 *
 * Both states are tinted, so a column reads as one shop at a glance; the
 * difference in strength is what says whether the ingredient is sold there. The
 * tick is the unambiguous signal — the tint alone would be unreadable to anyone
 * who cannot separate the two shades.
 */
const ASSIGNED_TINT = 80;
const UNASSIGNED_TINT = 50;

/**
 * A shop's colour at the given strength, or undefined when it has none.
 *
 * `color-mix` rather than parsing the hex into rgba: the browser does the
 * arithmetic, and undefined leaves the cell with no inline background at all,
 * which is what a colourless shop has to fall back to. A shop without a colour
 * is a supported state, not a missing value — see the migration.
 */
function tintFor(colour: string | null, percent: number): string | undefined {
  if (!colour) return undefined;
  return `color-mix(in srgb, ${colour} ${percent}%, transparent)`;
}

/**
 * The kitchen's ingredients as a grid: ingredients down, supermarkets across.
 * SPEC.md §8 Phases 4 and 5.
 *
 * Replaced the per-supermarket grouped lists, where an ingredient sold at three
 * shops appeared three times and there was no way to see a gap — an ingredient
 * assigned nowhere was only visible by scrolling to the bottom. A grid answers
 * "what is missing" in one look, which is the actual question this screen is
 * for, and it keeps every ingredient on exactly one row.
 *
 * There is deliberately no delete. `recipe_ingredients.ingredient_id` is
 * `on delete restrict`, so an ingredient in use cannot be removed anyway, and
 * merging is how a duplicate goes away — it keeps the recipes that referenced
 * it pointing somewhere real.
 */
export function IngredientManager({
  ingredients,
  supermarkets,
}: {
  ingredients: ManagedIngredient[];
  supermarkets: Supermarket[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ManagedIngredient | null>(null);
  const [mergeSource, setMergeSource] = useState<ManagedIngredient | null>(null);
  const [isPending, startTransition] = useTransition();

  // Assignments are held locally so a tick responds to the tap rather than to
  // the round trip. Keyed by ingredient id, mirroring what the server sent.
  const [assignments, setAssignments] = useState(() =>
    assignmentsOf(ingredients),
  );
  const [lastIngredients, setLastIngredients] = useState(ingredients);

  // The props arriving after `router.refresh()` have to win, or a rename or a
  // merge would never show. Adjusted during render rather than in an effect,
  // the same shape as `PlanBoard`. See CLAUDE.md "Syncing props into state
  // belongs in render, not an effect".
  if (ingredients !== lastIngredients) {
    setLastIngredients(ingredients);
    setAssignments(assignmentsOf(ingredients));
  }

  function run(action: () => Promise<{ error: string } | void>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(success);
        router.refresh();
      }
    });
  }

  /**
   * Assigning is **ingredient-level shared state**: it changes where that
   * ingredient is bought for every recipe using it, not just here. Saved on the
   * tap rather than behind a Save button, matching the chips on the recipe
   * editor. See CLAUDE.md "Gotchas".
   */
  function toggleAssignment(ingredient: ManagedIngredient, supermarketId: string) {
    const current = assignments[ingredient.id] ?? [];
    const next = current.includes(supermarketId)
      ? current.filter((id) => id !== supermarketId)
      : [...current, supermarketId];

    setAssignments((previous) => ({ ...previous, [ingredient.id]: next }));

    startTransition(async () => {
      const result = await setIngredientSupermarkets({
        ingredientId: ingredient.id,
        supermarketIds: next,
      });

      if (result?.error) {
        setAssignments((previous) => ({
          ...previous,
          [ingredient.id]: current,
        }));
        toast.error(result.error);
      } else {
        router.refresh();
      }
    });
  }

  if (ingredients.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center text-sm">
        No ingredients yet. They appear here as you add them to recipes.
      </p>
    );
  }

  return (
    <>
      {supermarkets.length === 0 && (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-center text-xs">
          No supermarkets yet. Add them in kitchen settings and they become
          columns here.
        </p>
      )}

      {/* The only horizontally scrolling element on the page: many shops must
          not make the whole layout scroll sideways on a phone. The name column
          is sticky so it stays readable while the shops scroll under it. */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="bg-background sticky top-0 left-0 z-30 border-b border-r px-3 py-2 text-left text-xs font-medium"
              >
                Ingredient
              </th>
              {supermarkets.map((supermarket) => (
                <th
                  key={supermarket.id}
                  scope="col"
                  className="bg-background sticky top-0 z-20 border-b border-l px-2 py-2 text-center text-xs font-medium"
                  style={{
                    backgroundColor: tintFor(supermarket.colour, ASSIGNED_TINT),
                  }}
                >
                  <span className="block max-w-24 truncate">
                    {supermarket.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ingredients.map((ingredient) => {
              const assigned = assignments[ingredient.id] ?? [];

              return (
                <tr key={ingredient.id} className="border-b last:border-b-0">
                  <th
                    scope="row"
                    className="bg-background sticky left-0 z-10 border-r p-0 text-left font-normal"
                  >
                    {/* The name is the way in to renaming, the default unit and
                        merging. Those three were a row of controls per
                        ingredient, which a grid has no width for. */}
                    <button
                      type="button"
                      className="hover:bg-muted/60 flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left"
                      onClick={() => setEditing(ingredient)}
                      aria-label={`Edit ${ingredient.name}`}
                    >
                      <span className="wrap-break-word font-medium">
                        {ingredient.name}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {ingredient.usageCount === 0
                          ? "Not used yet"
                          : `${ingredient.usageCount} ${
                              ingredient.usageCount === 1 ? "recipe" : "recipes"
                            }`}
                        {ingredient.defaultUnit
                          ? ` · ${ingredient.defaultUnit}`
                          : ""}
                      </span>
                    </button>
                  </th>

                  {supermarkets.map((supermarket) => {
                    const isAssigned = assigned.includes(supermarket.id);

                    return (
                      <td
                        key={supermarket.id}
                        // A shop with no colour falls back to a neutral fill, so
                        // the column still reads as assigned or not.
                        className={
                          !supermarket.colour && isAssigned
                            ? "bg-muted border-l"
                            : "border-l"
                        }
                        style={{
                          backgroundColor: tintFor(
                            supermarket.colour,
                            isAssigned ? ASSIGNED_TINT : UNASSIGNED_TINT,
                          ),
                        }}
                      >
                        <div className="flex items-center justify-center px-3 py-3">
                          <Checkbox
                            checked={isAssigned}
                            disabled={isPending}
                            onCheckedChange={() =>
                              toggleAssignment(ingredient, supermarket.id)
                            }
                            aria-label={`${ingredient.name} at ${supermarket.name}`}
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <IngredientDialog
        // Keyed so the draft name resets when a different ingredient is opened.
        key={editing?.id ?? "none"}
        ingredient={editing}
        isPending={isPending}
        onClose={() => setEditing(null)}
        onRename={(name) => {
          if (!editing) return;
          run(
            () => renameIngredient({ ingredientId: editing.id, name }),
            "Renamed everywhere it is used.",
          );
          setEditing(null);
        }}
        onDefaultUnitChange={(defaultUnit) => {
          if (!editing) return;
          run(
            () => setDefaultUnit({ ingredientId: editing.id, defaultUnit }),
            "Default unit saved.",
          );
        }}
        onMerge={() => {
          setMergeSource(editing);
          setEditing(null);
        }}
      />

      <MergeDialog
        source={mergeSource}
        ingredients={ingredients}
        isPending={isPending}
        onClose={() => setMergeSource(null)}
        onConfirm={(targetId) => {
          if (!mergeSource) return;
          run(
            () => mergeIngredients({ sourceId: mergeSource.id, targetId }),
            "Merged.",
          );
          setMergeSource(null);
        }}
      />
    </>
  );
}

/** Ingredient id to the supermarket ids it is assigned to. */
function assignmentsOf(
  ingredients: ManagedIngredient[],
): Record<string, string[]> {
  return Object.fromEntries(
    ingredients.map((ingredient) => [ingredient.id, ingredient.supermarketIds]),
  );
}

/**
 * Everything about one ingredient that is not an assignment: its name, its
 * default unit, and the way to merge it away.
 *
 * A dialog rather than an inline row, because the grid's rows are one line tall
 * and the name column is narrow enough to be sticky.
 */
function IngredientDialog({
  ingredient,
  isPending,
  onClose,
  onRename,
  onDefaultUnitChange,
  onMerge,
}: {
  ingredient: ManagedIngredient | null;
  isPending: boolean;
  onClose: () => void;
  onRename: (name: string) => void;
  onDefaultUnitChange: (defaultUnit: string | null) => void;
  onMerge: () => void;
}) {
  const [draftName, setDraftName] = useState(ingredient?.name ?? "");

  return (
    <Dialog
      open={ingredient !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ingredient?.name}</DialogTitle>
          <DialogDescription>
            {ingredient?.usageCount === 0
              ? "Not used in any recipe yet."
              : `Used in ${ingredient?.usageCount} ${
                  ingredient?.usageCount === 1 ? "recipe" : "recipes"
                }. Renaming updates every one of them.`}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onRename(draftName);
          }}
        >
          <Label htmlFor="ingredient-name">Name</Label>
          <div className="flex gap-2">
            <Input
              id="ingredient-name"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              autoFocus
            />
            <Button
              type="submit"
              disabled={isPending || draftName.trim() === ingredient?.name}
            >
              Save
            </Button>
          </div>
        </form>

        <div className="flex flex-col gap-2">
          <Label htmlFor="ingredient-unit">Default unit</Label>
          <Select
            value={ingredient?.defaultUnit ?? NO_UNIT}
            onValueChange={(value) =>
              onDefaultUnitChange(value === NO_UNIT ? null : value)
            }
          >
            <SelectTrigger id="ingredient-unit" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_UNIT}>No default</SelectItem>
              {INPUT_UNITS.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            Prefills the quantity box when this ingredient is added to a recipe.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          className="justify-start"
          onClick={onMerge}
        >
          <Merge className="size-4" />
          Merge into another ingredient
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function MergeDialog({
  source,
  ingredients,
  isPending,
  onClose,
  onConfirm,
}: {
  source: ManagedIngredient | null;
  ingredients: ManagedIngredient[];
  isPending: boolean;
  onClose: () => void;
  onConfirm: (targetId: string) => void;
}) {
  const [targetId, setTargetId] = useState<string | null>(null);

  return (
    <AlertDialog
      open={source !== null}
      onOpenChange={(open) => {
        if (!open) {
          setTargetId(null);
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Merge {source?.name}</AlertDialogTitle>
          <AlertDialogDescription>
            Every recipe using {source?.name} will use the ingredient you pick
            instead, and {source?.name} is deleted. A recipe that used both keeps
            two lines.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Select value={targetId ?? undefined} onValueChange={setTargetId}>
          <SelectTrigger aria-label="Merge into">
            <SelectValue placeholder="Keep which ingredient?" />
          </SelectTrigger>
          <SelectContent>
            {ingredients
              .filter((ingredient) => ingredient.id !== source?.id)
              .map((ingredient) => (
                <SelectItem key={ingredient.id} value={ingredient.id}>
                  {ingredient.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending || !targetId}
            onClick={(event) => {
              event.preventDefault();
              if (targetId) onConfirm(targetId);
              setTargetId(null);
            }}
          >
            {isPending ? "Merging…" : "Merge"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
