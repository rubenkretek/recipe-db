import { Suspense } from "react";

import { KitchenSwitcher } from "@/components/app/kitchen-switcher";
import { MainNav } from "@/components/app/main-nav";
import { UserMenu } from "@/components/app/user-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { requireMyProfile } from "@/lib/auth";
import { requireKitchenContext } from "@/lib/kitchen";

/**
 * Shell for every signed-in screen that operates inside a kitchen.
 *
 * Resolving the kitchen here rather than in the proxy keeps the membership
 * query off every request in the app, including static assets.
 *
 * **This component is deliberately synchronous.** It used to await the kitchen
 * context and the profile before returning anything, which meant `{children}`
 * could not start — so on a direct visit the route's own `loading.tsx` could
 * not appear until two queries had come back, and the shell those boundaries
 * exist to show arrived late on every page load. The awaits now live in
 * `AppHeader` behind its own `<Suspense>`, so the page below starts
 * immediately and the header fills in beside it.
 *
 * A user with no kitchen is still redirected to /kitchens — `AppHeader` calls
 * `requireKitchenContext`, and a redirect thrown inside a streamed boundary
 * still reaches the browser. It simply happens a beat later than it used to,
 * which only affects somebody who has just left their last kitchen.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-2 px-4">
          <Suspense fallback={<AppHeaderSkeleton />}>
            <AppHeader />
          </Suspense>
        </div>
      </header>

      {/*
        The bottom padding clears the fixed navigation below. Without it the bar
        covers the last of the page — the Save button on a long recipe form, or
        the final item on a list.
      */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-8 pb-[calc(var(--bottom-nav)+2rem)]">
        {children}
      </main>

      <MainNav />
    </div>
  );
}

/**
 * The kitchen switcher and the user menu.
 *
 * Both of its queries are memoised per request by `cache()`, so the pages
 * below re-use the same kitchen context rather than asking again — one
 * `kitchen_members` query per request instead of the three to five it was.
 */
async function AppHeader() {
  const [{ kitchens, active }, profile] = await Promise.all([
    requireKitchenContext(),
    requireMyProfile(),
  ]);

  return (
    <>
      <KitchenSwitcher kitchens={kitchens} active={active} />
      <UserMenu displayName={profile.display_name} />
    </>
  );
}

/**
 * Holds the header's exact height while it resolves, so nothing below it moves
 * when the real controls arrive.
 */
function AppHeaderSkeleton() {
  return (
    <>
      <Skeleton className="h-7 w-32" />
      <Skeleton className="size-7 rounded-full" />
    </>
  );
}
