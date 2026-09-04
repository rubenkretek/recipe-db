"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { redeemInvite } from "@/server/actions/kitchens";

/**
 * Confirms joining a kitchen from an invite link.
 *
 * Joining is a deliberate press rather than something that happens on page
 * load, so that opening a link someone forwarded you does not silently put you
 * in their kitchen.
 */
export function AcceptInviteButton({ code }: { code: string }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <Button
        disabled={isPending}
        onClick={() => {
          setFormError(null);
          startTransition(async () => {
            const result = await redeemInvite({ code });
            if (result?.error) {
              setFormError(result.error);
            }
          });
        }}
      >
        {isPending ? "Joining…" : "Join this kitchen"}
      </Button>
      {formError && <p className="text-destructive text-sm">{formError}</p>}
    </div>
  );
}
