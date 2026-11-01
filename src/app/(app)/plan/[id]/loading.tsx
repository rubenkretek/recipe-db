import {
  LoadingArea,
  StackedCardsSkeleton,
  TitleSkeleton,
} from "@/components/app/skeletons";

/** A past plan, read-only. Its heading is the plan's name. */
export default function Loading() {
  return (
    <LoadingArea label="Loading the plan">
      <TitleSkeleton />
      <StackedCardsSkeleton count={2} />
    </LoadingArea>
  );
}
