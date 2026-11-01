import {
  LoadingArea,
  RowsSkeleton,
  TextSkeleton,
  TitleSkeleton,
} from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A recipe's loading shell.
 *
 * Everything on this page is the recipe itself, so there is no real content to
 * keep — the heading is the recipe's name. The shape still matters: cover photo,
 * pills, ingredients, then the method, in the order they actually appear, so
 * nothing jumps when the data lands.
 */
export default function Loading() {
  return (
    <LoadingArea label="Loading recipe">
      <div className="flex flex-col gap-3">
        <TitleSkeleton />
        <div className="flex flex-wrap gap-1.5">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>

      <Skeleton className="aspect-video w-full rounded-lg" />

      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28" />
        <RowsSkeleton count={5} withLeading={false} />
      </div>

      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-20" />
        <TextSkeleton lines={4} />
      </div>
    </LoadingArea>
  );
}
