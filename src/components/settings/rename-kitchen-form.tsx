"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  renameKitchenSchema,
  type RenameKitchenInput,
} from "@/schemas/kitchen";
import { renameKitchen } from "@/server/actions/kitchens";

export function RenameKitchenForm({
  kitchenId,
  currentName,
}: {
  kitchenId: string;
  currentName: string;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RenameKitchenInput>({
    resolver: zodResolver(renameKitchenSchema),
    defaultValues: { kitchenId, name: currentName },
  });

  function onSubmit(values: RenameKitchenInput) {
    setFormError(null);
    startTransition(async () => {
      const result = await renameKitchen(values);
      if (result?.error) {
        setFormError(result.error);
      } else {
        toast.success("Kitchen renamed.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <input type="hidden" {...register("kitchenId")} />
      <div className="flex gap-2">
        <Input aria-label="Kitchen name" {...register("name")} />
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
      {errors.name && (
        <p className="text-destructive text-sm">{errors.name.message}</p>
      )}
      {formError && <p className="text-destructive text-sm">{formError}</p>}
    </form>
  );
}
