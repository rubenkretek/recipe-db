import { FormSkeleton, LoadingArea } from "@/components/app/skeletons";

/** The profile form. Heading is fixed, so it is the real one. */
export default function Loading() {
  return (
    <LoadingArea label="Loading your profile">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <FormSkeleton fields={2} />
    </LoadingArea>
  );
}
