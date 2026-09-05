import { IngredientManager } from "@/components/settings/ingredient-manager";
import { groupIngredientsBySupermarket, listIngredients } from "@/lib/ingredients";
import { listSupermarkets } from "@/lib/supermarkets";

/**
 * Ingredient management. SPEC.md §7 and §8 Phases 4 and 5.
 *
 * Grouped by supermarket, with an "Unassigned" group at the end. That grouping
 * is where both Phase 5 acceptance criteria are observable: an ingredient
 * assigned to two shops appears under both, and one assigned to none appears
 * under "Unassigned". Until the shopping list exists in Phase 7, this is the
 * only view in the app that groups anything by shop.
 */
export default async function IngredientsSettingsPage() {
  const [ingredients, supermarkets] = await Promise.all([
    listIngredients(),
    listSupermarkets(),
  ]);

  const groups = groupIngredientsBySupermarket(ingredients, supermarkets);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Ingredients</h1>
        <p className="text-muted-foreground text-sm">
          Renaming updates every recipe at once. Merging folds a duplicate into
          the one you keep. An ingredient can be bought at several shops, so it
          may appear in more than one group.
        </p>
      </div>

      <IngredientManager
        ingredients={ingredients}
        supermarkets={supermarkets}
        groups={groups}
      />
    </div>
  );
}
