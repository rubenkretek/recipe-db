"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { archiveRecipe, restoreRecipe } from "@/server/actions/recipes";

/**
 * Archives or restores a recipe.
 *
 * Archiving is the only removal there is: SPEC.md §8 Phase 2 specifies soft
 * delete, and `recipes` has no delete policy at all, so nothing here can
 * destroy a recipe. The confirmation still exists because archiving makes a
 * recipe vanish from the grid, which is surprising enough to be worth a beat.
 */
export function ArchiveButton({
  recipeId,
  recipeName,
  isArchived,
}: {
  recipeId: string;
  recipeName: string;
  isArchived: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);

  if (isArchived) {
    return (
      <Button
        variant="secondary"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await restoreRecipe({ recipeId });
            if (result?.error) {
              toast.error(result.error);
            } else {
              toast.success("Restored.");
              router.refresh();
            }
          })
        }
      >
        {isPending ? "Restoring…" : "Restore"}
      </Button>
    );
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline">Archive</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {recipeName}?</AlertDialogTitle>
          <AlertDialogDescription>
            It leaves the grid but is not deleted. You can bring it back any time
            from the archive.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await archiveRecipe({ recipeId });
                if (result?.error) {
                  toast.error(result.error);
                  setIsOpen(false);
                } else {
                  setIsOpen(false);
                  router.push("/recipes");
                }
              });
            }}
          >
            {isPending ? "Archiving…" : "Archive"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
