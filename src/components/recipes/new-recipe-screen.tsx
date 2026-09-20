"use client";

import { useState } from "react";

import type { IngredientOption } from "@/components/recipes/ingredient-combobox";
import { RecipeForm } from "@/components/recipes/recipe-form";
import { RecipeImport } from "@/components/recipes/recipe-import";
import type { RecipeTag } from "@/lib/recipes";
import type { Supermarket } from "@/lib/supermarkets";
import type { RecipeFormInput } from "@/schemas/recipe";

/**
 * The new-recipe screen: import above, the form below.
 *
 * It exists to own one piece of state — the imported draft — because
 * `react-hook-form` reads `defaultValues` once, when the form mounts. Filling
 * an already-mounted form would mean pushing every field through `setValue`,
 * including the arrays, so the form is remounted with a new `key` instead and
 * the draft simply becomes its starting values.
 */
export function NewRecipeScreen({
  allTags,
  allIngredients,
  supermarkets,
  assignmentsByIngredient,
  kitchenId,
  canImport,
}: {
  allTags: RecipeTag[];
  allIngredients: IngredientOption[];
  supermarkets: Supermarket[];
  assignmentsByIngredient: Record<string, string[]>;
  kitchenId: string;
  /** False when the server has no API key, which is a deployment state. */
  canImport: boolean;
}) {
  const [draft, setDraft] = useState<RecipeFormInput | null>(null);
  const [draftCount, setDraftCount] = useState(0);
  // Ingredients created during an import. They cannot come from the page's own
  // list, which the server rendered before they existed — and the editor
  // resolves each row's id against that list, so a row referencing one of these
  // would render blank without them.
  const [imported, setImported] = useState<IngredientOption[]>([]);

  const knownIngredients = [...allIngredients, ...imported]
    .filter(
      (ingredient, index, list) =>
        list.findIndex((other) => other.id === ingredient.id) === index,
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-6">
      {canImport ? (
        <RecipeImport
          onDraft={(values, created) => {
            setImported((current) => [...current, ...created]);
            setDraft(values);
            setDraftCount((count) => count + 1);
          }}
        />
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-sm">
          Importing a file is not configured on this server.
        </p>
      )}

      <RecipeForm
        // A new draft remounts the form, which is how the values get in.
        key={draftCount}
        allTags={allTags}
        allIngredients={knownIngredients}
        supermarkets={supermarkets}
        assignmentsByIngredient={assignmentsByIngredient}
        kitchenId={kitchenId}
        initialValues={draft ?? undefined}
      />
    </div>
  );
}
