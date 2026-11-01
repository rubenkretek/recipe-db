import { LoadingArea, RowsSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Kitchen settings: members, invites, supermarkets and tags.
 *
 * Several independent sections, so the shell shows the same stack of them
 * rather than one undifferentiated block.
 */
export default function Loading() {
  return (
    <LoadingArea label="Loading kitchen settings">
      <h1 className="text-2xl font-semibold">Kitchen</h1>

      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-32" />
          <RowsSkeleton count={2} withLeading={false} />
        </div>
      ))}
    </LoadingArea>
  );
}
