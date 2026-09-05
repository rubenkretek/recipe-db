"use client";

import { Check, ImageIcon, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { RecipeListItem } from "@/lib/recipes";
import { addRecipeToPlan } from "@/server/actions/plans";

/**
 * Searchable picker for putting a recipe on the plan. SPEC.md §8 Phase 6.
 *
 * Stays open after each pick, because adding six recipes in one sitting is the
 * normal case and reopening the dialog five times is not. A recipe already on
 * the plan is marked rather than hidden: adding the same thing twice is allowed
 * — cooking it twice in a fortnight is real — but it should be deliberate.
 *
 * Archived recipes never reach this list; `listRecipes` excludes them by
 * default and the server action refuses them anyway.
 */
export function RecipePicker({
  recipes,
  recipeIdsOnPlan,
}: {
  recipes: RecipeListItem[];
  recipeIdsOnPlan: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Tracks this session's additions so a row marks itself immediately, rather
  // than waiting for the server round trip to come back through props.
  const [justAdded, setJustAdded] = useState<string[]>([]);

  const onPlan = new Set([...recipeIdsOnPlan, ...justAdded]);

  function add(recipe: RecipeListItem) {
    setJustAdded((current) => [...current, recipe.id]);

    startTransition(async () => {
      const result = await addRecipeToPlan({ recipeId: recipe.id });

      if (result?.error) {
        setJustAdded((current) => current.filter((id) => id !== recipe.id));
        toast.error(result.error);
        return;
      }

      toast.success(`${recipe.name} added.`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add a recipe
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to the plan</DialogTitle>
          <DialogDescription>
            Servings default to the recipe&rsquo;s own and can be changed on the
            plan.
          </DialogDescription>
        </DialogHeader>

        {recipes.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
            No recipes in the library yet.
          </p>
        ) : (
          <Command
            // Filtered in memory: the whole library is already loaded, so a
            // round trip per keystroke would be slower than searching it.
            filter={(itemValue, search) =>
              itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }
          >
            <CommandInput placeholder="Search recipes…" />
            <CommandList>
              <CommandEmpty>No recipes found.</CommandEmpty>
              <CommandGroup>
                {recipes.map((recipe) => (
                  <CommandItem
                    key={recipe.id}
                    value={recipe.name}
                    disabled={isPending}
                    onSelect={() => add(recipe)}
                    className="gap-3"
                  >
                    <div className="bg-muted text-muted-foreground/40 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded">
                      {recipe.coverUrl ? (
                        <img
                          src={recipe.coverUrl}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="size-4" />
                      )}
                    </div>

                    <span className="flex-1 truncate">{recipe.name}</span>

                    {onPlan.has(recipe.id) ? (
                      <Badge variant="secondary" className="shrink-0">
                        <Check className="size-3" />
                        On the plan
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 capitalize">
                        {recipe.mealType}
                      </Badge>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </DialogContent>
    </Dialog>
  );
}
