import {
  FormSkeleton,
  LoadingArea,
  TitleSkeleton,
} from "@/components/app/skeletons";

/**
 * The edit form's loading shell.
 *
 * The heading carries the recipe's name, so unlike the new-recipe form it has
 * to be a skeleton.
 */
export default function Loading() {
  return (
    <LoadingArea label="Loading the recipe form">
      <TitleSkeleton />
      <FormSkeleton fields={5} />
    </LoadingArea>
  );
}
