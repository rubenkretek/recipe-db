"use client";

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
import { leaveKitchen } from "@/server/actions/kitchens";

export function LeaveKitchenButton({
  kitchenId,
  kitchenName,
  isOnlyMember,
}: {
  kitchenId: string;
  kitchenName: string;
  isOnlyMember: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);

  // Leaving as the only member would strand the kitchen with nobody able to
  // reach it, and deleting kitchens is not in Phase 1 scope. The server refuses
  // this too; disabling here just explains why before the press.
  if (isOnlyMember) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="outline" disabled className="self-start">
          Leave kitchen
        </Button>
        <p className="text-muted-foreground text-sm">
          You are the only member, so there is nobody to leave it to.
        </p>
      </div>
    );
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="self-start">
          Leave kitchen
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave {kitchenName}?</AlertDialogTitle>
          <AlertDialogDescription>
            You will lose access to its recipes, plans and shopping list. You can
            rejoin later with a code.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await leaveKitchen({ kitchenId });
                if (result?.error) {
                  toast.error(result.error);
                  setIsOpen(false);
                }
              });
            }}
          >
            {isPending ? "Leaving…" : "Leave"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
