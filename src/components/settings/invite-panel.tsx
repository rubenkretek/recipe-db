"use client";

import { Copy, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createInvite } from "@/server/actions/kitchens";

/**
 * Shows the kitchen's current join code, or offers to make one.
 *
 * Only the newest live code is shown. Regenerating revokes the previous one, so
 * there is never any doubt about which code is the current one.
 */
export function InvitePanel({
  kitchenId,
  code,
  expiresAt,
}: {
  kitchenId: string;
  code: string | null;
  expiresAt: string | null;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function regenerate() {
    setFormError(null);
    startTransition(async () => {
      const result = await createInvite({ kitchenId });
      if (result?.error) {
        setFormError(result.error);
      } else {
        toast.success("New code ready.");
      }
    });
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Code copied.");
    } catch {
      toast.error("Could not copy. Select the code and copy it by hand.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {code ? (
        <>
          <div className="flex items-center gap-2">
            <code className="bg-muted flex-1 rounded-md px-3 py-2 font-mono text-lg tracking-widest">
              {code}
            </code>
            <Button
              variant="secondary"
              size="icon"
              onClick={copy}
              aria-label="Copy code"
            >
              <Copy className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={regenerate}
              disabled={isPending}
              aria-label="Generate a new code"
            >
              <RefreshCw className="size-4" />
            </Button>
          </div>
          {expiresAt && (
            <p className="text-muted-foreground text-sm">
              Expires {new Date(expiresAt).toLocaleDateString()}. Generating a
              new code cancels this one.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            No live code. Generate one and send it however you like.
          </p>
          <Button onClick={regenerate} disabled={isPending} className="self-start">
            {isPending ? "Generating…" : "Generate a code"}
          </Button>
        </>
      )}
      {formError && <p className="text-destructive text-sm">{formError}</p>}
    </div>
  );
}
