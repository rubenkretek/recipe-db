import { notFound } from "next/navigation";

import { PhotoManager } from "@/components/recipes/photo-manager";
import { RecipeForm } from "@/components/recipes/recipe-form";
import { requireKitchenContext } from "@/lib/kitchen";
import { listIngredients } from "@/lib/ingredients";
import { getRecipe, listTags } from "@/lib/recipes";
import { listSupermarkets } from "@/lib/supermarkets";

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [recipe, allTags, ingredients, supermarkets, { active }] =
    await Promise.all([
      getRecipe(id),
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

  if (!recipe) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Edit recipe</h1>

      {/*
        Photos sit above the form and save on their own. They cannot be part of
        the form submit, because a file cannot wait in a form field for a Save
        button, so they are kept visually separate to make that obvious.
      */}
      <PhotoManager
        recipeId={recipe.id}
        kitchenId={active.id}
        photos={recipe.photos}
      />

      <RecipeForm
        allTags={allTags}
        allIngredients={allIngredients}
        supermarkets={supermarkets}
        assignmentsByIngredient={assignmentsByIngredient}
        recipe={recipe}
      />
    </div>
  );
}
