import {
  DashboardCardsSkeleton,
  LoadingArea,
  TitleSkeleton,
} from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The dashboard's loading shell.
 *
 * Scoped by the `(home)` group so it covers only this screen. The same file one
 * level up, at `(app)/loading.tsx`, became the first boundary the router found
 * and served this skeleton for every prefetch in the app.
 *
 * The heading is the kitchen's name, so it has to be a skeleton — unlike the
 * fixed-title screens, which show their real heading while data streams in.
 */
export default function Loading() {
  return (
    <LoadingArea label="Loading your kitchen" className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <TitleSkeleton />
        <Skeleton className="h-4 w-32" />
      </div>
      <DashboardCardsSkeleton />
    </LoadingArea>
  );
}
