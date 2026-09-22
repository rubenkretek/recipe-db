"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Heading, Plus, X } from "lucide-react";
import { useState } from "react";
import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";

import { SupermarketPickerButton } from "@/components/ingredients/supermarket-picker";
import {
  IngredientCombobox,
  type IngredientOption,
} from "@/components/recipes/ingredient-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Supermarket } from "@/lib/supermarkets";
import { UNITS, type Dimension } from "@/lib/units";
import { BLANK_INGREDIENT_ROW } from "@/schemas/ingredient";
import type { RecipeFormInput } from "@/schemas/recipe";

/** The unit picker, grouped so weights, volumes and counts are distinguishable. */
const UNIT_GROUPS: { label: string; dimension: Dimension }[] = [
  { label: "Weight", dimension: "weight" },
  { label: "Volume", dimension: "volume" },
  { label: "Count", dimension: "count" },
];

function unitsFor(dimension: Dimension): string[] {
  return Object.keys(UNITS).filter(
    (code) => UNITS[code].isInput && UNITS[code].dimension === dimension,
  );
}

/**
 * The ingredient list on the recipe form.
 *
 * Saved with the rest of the form, unlike photos: these are plain data, so
 * there is no reason to write them before the author presses Save.
 *
 * Quantities are entered in whatever unit suits — 1 kg, 2 tbsp — and converted
 * to base units server-side. Leaving the quantity blank means "to taste", which
 * stores null for both quantity and unit. SPEC.md §5.3.
 *
 * Headings ("Salad", "Dressing") are rows in the same list. An ingredient
 * belongs to the nearest heading above it, so dragging it past a heading moves
 * it into that group, and dragging a heading moves only the heading — keeping it
 * one flat sortable list rather than nested ones.
 */
/** The messages for one row, in the order they should be read. */
type RowErrors = {
  ingredientId?: { message?: string };
  quantity?: { message?: string };
  unit?: { message?: string };
  note?: { message?: string };
  heading?: { message?: string };
};

function messagesFor(rowErrors: RowErrors | undefined): string[] {
  if (!rowErrors) return [];

  return [
    rowErrors.ingredientId?.message,
    rowErrors.quantity?.message,
    rowErrors.unit?.message,
    rowErrors.note?.message,
    rowErrors.heading?.message,
  ].filter((message): message is string => Boolean(message));
}

