import { LoadingArea, RowsSkeleton } from "@/components/app/skeletons";

/** Past plans. The heading is fixed, so it is the real one. */
export default function Loading() {
  return (
    <LoadingArea label="Loading past plans">
      <h1 className="text-2xl font-semibold">Plan history</h1>
      <RowsSkeleton count={4} withLeading={false} />
    </LoadingArea>
  );
}
