import { ExternalLink, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArchiveButton } from "@/components/recipes/archive-button";
import { IngredientList } from "@/components/recipes/ingredient-list";
import { Markdown } from "@/components/recipes/markdown";
import { PhotoGallery } from "@/components/recipes/photo-gallery";
import {
  RatingControl,
  RatingSummary,
} from "@/components/recipes/rating-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requireUserId } from "@/lib/auth";
import { getRecipe } from "@/lib/recipes";

/**
 * A single recipe. SPEC.md §7.
 *
 * Thin by design at this phase: the ingredient list and servings stepper arrive
 * in Phase 4, the photo gallery in Phase 3, "Add to plan" in Phase 6 and "Mark
 * reviewed" in Phase 9.
 */
export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [recipe, userId] = await Promise.all([getRecipe(id), requireUserId()]);

  if (!recipe) {
    notFound();
  }

  const myRating = recipe.ratings.find((rating) => rating.userId === userId);

  return (
    <div className="flex flex-col gap-6">
      {recipe.archivedAt && (
        <div className="bg-muted text-muted-foreground rounded-md px-4 py-3 text-sm">
          This recipe is archived, so it does not show in the library.
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold">{recipe.name}</h1>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" asChild>
              <Link href={`/recipes/${recipe.id}/edit`}>
                <Pencil className="size-4" />
                Edit
              </Link>
            </Button>
            <ArchiveButton
              recipeId={recipe.id}
              recipeName={recipe.name}
              isArchived={Boolean(recipe.archivedAt)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="capitalize">
            {recipe.mealType}
          </Badge>
          <Badge variant="outline">Serves {recipe.baseServings}</Badge>
          {recipe.tags.map((tag) => (
            <Badge key={tag.id} variant="secondary">
              {tag.name}
            </Badge>
          ))}
        </div>

        {recipe.sourceUrl && (
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground inline-flex w-fit items-center gap-1.5 text-sm underline underline-offset-4"
          >
            <ExternalLink className="size-3.5" />
            Source
          </a>
        )}
      </div>

      <PhotoGallery photos={recipe.photos} recipeName={recipe.name} />

      <Separator />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Ratings</h2>
        <RatingSummary
          ratings={recipe.ratings}
          averageRating={recipe.averageRating}
        />
        <RatingControl
          recipeId={recipe.id}
          initialScore={myRating?.score ?? null}
        />
      </section>

      {recipe.ingredients.length > 0 && (
        <>
          <Separator />
          <IngredientList
            ingredients={recipe.ingredients}
            baseServings={recipe.baseServings}
          />
        </>
      )}

      {recipe.method && (
        <>
          <Separator />
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Method</h2>
            <Markdown>{recipe.method}</Markdown>
          </section>
        </>
      )}

      {recipe.notes && (
        <>
          <Separator />
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Notes</h2>
            <p className="text-sm whitespace-pre-wrap">{recipe.notes}</p>
          </section>
        </>
      )}
    </div>
  );
}
