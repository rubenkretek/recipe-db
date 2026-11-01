import {
  LoadingArea,
  StackedCardsSkeleton,
  TitleSkeleton,
} from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The active plan's loading shell.
 *
 * The heading is the plan's name — usually the default date range, but
 * nameable — so it is a skeleton rather than a guess.
 */
export default function Loading() {
  return (
    <LoadingArea label="Loading the meal plan">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TitleSkeleton />
          <div className="flex shrink-0 gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-28" />
          </div>
        </div>
        <Skeleton className="h-3 w-56" />
      </div>

      <StackedCardsSkeleton count={3} />

      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-48" />
      </div>
    </LoadingArea>
  );
}
