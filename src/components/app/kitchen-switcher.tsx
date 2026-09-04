"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Kitchen } from "@/lib/kitchen";
import { switchKitchen } from "@/server/actions/kitchens";

/**
 * Switches which kitchen the app is showing.
 *
 * The choice is persisted in a cookie by the server action, so it survives a
 * refresh and applies to every route at once. SPEC.md §8 Phase 1 acceptance.
 */
export function KitchenSwitcher({
  kitchens,
  active,
}: {
  kitchens: Kitchen[];
  active: Kitchen;
}) {
  const [isPending, startTransition] = useTransition();

  function onSelect(kitchenId: string) {
    if (kitchenId === active.id) return;

    startTransition(async () => {
      const result = await switchKitchen({ kitchenId });
      if (result?.error) {
        toast.error(result.error);
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="-ml-2 gap-2 font-semibold"
          disabled={isPending}
        >
          {active.name}
          <ChevronsUpDown className="text-muted-foreground size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Your kitchens</DropdownMenuLabel>
        {kitchens.map((kitchen) => (
          <DropdownMenuItem
            key={kitchen.id}
            onSelect={() => onSelect(kitchen.id)}
          >
            <Check
              className={
                kitchen.id === active.id ? "size-4" : "size-4 opacity-0"
              }
            />
            {kitchen.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/kitchens">
            <Plus className="size-4" />
            Create or join
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
