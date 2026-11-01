import { LoadingArea, RowsSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The shopping list's loading shell.
 *
 * This is the screen that most needs one: it is opened in a shop, often on a
 * poor connection, and it was showing nothing at all until the list arrived.
 * The heading is real; the item count underneath is not knowable yet.
 *
 * The shape follows the real screen — shop chips, the copy and clear row, then
 * the list — so the items fill in rather than shove everything down.
 */
export default function Loading() {
  return (
    <LoadingArea label="Loading the shopping list" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Shopping</h1>
        <Skeleton className="h-3 w-40" />
      </div>

      <div className="-mx-4 flex gap-1.5 px-4">
        <Skeleton className="h-8 w-14 shrink-0 rounded-full" />
        <Skeleton className="h-8 w-20 shrink-0 rounded-full" />
        <Skeleton className="h-8 w-16 shrink-0 rounded-full" />
      </div>

      <div className="flex gap-2">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-7 w-16" />
      </div>

      <RowsSkeleton count={6} />
    </LoadingArea>
  );
}
