import { IngredientManager } from "@/components/settings/ingredient-manager";
import { listIngredients } from "@/lib/ingredients";
import { listSupermarkets } from "@/lib/supermarkets";

/**
 * Ingredient management. SPEC.md §7 and §8 Phases 4 and 5.
 *
 * A grid: every ingredient once, alphabetically, with a column per supermarket
 * tinted in that shop's colour. Both Phase 5 acceptance criteria are still
 * observable — an ingredient assigned to two shops is ticked in both columns,
 * and one assigned nowhere has an empty row — but unlike the grouped lists this
 * replaced, a gap is visible without hunting for it.
 */
export default async function IngredientsSettingsPage() {
  const [ingredients, supermarkets] = await Promise.all([
    listIngredients(),
    listSupermarkets(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Ingredients</h1>
        <p className="text-muted-foreground text-sm">
          Tick where you buy each thing. An ingredient can come from several
          shops. Tap a name to rename it, set its default unit, or merge it into
          another — renaming updates every recipe at once.
        </p>
      </div>

      <IngredientManager ingredients={ingredients} supermarkets={supermarkets} />
    </div>
  );
}
