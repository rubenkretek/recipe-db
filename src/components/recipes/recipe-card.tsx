import { ImageIcon } from "lucide-react";
import Link from "next/link";

import { formatScore } from "@/lib/ratings";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { RecipeListItem } from "@/lib/recipes";

/**
 * A recipe in the grid.
 *
 * The image box keeps its dimensions whether or not there is a cover photo, so
 * a library part-way through being photographed does not look ragged. A plain
 * `<img>` rather than `next/image`: signed URLs rotate their token, which
 * defeats the optimiser's cache, and the file is already resized to 1600px.
 */
export function RecipeCard({ recipe }: { recipe: RecipeListItem }) {
  return (
    // `block` is load-bearing, not tidiness: `transform` does nothing on an
    // inline element, so the press scale would silently never happen on an
    // `<a>` left at its default display.
    <Link href={`/recipes/${recipe.id}`} className="group pressable block">
      <Card className="h-full gap-0 overflow-hidden py-0 transition-all duration-150 ease-snappy group-hover:border-foreground/20 group-hover:shadow-md">
        <div className="bg-muted text-muted-foreground/40 flex aspect-video items-center justify-center overflow-hidden">
          {recipe.coverUrl ? (
            <img
              src={recipe.coverUrl}
              alt=""
              loading="lazy"
              // Drifts in a little under the cursor. Slower than the press,
              // because this one is decoration rather than feedback.
              className="size-full object-cover transition-transform duration-300 ease-snappy group-hover:scale-[1.03]"
            />
          ) : (
            <ImageIcon className="size-8" />
          )}
        </div>

        <CardContent className="flex flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="leading-tight font-medium">{recipe.name}</h2>
            {recipe.averageRating !== null && (
              <span className="text-sm font-medium tabular-nums">
                {formatScore(recipe.averageRating)}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="capitalize">
              {recipe.mealType}
            </Badge>
            {recipe.tags.map((tag) => (
              <Badge key={tag.id} variant="secondary">
                {tag.name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
