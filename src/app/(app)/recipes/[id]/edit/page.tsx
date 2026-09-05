import { notFound } from "next/navigation";

import { RecipeForm } from "@/components/recipes/recipe-form";
import { getRecipe, listTags } from "@/lib/recipes";

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [recipe, allTags] = await Promise.all([getRecipe(id), listTags()]);

  if (!recipe) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Edit recipe</h1>
      <RecipeForm allTags={allTags} recipe={recipe} />
    </div>
  );
}
