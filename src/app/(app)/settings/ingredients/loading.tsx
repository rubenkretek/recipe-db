import {
  LoadingArea,
  TableSkeleton,
  TextSkeleton,
} from "@/components/app/skeletons";

/** The ingredients grid. Heading and explanation are fixed, so they are real. */
export default function Loading() {
  return (
    <LoadingArea label="Loading ingredients">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Ingredients</h1>
        <TextSkeleton lines={2} />
      </div>
      <TableSkeleton rows={8} columns={4} />
    </LoadingArea>
  );
}
