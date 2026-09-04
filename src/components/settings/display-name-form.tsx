"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  updateProfileSchema,
  type UpdateProfileInput,
} from "@/schemas/profile";
import { updateDisplayName } from "@/server/actions/profile";

export function DisplayNameForm({ currentName }: { currentName: string }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { displayName: currentName },
  });

  function onSubmit(values: UpdateProfileInput) {
    setFormError(null);
    startTransition(async () => {
      const result = await updateDisplayName(values);
      if (result?.error) {
        setFormError(result.error);
      } else {
        toast.success("Name updated.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input aria-label="Display name" {...register("displayName")} />
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
      {errors.displayName && (
        <p className="text-destructive text-sm">{errors.displayName.message}</p>
      )}
      {formError && <p className="text-destructive text-sm">{formError}</p>}
    </form>
  );
}
