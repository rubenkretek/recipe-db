import { NewRecipeScreen } from "@/components/recipes/new-recipe-screen";
import { listIngredients } from "@/lib/ingredients";
import { requireKitchenContext } from "@/lib/kitchen";
import { isImportConfigured } from "@/lib/recipe-import";
import { listTags } from "@/lib/recipes";
import { listSupermarkets } from "@/lib/supermarkets";

export default async function NewRecipePage() {
  const [allTags, ingredients, supermarkets, { active }] = await Promise.all([
    listTags(),
    listIngredients(),
    listSupermarkets(),
    requireKitchenContext(),
  ]);

  const allIngredients = ingredients.map((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    defaultUnit: ingredient.defaultUnit,
  }));

  // Ingredient id to its supermarkets, so the editor's row picker can show the
  // current assignment without another query per row.
  const assignmentsByIngredient = Object.fromEntries(
    ingredients.map((ingredient) => [ingredient.id, ingredient.supermarketIds]),
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">New recipe</h1>

      {/*
        No photo section here: a photo's storage path contains the recipe id, so
        there is nowhere to file one until the recipe exists.
      */}
      <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-sm">
        Photos can be added once the recipe is saved.
      </p>

      <NewRecipeScreen
        allTags={allTags}
        allIngredients={allIngredients}
        supermarkets={supermarkets}
        assignmentsByIngredient={assignmentsByIngredient}
        kitchenId={active.id}
        // Checked on the server: the key is a secret and never reaches here.
        canImport={isImportConfigured()}
      />
    </div>
  );
}
