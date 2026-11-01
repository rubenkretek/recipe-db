import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { RecipeCard } from "@/components/recipes/recipe-card";
import { RecipeFilters } from "@/components/recipes/recipe-filters";
import { Button } from "@/components/ui/button";
import { listRecipes, listTags, type RecipeSort } from "@/lib/recipes";
import { MEAL_TYPES, type MealType } from "@/schemas/recipe";

const SORTS: RecipeSort[] = ["name", "rating", "recent"];

function parseSort(value: string | undefined): RecipeSort {
  return SORTS.includes(value as RecipeSort) ? (value as RecipeSort) : "name";
}

function parseMealType(value: string | undefined): MealType | undefined {
  return MEAL_TYPES.includes(value as MealType) ? (value as MealType) : undefined;
}

function parseMinRating(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

type SearchParams = {
  q?: string;
  tag?: string;
  meal?: string;
  min?: string;
  sort?: string;
  archived?: string;
};

/**
 * The recipe library. SPEC.md §7.
 *
 * A Server Component reading its filters from the URL, so there is no
 * client-side fetching and a filtered view is a shareable link.
 */
export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const showingArchive = params.archived === "1";

  const [recipes, allTags] = await Promise.all([
    listRecipes({
      search: params.q,
      tagId: params.tag,
      mealType: parseMealType(params.meal),
      minRating: parseMinRating(params.min),
      sort: parseSort(params.sort),
      archived: showingArchive,
    }),
    listTags(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">
          {showingArchive ? "Archive" : "Recipes"}
        </h1>
        <Button asChild>
          <Link href="/recipes/new">
            <Plus className="size-4" />
            New recipe
          </Link>
        </Button>
      </div>

      {/* useSearchParams needs a Suspense boundary above it. */}
      <Suspense fallback={null}>
        <RecipeFilters allTags={allTags} />
      </Suspense>

      {recipes.length === 0 ? (
        <EmptyState showingArchive={showingArchive} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ showingArchive }: { showingArchive: boolean }) {
  return (
    <div className="rounded-lg border border-dashed py-16 text-center">
      <p className="text-muted-foreground text-sm">
        {showingArchive
          ? "Nothing archived."
          : "No recipes match. Try clearing the filters, or add one."}
      </p>
    </div>
  );
}
