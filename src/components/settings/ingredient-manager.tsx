"use client";

import { Check, Merge, Pencil, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SupermarketChips } from "@/components/ingredients/supermarket-picker";
import type { IngredientGroup, ManagedIngredient } from "@/lib/ingredients";
import type { Supermarket } from "@/lib/supermarkets";
import { INPUT_UNITS } from "@/lib/units";
import {
  mergeIngredients,
  renameIngredient,
  setDefaultUnit,
} from "@/server/actions/ingredients";

/** Sentinel for "no default unit", since a Select item cannot have an empty value. */
const NO_UNIT = "none";

/**
 * Rename and merge the kitchen's ingredients. SPEC.md §8 Phase 4.
 *
 * There is deliberately no delete. `recipe_ingredients.ingredient_id` is
 * `on delete restrict`, so an ingredient in use cannot be removed anyway, and
 * merging is how a duplicate goes away — it keeps the recipes that referenced
 * it pointing somewhere real.
 */
export function IngredientManager({
  ingredients,
  supermarkets,
  groups,
}: {
  ingredients: ManagedIngredient[];
  supermarkets: Supermarket[];
  groups: IngredientGroup[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [mergeSource, setMergeSource] = useState<ManagedIngredient | null>(null);
  const [isPending, startTransition] = useTransition();

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

  if (ingredients.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center text-sm">
        No ingredients yet. They appear here as you add them to recipes.
      </p>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <section key={group.supermarketId ?? "unassigned"} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">
            {group.name}
            <span className="text-muted-foreground font-normal">
              {" "}
              ({group.ingredients.length})
            </span>
          </h2>
          {group.ingredients.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-4 text-center text-xs">
              {group.supermarketId === null
                ? "Everything has a supermarket."
                : "Nothing assigned here yet."}
            </p>
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border">
              {group.ingredients.map((ingredient) => (
          <li
            key={ingredient.id}
            className="flex flex-wrap items-center gap-3 p-3"
          >
            {editingId === ingredient.id ? (
              <form
                className="flex flex-1 items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(
                    () =>
                      renameIngredient({
                        ingredientId: ingredient.id,
                        name: draftName,
                      }),
                    "Renamed everywhere it is used.",
                  );
                  setEditingId(null);
                }}
              >
                <Input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  aria-label="Ingredient name"
                  autoFocus
                />
                <Button type="submit" size="icon" className="size-8" disabled={isPending}>
                  <Check className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setEditingId(null)}
                >
                  <X className="size-4" />
                </Button>
              </form>
            ) : (
              <>
                <div className="flex flex-1 flex-col gap-1.5">
                  <div>
                    <p className="text-sm font-medium">{ingredient.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {ingredient.usageCount === 0
                        ? "Not used yet"
                        : `Used in ${ingredient.usageCount} ${
                            ingredient.usageCount === 1 ? "recipe" : "recipes"
                          }`}
                    </p>
                  </div>
                  <SupermarketChips
                    ingredientId={ingredient.id}
                    supermarkets={supermarkets}
                    assignedIds={ingredient.supermarketIds}
                  />
                </div>

                <Select
                  value={ingredient.defaultUnit ?? NO_UNIT}
                  onValueChange={(value) =>
                    run(
                      () =>
                        setDefaultUnit({
                          ingredientId: ingredient.id,
                          defaultUnit: value === NO_UNIT ? null : value,
                        }),
                      "Default unit saved.",
                    )
                  }
                >
                  <SelectTrigger
                    className="w-28"
                    aria-label={`Default unit for ${ingredient.name}`}
                  >
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

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Rename ${ingredient.name}`}
                  onClick={() => {
                    setEditingId(ingredient.id);
                    setDraftName(ingredient.name);
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Merge ${ingredient.name} into another`}
                  onClick={() => setMergeSource(ingredient)}
                >
                  <Merge className="size-4" />
                </Button>
              </>
            )}
          </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <MergeDialog
        source={mergeSource}
        ingredients={ingredients}
        isPending={isPending}
        onClose={() => setMergeSource(null)}
        onConfirm={(targetId) => {
          if (!mergeSource) return;
          run(
            () =>
              mergeIngredients({ sourceId: mergeSource.id, targetId }),
            "Merged.",
          );
          setMergeSource(null);
        }}
      />
    </>
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
