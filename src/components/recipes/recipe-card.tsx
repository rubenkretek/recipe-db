import { ImageIcon } from "lucide-react";
import Link from "next/link";

import { formatScore } from "@/components/recipes/rating-control";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { RecipeListItem } from "@/lib/recipes";

/**
 * A recipe in the grid.
 *
 * The image area is a deliberate placeholder rather than an omission: Phase 3
 * drops a real cover photo into exactly this box, and reserving the space now
 * means the grid does not reflow when it arrives.
 */
export function RecipeCard({ recipe }: { recipe: RecipeListItem }) {
  return (
    <Link href={`/recipes/${recipe.id}`} className="group">
      <Card className="h-full gap-0 overflow-hidden py-0 transition-colors group-hover:border-foreground/20">
        <div className="bg-muted text-muted-foreground/40 flex aspect-video items-center justify-center">
          <ImageIcon className="size-8" />
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
