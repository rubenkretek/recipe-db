import { RecipeForm } from "@/components/recipes/recipe-form";
import { listTags } from "@/lib/recipes";

export default async function NewRecipePage() {
  const allTags = await listTags();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">New recipe</h1>
      <RecipeForm allTags={allTags} />
    </div>
  );
}
