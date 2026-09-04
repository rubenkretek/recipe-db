"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createKitchenSchema,
  type CreateKitchenInput,
} from "@/schemas/kitchen";
import { createKitchen } from "@/server/actions/kitchens";

export function CreateKitchenForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateKitchenInput>({ resolver: zodResolver(createKitchenSchema) });

  function onSubmit(values: CreateKitchenInput) {
    setFormError(null);
    startTransition(async () => {
      const result = await createKitchen(values);
      if (result?.error) {
        setFormError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Kitchen name</Label>
        <Input id="name" placeholder="Home" {...register("name")} />
        {errors.name && (
          <p className="text-destructive text-sm">{errors.name.message}</p>
        )}
      </div>

      {formError && <p className="text-destructive text-sm">{formError}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating…" : "Create kitchen"}
      </Button>
    </form>
  );
}
