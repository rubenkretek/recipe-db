import { IngredientManager } from "@/components/settings/ingredient-manager";
import { listIngredients } from "@/lib/ingredients";

/**
 * Ingredient management. SPEC.md §7 and §8 Phase 4.
 *
 * Its own route rather than a card on the kitchen settings page: the list grows
 * with the recipe library and does not belong inline beside members and invite
 * codes.
 */
export default async function IngredientsSettingsPage() {
  const ingredients = await listIngredients();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Ingredients</h1>
        <p className="text-muted-foreground text-sm">
          Renaming updates every recipe at once. Merging folds a duplicate into
          the one you keep.
        </p>
      </div>

      <IngredientManager ingredients={ingredients} />
    </div>
  );
}
