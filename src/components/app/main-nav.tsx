"use client";

import { BookOpen, CalendarDays, House, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * The app's primary navigation. SPEC.md §7.
 *
 * Added in Phase 6. With only the recipe library to reach, the dashboard cards
 * were enough; with a plan as well they are not. The shopping list joined it in
 * Phase 7, which is the whole core loop: browse, plan, shop.
 *
 * A fixed bottom tab bar, as a phone app would have, rather than links in the
 * header: this is used one-handed in a supermarket, where the bottom of the
 * screen is the only part a thumb reaches comfortably. It stays put at every
 * width, so the app looks the same installed on a phone and open on a laptop.
 *
 * Its height lives in `--bottom-nav` (see globals.css) because the padding that
 * keeps page content clear of it, and the shopping screen's pinned add box,
 * both have to agree with it.
 */
const LINKS = [
  // `exact` is not decoration: every path starts with "/", so the prefix match
  // the other tabs rely on would light Home on every screen in the app.
  { href: "/", label: "Home", icon: House, exact: true },
  { href: "/recipes", label: "Recipes", icon: BookOpen, exact: false },
  { href: "/plan", label: "Plan", icon: CalendarDays, exact: false },
  { href: "/shopping", label: "Shop", icon: ShoppingCart, exact: false },
];

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      // z-40, below dialogs and sheets at z-50: a bottom sheet such as the
      // ingredient picker must cover the bar, not sit under it.
      className="bg-background/95 supports-backdrop-filter:bg-background/80 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom,0px)] backdrop-blur"
    >
      <ul className="mx-auto flex h-14 w-full max-w-3xl items-stretch">
        {LINKS.map(({ href, label, icon: Icon, exact }) => {
          // Prefix match so /plan/history and /recipes/[id] keep their tab lit.
          const isActive = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {/* The highlight is a pill behind the icon only, not the whole
                    tab: subtle enough not to shout, clear enough to find. */}
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full px-4 py-0.5 transition-colors",
                    isActive && "bg-muted",
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <span
                  className={cn("text-[11px] leading-none", isActive && "font-medium")}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
