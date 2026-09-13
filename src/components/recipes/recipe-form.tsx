"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";

import type { IngredientOption } from "@/components/recipes/ingredient-combobox";
import { IngredientEditor } from "@/components/recipes/ingredient-editor";
import { StepEditor } from "@/components/recipes/step-editor";
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
import { withHeadings } from "@/lib/ingredient-groups";
import { BLANK_INGREDIENT_ROW } from "@/schemas/ingredient";
import type { RecipeDetail, RecipeTag } from "@/lib/recipes";
import type { Supermarket } from "@/lib/supermarkets";
import { UNITS } from "@/lib/units";
import {
  BLANK_STEP,
  MEAL_TYPES,
  recipeFormSchema,
  type RecipeFormInput,
} from "@/schemas/recipe";
import { createRecipe, updateRecipe } from "@/server/actions/recipes";

/**
 * Converts a stored base quantity back into the unit it was entered in, so the
 * editor reopens showing "1 kg" rather than "1000 g".
 *
 * Falls back to the base value when there is no display unit, or when the
 * conversion would not be clean — the same rule `formatQuantity` applies.
 */
function displayableQuantity(ingredient: {
  quantity: number | null;
  unit: string | null;
  displayUnit: string | null;
}): number | null {
  if (ingredient.quantity === null) return null;

  const display = ingredient.displayUnit
    ? UNITS[ingredient.displayUnit]
    : undefined;
  if (!display || display.base !== ingredient.unit) {
    return ingredient.quantity;
  }

  return Math.round((ingredient.quantity / display.toBase) * 100) / 100;
}

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
  allIngredients,
  supermarkets,
  assignmentsByIngredient,
  kitchenId,
  recipe,
}: {
  allTags: RecipeTag[];
  allIngredients: IngredientOption[];
  supermarkets: Supermarket[];
  assignmentsByIngredient: Record<string, string[]>;
  /** For step photo storage paths, whose first segment is the kitchen id. */
  kitchenId: string;
  recipe?: RecipeDetail;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<RecipeFormInput, unknown, RecipeFormInput>({
    // `raw: true` is required, not a preference. The form still validates here,
    // but submits the values AS ENTERED, and the server action validates them
    // once. Without it, handleSubmit receives the schema's transformed OUTPUT —
    // ingredient heading rows already turned into grouped lines with no `kind` —
    // and the server's second parse of that output rejects every recipe with an
    // ingredient: "Invalid option: expected one of ingredient|heading".
    resolver: zodResolver(recipeFormSchema, undefined, { raw: true }),
    defaultValues: {
      name: recipe?.name ?? "",
      mealType: recipe?.mealType ?? "dinner",
      baseServings: recipe?.baseServings ?? 2,
      sourceUrl: recipe?.sourceUrl ?? "",
      notes: recipe?.notes ?? "",
      // Always at least one step on screen, even for a new recipe or one saved
      // without a method. It is a convention, not a rule: a blank step is
      // dropped on save, so a name-only recipe still saves. SPEC.md §8 Phase 2.
      steps:
        recipe && recipe.steps.length > 0
          ? recipe.steps.map((step) => ({
              title: step.title,
              description: step.description ?? "",
              photoPath: step.photoPath,
            }))
          : [{ ...BLANK_STEP }],
      tagIds: recipe?.tags.map((tag) => tag.id) ?? [],
      // Quantities come back in base units and go straight back out that way
      // unless edited, so the editor shows the unit they were entered in.
      //
      // Stored lines carry a group name; the editor shows a heading row wherever
      // a group starts instead.
      ingredients: withHeadings(recipe?.ingredients ?? []).map((entry) =>
        entry.kind === "heading"
          ? { ...BLANK_INGREDIENT_ROW, kind: "heading" as const, heading: entry.heading }
          : {
              ...BLANK_INGREDIENT_ROW,
              ingredientId: entry.line.ingredientId,
              quantity: displayableQuantity(entry.line),
              unit: entry.line.displayUnit ?? entry.line.unit,
              note: entry.line.note,
            },
      ),
    },
  });

  function onSubmit(values: RecipeFormInput) {
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
        <Label>Ingredients</Label>
        <IngredientEditor
          control={control}
          register={register}
          setValue={setValue}
          allIngredients={allIngredients}
          supermarkets={supermarkets}
          assignmentsByIngredient={assignmentsByIngredient}
        />
      </div>

      <div className="grid gap-2">
        <Label>Method</Label>
        <StepEditor
          control={control}
          register={register}
          setValue={setValue}
          errors={errors}
          kitchenId={kitchenId}
          recipeId={recipe?.id ?? null}
          photoUrls={Object.fromEntries(
            (recipe?.steps ?? []).flatMap((step) =>
              step.photoPath && step.photoUrl
                ? [[step.photoPath, step.photoUrl]]
                : [],
            ),
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