export function IngredientEditor({
  control,
  register,
  setValue,
  errors,
  allIngredients,
  supermarkets,
  assignmentsByIngredient,
}: {
  control: Control<RecipeFormInput, unknown, RecipeFormInput>;
  register: UseFormRegister<RecipeFormInput>;
  setValue: UseFormSetValue<RecipeFormInput>;
  /**
   * Shown against the row that caused them. Without this an ingredient problem
   * was invisible: the only message on the page was one line under the Save
   * button, with nothing to say which of twenty rows it meant.
   */
  errors: FieldErrors<RecipeFormInput>;
  allIngredients: IngredientOption[];
  supermarkets: Supermarket[];
  /** Ingredient id to its assigned supermarket ids, for the row picker. */
  assignmentsByIngredient: Record<string, string[]>;
}) {
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "ingredients",
  });
  const [options, setOptions] = useState(allIngredients);

  // Pointer for mouse, Touch for phones — this list is edited on a phone as
  // often as a laptop — and Keyboard so reordering is reachable without a
  // pointer at all.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = fields.findIndex((field) => field.id === active.id);
    const to = fields.findIndex((field) => field.id === over.id);
    if (from !== -1 && to !== -1) {
      // sort_order is the array index at save time, so moving the row is all
      // the reordering there is.
      move(from, to);
    }
  }

  function rememberOption(ingredient: IngredientOption) {
    setOptions((current) =>
      current.some((option) => option.id === ingredient.id)
        ? current
        : [...current, ingredient].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {fields.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
          No ingredients yet.
        </p>
      ) : (
        <DndContext
          // Deterministic, so the accessibility id matches between server and
          // client. See the note in `supermarket-manager.tsx`.
          id="ingredient-editor"
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={fields.map((field) => field.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2">
              {fields.map((field, index) =>
                field.kind === "heading" ? (
                  <HeadingRow
                    key={field.id}
                    id={field.id}
                    index={index}
                    register={register}
                    messages={messagesFor(errors.ingredients?.[index])}
                    onRemove={() => remove(index)}
                  />
                ) : (
                  <IngredientRow
                    key={field.id}
                    id={field.id}
                    index={index}
                    control={control}
                    register={register}
                    setValue={setValue}
                    options={options}
                    onOptionCreated={rememberOption}
                    supermarkets={supermarkets}
                    assignmentsByIngredient={assignmentsByIngredient}
                    messages={messagesFor(errors.ingredients?.[index])}
                    onRemove={() => remove(index)}
                  />
                ),
              )}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => append({ ...BLANK_INGREDIENT_ROW })}
        >
          <Plus className="size-4" />
          Add ingredient
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            append({ ...BLANK_INGREDIENT_ROW, kind: "heading" })
          }
        >
          <Heading className="size-4" />
          Add heading
        </Button>
      </div>
    </div>
  );
}

/**
 * A heading within the ingredient list, e.g. "Dressing".
 *
 * Everything below it, down to the next heading, is in its group. A heading left
 * blank is ignored on save, and one with nothing under it is dropped — there is
 * no line to store it on.
 */
function HeadingRow({
  id,
  index,
  register,
  messages,
  onRemove,
}: {
  id: string;
  index: number;
  register: UseFormRegister<RecipeFormInput>;
  messages: string[];
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={
        isDragging
          ? "bg-background relative z-10 mt-2 flex items-center gap-2 rounded-md border-b-2 p-2 shadow-lg"
          : "mt-2 flex items-center gap-2 border-b-2 p-2 first:mt-0"
      }
    >
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
        aria-label="Reorder heading"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <Input
        placeholder="Heading, e.g. Dressing"
        aria-label="Ingredient group heading"
        className="font-semibold"
        {...register(`ingredients.${index}.heading`)}
      />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-destructive size-8 shrink-0"
        aria-label="Remove heading"
        onClick={onRemove}
      >
        <X className="size-4" />
      </Button>

      {messages.length > 0 && (
        <p className="text-destructive w-full text-sm">{messages.join(" ")}</p>
      )}
    </li>
  );
}

function IngredientRow({
  id,
  index,
  control,
  register,
  setValue,
  options,
  onOptionCreated,
  supermarkets,
  assignmentsByIngredient,
  messages,
  onRemove,
}: {
  id: string;
  index: number;
  control: Control<RecipeFormInput, unknown, RecipeFormInput>;
  register: UseFormRegister<RecipeFormInput>;
  setValue: UseFormSetValue<RecipeFormInput>;
  options: IngredientOption[];
  onOptionCreated: (ingredient: IngredientOption) => void;
  supermarkets: Supermarket[];
  assignmentsByIngredient: Record<string, string[]>;
  messages: string[];
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  // The ingredient and unit are read through Controller rather than local
  // state, so an existing recipe opens with its values already shown. Local
  // state initialised to null would render every row blank on the edit page.
  const unit = useWatch({ control, name: `ingredients.${index}.unit` });
  const ingredientId = useWatch({
    control,
    name: `ingredients.${index}.ingredientId`,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={
        isDragging
          ? "bg-background relative z-10 rounded-md border p-2 shadow-lg"
          : "rounded-md border p-2"
      }
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground mt-2 cursor-grab touch-none active:cursor-grabbing"
          aria-label="Reorder ingredient"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        <div className="grid flex-1 gap-2 sm:grid-cols-[5rem_7rem_1fr]">
          <Input
            type="number"
            step="any"
            min={0}
            inputMode="decimal"
            placeholder="Qty"
            aria-label="Quantity"
            {...register(`ingredients.${index}.quantity`, {
              // An empty box is "to taste", which must reach the schema as null
              // rather than NaN or "".
              setValueAs: (value) =>
                value === "" || value === null ? null : Number(value),
            })}
          />

          <Controller
            control={control}
            name={`ingredients.${index}.unit`}
            render={({ field }) => (
              <Select
                value={field.value ?? undefined}
                onValueChange={field.onChange}
              >
                <SelectTrigger aria-label="Unit">
                  <SelectValue placeholder="Unit" />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_GROUPS.map((group) => (
                    <SelectGroup key={group.dimension}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {unitsFor(group.dimension).map((code) => (
                        <SelectItem key={code} value={code}>
                          {code}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            )}
          />

          <Controller
            control={control}
            name={`ingredients.${index}.ingredientId`}
            render={({ field }) => (
              <IngredientCombobox
                options={options}
                value={field.value || null}
                onChange={(ingredient) => {
                  field.onChange(ingredient.id);

                  // Prefill the unit from the ingredient's default, but never
                  // overwrite a unit the author has already chosen.
                  if (!unit && ingredient.defaultUnit) {
                    setValue(
                      `ingredients.${index}.unit`,
                      ingredient.defaultUnit,
                    );
                  }
                }}
                onOptionCreated={onOptionCreated}
                supermarkets={supermarkets}
              />
            )}
          />
        </div>

        {/*
          Supermarket assignment belongs to the ingredient, not to this recipe
          line, so it saves immediately and applies everywhere. The popover says
          so. Only shown once an ingredient is actually picked.
        */}
        {ingredientId && (
          <SupermarketPickerButton
            ingredientId={ingredientId}
            supermarkets={supermarkets}
            assignedIds={assignmentsByIngredient[ingredientId] ?? []}
          />
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-destructive mt-0.5 size-8 shrink-0"
          aria-label="Remove ingredient"
          onClick={onRemove}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="mt-2 ml-6">
        <Input
          placeholder="finely chopped, plus extra to serve"
          aria-label="Note"
          {...register(`ingredients.${index}.note`)}
        />
      </div>

      {messages.length > 0 && (
        <p className="text-destructive mt-2 ml-6 text-sm">
          {messages.join(" ")}
        </p>
      )}
    </li>
  );
}
