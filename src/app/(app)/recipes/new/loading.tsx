import { FormSkeleton, LoadingArea } from "@/components/app/skeletons";

/** The new-recipe form's loading shell. The heading never changes, so it stays. */
export default function Loading() {
  return (
    <LoadingArea label="Loading the recipe form">
      <h1 className="text-2xl font-semibold">New recipe</h1>
      <FormSkeleton fields={5} />
    </LoadingArea>
  );
}
