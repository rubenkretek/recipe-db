"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  INVITE_CODE_LENGTH,
  redeemInviteSchema,
  type RedeemInviteInput,
} from "@/schemas/kitchen";
import { redeemInvite } from "@/server/actions/kitchens";

export function JoinKitchenForm({ defaultCode }: { defaultCode?: string }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RedeemInviteInput>({
    resolver: zodResolver(redeemInviteSchema),
    defaultValues: { code: defaultCode ?? "" },
  });

  function onSubmit(values: RedeemInviteInput) {
    setFormError(null);
    startTransition(async () => {
      const result = await redeemInvite(values);
      if (result?.error) {
        setFormError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="code">Invite code</Label>
        <Input
          id="code"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={INVITE_CODE_LENGTH}
          placeholder="K3M9PQR7"
          className="font-mono tracking-widest uppercase"
          {...register("code")}
        />
        {errors.code && (
          <p className="text-destructive text-sm">{errors.code.message}</p>
        )}
      </div>

      {formError && <p className="text-destructive text-sm">{formError}</p>}

      <Button type="submit" variant="secondary" disabled={isPending}>
        {isPending ? "Joining…" : "Join kitchen"}
      </Button>
    </form>
  );
}
