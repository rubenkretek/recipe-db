import { notFound } from "next/navigation";

import { PhotoManager } from "@/components/recipes/photo-manager";
import { RecipeForm } from "@/components/recipes/recipe-form";
import { requireKitchenContext } from "@/lib/kitchen";
import { getRecipe, listTags } from "@/lib/recipes";

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [recipe, allTags, { active }] = await Promise.all([
    getRecipe(id),
    listTags(),
    requireKitchenContext(),
  ]);

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

      <RecipeForm allTags={allTags} recipe={recipe} />
    </div>
  );
}
