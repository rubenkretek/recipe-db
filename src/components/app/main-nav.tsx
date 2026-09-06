"use client";

import { BookOpen, CalendarDays, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * The app's primary navigation. SPEC.md §7.
 *
 * Added in Phase 6. With only the recipe library to reach, the dashboard cards
 * were enough; with a plan as well they are not. The shopping list joined it in
 * Phase 7, which is the whole core loop: browse, plan, shop.
 */
const LINKS = [
  { href: "/recipes", label: "Recipes", icon: BookOpen },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/shopping", label: "Shop", icon: ShoppingCart },
];

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {LINKS.map(({ href, label, icon: Icon }) => {
        // Prefix match so /plan/history and /recipes/[id] keep their tab lit.
        const isActive = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
              isActive
                ? "bg-muted font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
