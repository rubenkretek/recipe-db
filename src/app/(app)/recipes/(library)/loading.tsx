import { Plus } from "lucide-react";
import Link from "next/link";

import { LoadingArea, RecipeGridSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The library's loading shell.
 *
 * The heading and the New recipe button are **real**, not skeletons: they are
 * the same on every visit, so there is no reason to grey them out and then
 * replace them with identical content. The guide's point about loading states
 * is to keep whatever is genuinely known visible, and only fall back where data
 * is actually in flight.
 *
 * It says "Recipes" rather than "Archive": the archive is a `?archived=1` view
 * and a `loading.tsx` cannot read search params. The common case wins.
 */
export default function Loading() {
  return (
    <LoadingArea label="Loading recipes">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Recipes</h1>
        <Button asChild>
          <Link href="/recipes/new">
            <Plus className="size-4" />
            New recipe
          </Link>
        </Button>
      </div>

      {/* The filter bar: a search box and a few dropdowns. */}
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-full max-w-56" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>

      <RecipeGridSkeleton />
    </LoadingArea>
  );
}
