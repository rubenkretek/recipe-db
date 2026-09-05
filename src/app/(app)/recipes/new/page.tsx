import { RecipeForm } from "@/components/recipes/recipe-form";
import { listIngredients } from "@/lib/ingredients";
import { listTags } from "@/lib/recipes";

export default async function NewRecipePage() {
  const [allTags, ingredients] = await Promise.all([
    listTags(),
    listIngredients(),
  ]);

  const allIngredients = ingredients.map((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    defaultUnit: ingredient.defaultUnit,
  }));

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

      <RecipeForm allTags={allTags} allIngredients={allIngredients} />
    </div>
  );
}
