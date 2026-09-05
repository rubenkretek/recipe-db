import { KitchenSwitcher } from "@/components/app/kitchen-switcher";
import { MainNav } from "@/components/app/main-nav";
import { UserMenu } from "@/components/app/user-menu";
import { requireMyProfile } from "@/lib/auth";
import { requireKitchenContext } from "@/lib/kitchen";

/**
 * Shell for every signed-in screen that operates inside a kitchen.
 *
 * Resolving the kitchen here rather than in the proxy keeps the membership
 * query off every request in the app, including static assets. A user with no
 * kitchen is redirected to /kitchens by requireKitchenContext.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ kitchens, active }, profile] = await Promise.all([
    requireKitchenContext(),
    requireMyProfile(),
  ]);

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-2 px-4">
          <KitchenSwitcher kitchens={kitchens} active={active} />
          <div className="flex items-center gap-2">
            <MainNav />
            <UserMenu displayName={profile.display_name} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
