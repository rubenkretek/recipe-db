"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";

import { MethodEditor } from "@/components/recipes/method-editor";
import { TagCombobox } from "@/components/recipes/tag-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { RecipeDetail, RecipeTag } from "@/lib/recipes";
import {
  MEAL_TYPES,
  recipeFormSchema,
  type RecipeFormInput,
  type RecipeFormValues,
} from "@/schemas/recipe";
import { createRecipe, updateRecipe } from "@/server/actions/recipes";

const MEAL_TYPE_LABELS: Record<(typeof MEAL_TYPES)[number], string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  dessert: "Dessert",
  snack: "Snack",
};

/**
 * The create and edit form for a recipe.
 *
 * One component for both, because the two differ only in which action they call
 * and what they start from. Only the name is required: SPEC.md §8 Phase 2 is
 * explicit that a recipe can be created with a name and nothing else.
 */
export function RecipeForm({
  allTags,
  recipe,
}: {
  allTags: RecipeTag[];
  recipe?: RecipeDetail;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RecipeFormInput, unknown, RecipeFormValues>({
    resolver: zodResolver(recipeFormSchema),
    defaultValues: {
      name: recipe?.name ?? "",
      mealType: recipe?.mealType ?? "dinner",
      baseServings: recipe?.baseServings ?? 2,
      sourceUrl: recipe?.sourceUrl ?? "",
      method: recipe?.method ?? "",
      notes: recipe?.notes ?? "",
      tagIds: recipe?.tags.map((tag) => tag.id) ?? [],
    },
  });

  function onSubmit(values: RecipeFormValues) {
    setFormError(null);
    startTransition(async () => {
      const result = recipe
        ? await updateRecipe({ ...values, recipeId: recipe.id })
        : await createRecipe(values);

      if (result?.error) {
        setFormError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" placeholder="Miso aubergine" {...register("name")} />
        {errors.name && (
          <p className="text-destructive text-sm">{errors.name.message}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="mealType">Meal type</Label>
          <Controller
            control={control}
            name="mealType"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="mealType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_TYPES.map((mealType) => (
                    <SelectItem key={mealType} value={mealType}>
                      {MEAL_TYPE_LABELS[mealType]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="baseServings">Serves</Label>
          <Input
            id="baseServings"
            type="number"
            min={1}
            max={99}
            {...register("baseServings")}
          />
          {errors.baseServings && (
            <p className="text-destructive text-sm">
              {errors.baseServings.message}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Tags</Label>
        <Controller
          control={control}
          name="tagIds"
          render={({ field }) => (
            <TagCombobox
              allTags={allTags}
              selectedIds={field.value ?? []}
              onChange={field.onChange}
            />
          )}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="sourceUrl">Source link</Label>
        <Input
          id="sourceUrl"
          placeholder="https://…"
          {...register("sourceUrl")}
        />
        <p className="text-muted-foreground text-xs">
          Where it came from. Optional.
        </p>
      </div>

      <div className="grid gap-2">
        <Label>Method</Label>
        <Controller
          control={control}
          name="method"
          render={({ field }) => (
            <MethodEditor
              value={field.value ?? ""}
              onChange={field.onChange}
            />
          )}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          rows={3}
          placeholder="Halve the chilli next time."
          {...register("notes")}
        />
      </div>

      {formError && <p className="text-destructive text-sm">{formError}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : recipe ? "Save changes" : "Create recipe"}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <Link href={recipe ? `/recipes/${recipe.id}` : "/recipes"}>
            Cancel
          </Link>
        </Button>
      </div>
    </form>
  );
}
