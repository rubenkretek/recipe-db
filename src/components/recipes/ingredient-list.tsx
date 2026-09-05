"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { RecipeIngredient } from "@/lib/recipes";
import { scaleQuantity } from "@/lib/servings";
import { formatQuantity, pluraliseName } from "@/lib/units";

const MIN_SERVINGS = 1;
const MAX_SERVINGS = 99;

/**
 * A recipe's ingredients, with a servings stepper that rescales them live.
 *
 * The scaling is display only and never persisted: the recipe still stores its
 * quantities for `base_servings`. When a recipe goes onto a meal plan (Phase 6)
 * the chosen servings is stored there instead. SPEC.md §6.2.
 */
export function IngredientList({
  ingredients,
  baseServings,
}: {
  ingredients: RecipeIngredient[];
  baseServings: number;
}) {
  const [servings, setServings] = useState(baseServings);

  if (ingredients.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium">Ingredients</h2>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Fewer servings"
            disabled={servings <= MIN_SERVINGS}
            onClick={() => setServings((current) => current - 1)}
          >
            <Minus className="size-4" />
          </Button>
          <span
            className="w-20 text-center text-sm tabular-nums"
            aria-live="polite"
          >
            {servings} {servings === 1 ? "serving" : "servings"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="More servings"
            disabled={servings >= MAX_SERVINGS}
            onClick={() => setServings((current) => current + 1)}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      <ul className="flex flex-col gap-1.5 text-sm">
        {ingredients.map((ingredient) => (
          <li key={ingredient.id} className="flex gap-2">
            <span>{renderIngredient(ingredient, baseServings, servings)}</span>
          </li>
        ))}
      </ul>

      {servings !== baseServings && (
        <p className="text-muted-foreground text-xs">
          Scaled from {baseServings}. The recipe itself is unchanged.
        </p>
      )}
    </section>
  );
}

/**
 * Renders one ingredient line: quantity, then the name, then the note.
 *
 * `piece` is the interesting case. `formatQuantity` deliberately omits the unit
 * for it, so "2 piece onion" comes back as just "2" and the name is pluralised
 * here instead — which is the only place that knows the name. SPEC.md §5.3.
 */
function renderIngredient(
  ingredient: RecipeIngredient,
  baseServings: number,
  servings: number,
): string {
  const scaled = scaleQuantity(
    ingredient.quantity,
    ingredient.unit,
    baseServings,
    servings,
  );

  const quantity = formatQuantity(scaled, ingredient.unit, ingredient.displayUnit);

  // Only `piece` pluralises the name; "3 cloves garlic" keeps garlic singular.
  const name =
    ingredient.unit === "piece" && scaled !== null
      ? pluraliseName(ingredient.name, scaled)
      : ingredient.name;

  const head = quantity ? `${quantity} ${name}` : name;
  return ingredient.note ? `${head}, ${ingredient.note}` : head;
}
