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
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  CookingPot,
  GripVertical,
  ImageIcon,
  Minus,
  Plus,
  ShoppingCart,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { IngredientPicker } from "@/components/plan/ingredient-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { PlannedRecipe } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { MAX_PLANNED_SERVINGS, MIN_PLANNED_SERVINGS } from "@/schemas/plan";
import {
  removeFromPlan,
  reorderPlannedRecipes,
  setCooked,
  setPlannedServings,
} from "@/server/actions/plans";

/**
 * How long the servings stepper waits before writing.
 *
 * Holding `+` to go from 2 to 12 should be one round trip, not ten. Short
 * enough that letting go and immediately navigating away still saves.
 */
const SERVINGS_SAVE_DELAY_MS = 400;

/**
 * The recipes on a plan: reorder, rescale, tick as cooked, remove.
 * SPEC.md §8 Phase 6.
 *
 * Read-only for a completed plan, where the rows still render but nothing can
 * be changed — history is a record, not a draft.
 */
export function PlanBoard({
  recipes,
  readOnly = false,
}: {
  recipes: PlannedRecipe[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(recipes);
  const [lastRecipes, setLastRecipes] = useState(recipes);
  const [isPending, startTransition] = useTransition();

  // Drag handles appear only while reordering. They are wanted rarely — a plan
  // is reordered far less often than it is read — and a permanent handle in
  // every row costs the recipe name about 28px, which is a lot on a phone.
  const [isReordering, setIsReordering] = useState(false);

  // Props win whenever the server sends a new list, so an add or a remove from
  // elsewhere on the page does not leave this list stale. Adjusted during
  // render rather than in an effect: React re-runs this component immediately
  // without painting the stale list, where an effect would paint it first and
  // then correct it. https://react.dev/learn/you-might-not-need-an-effect
  if (recipes !== lastRecipes) {
    setLastRecipes(recipes);
    setItems(recipes);
  }

  // Pointer for mouse, Touch for phones, Keyboard so reordering is reachable
  // without a pointer at all. Same sensors as every other sortable list here.
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

    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from === -1 || to === -1) return;

    // Move locally first so the row lands where it was dropped, then persist
    // the whole ordering — the array index becomes sort_order.
    const reordered = arrayMove(items, from, to);
    setItems(reordered);

    startTransition(async () => {
      const result = await reorderPlannedRecipes({
        plannedRecipeIds: reordered.map((item) => item.id),
      });
      if (result?.error) {
        setItems(items);
        toast.error(result.error);
      } else {
        router.refresh();
      }
    });
  }

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center text-sm">
        {readOnly
          ? "Nothing was on this plan."
          : "Nothing planned yet. Add a recipe to get started."}
      </p>
    );
  }

  if (readOnly) {
    return (
      <ul className="flex flex-col gap-6">
        {items.map((planned) => (
          <PlannedRecipeRow
            key={planned.id}
            planned={planned}
            readOnly
            isPending={false}
            isReordering={false}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Nothing to reorder with a single recipe, so the button stays away. */}
      {items.length > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            {isReordering ? "Drag the handles to reorder." : null}
          </p>
          <Button
            type="button"
            variant={isReordering ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={isReordering}
            onClick={() => setIsReordering((current) => !current)}
          >
            {isReordering ? (
              <Check className="size-4" />
            ) : (
              <ArrowUpDown className="size-4" />
            )}
            {isReordering ? "Done" : "Reorder"}
          </Button>
        </div>
      )}

      <DndContext
        // Deterministic, so the accessibility id matches between server and
        // client. See the note in `supermarket-manager.tsx`.
        id="plan-board"
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={items.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-6">
            {items.map((planned) => (
              <PlannedRecipeRow
                key={planned.id}
                planned={planned}
                isPending={isPending}
                isReordering={isReordering}
                onRemoved={() =>
                  setItems((current) =>
                    current.filter((item) => item.id !== planned.id),
                  )
                }
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function PlannedRecipeRow({
  planned,
  isPending,
  readOnly = false,
  isReordering,
  onRemoved,
}: {
  planned: PlannedRecipe;
  isPending: boolean;
  readOnly?: boolean;
  /** Shows the drag handle and lets the row be dragged. */
  isReordering: boolean;
  onRemoved?: () => void;
}) {
  const router = useRouter();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: planned.id, disabled: readOnly || !isReordering });

  const isCooked = planned.cookedAt !== null;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        // Its own card, separated by a gap, rather than a band in one long
        // bordered list: each row is a recipe with its own actions.
        "bg-background bg-gray-900 flex flex-col gap-2 rounded-lg border p-3",
        // A cooked recipe recedes: it is done, and what is left to cook should
        // be what catches the eye.
        isCooked && "bg-muted/40",
        // Last, so the lifted row keeps a solid background while dragging
        // rather than the cooked tint. `cn` merges the conflicting background.
        isDragging && "bg-background relative z-10 shadow-lg",
      )}
    >
      {/*
        Wraps on a phone: the name takes the whole first line and the controls
        drop to a second one. `basis-full` is what forces that — with only
        `min-w-0` the name would shrink to a sliver beside the controls instead
        of wrapping, which left it a few characters wide at 360px. From `sm`
        upwards everything fits on one line again.
      */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 basis-full items-center gap-3 sm:basis-0 sm:flex-1">
          {!readOnly && isReordering && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
              aria-label={`Reorder ${planned.name}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
          )}

          <Link
            href={`/recipes/${planned.recipeId}`}
            className="bg-muted text-muted-foreground/40 flex size-12 shrink-0 items-center justify-center overflow-hidden rounded"
          >
            {planned.coverUrl ? (
              <img
                src={planned.coverUrl}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
            ) : (
              <ImageIcon className="size-5" />
            )}
          </Link>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {/* Wraps rather than truncates: with a line to itself there is room
                for it, and a cut-off recipe name is unreadable. `wrap-break-word`
                keeps a long unbroken word inside the row. */}
            <Link
              href={`/recipes/${planned.recipeId}`}
              className={
                isCooked
                  ? "text-muted-foreground text-sm font-medium wrap-break-word line-through"
                  : "text-sm font-medium wrap-break-word hover:underline"
              }
            >
              {planned.name}
            </Link>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="capitalize">
                {planned.mealType}
              </Badge>
              {/* No "Cooked" badge: the button below says so, and the greyed
                  card and struck-through name already carry it. */}
              {planned.archivedAt && <Badge variant="outline">Archived</Badge>}
            </div>
          </div>
        </div>

        {/* Right-aligned on the phone's second line, inline on wider screens. */}
        <div className="flex shrink-0 justify-between w-full items-between gap-3">
          {readOnly ? (
            <span className="text-muted-foreground text-sm tabular-nums">
              {planned.servings}{" "}
              {planned.servings === 1 ? "serving" : "servings"}
            </span>
          ) : (
            <ServingsStepper planned={planned} />
          )}

          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="text-destructive w-24"
              aria-label={`Remove ${planned.name} from the plan`}
              disabled={isPending}
              onClick={() => {
                onRemoved?.();
                void removeFromPlan({ plannedRecipeId: planned.id }).then(
                  (result) => {
                    if (result?.error) toast.error(result.error);
                    router.refresh();
                  },
                );
              }}
            >
              <span>Remove</span>
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* The row's two actions, half the card each. Full width beats squeezing
          them beside the thumbnail: both are tapped with a thumb.
          SPEC.md §7 plan-screen detail. */}
      {!readOnly && (
        <div className="grid grid-cols-2 gap-2">
          {planned.ingredients.length > 0 && (
            <IngredientPicker
              recipes={[planned]}
              mode="recipe"
              trigger={
                <Button
                  type="button"
                  // `outline` rather than `ghost` once something has been
                  // added: a ghost button has no border or fill and reads as
                  // plain text sitting next to a real button.
                  variant={planned.addedCount > 0 ? "outline" : "secondary"}
                  size="sm"
                  className="h-auto w-full flex-col gap-0.5 py-2"
                >
                  <span className="flex items-center gap-1.5">
                    <ShoppingCart className="size-4" />
                    Add ingredients
                  </span>
                  {/* Quieter than the label: a progress note, not the action. */}
                  {planned.addedCount > 0 && (
                    <span className="text-muted-foreground text-[10px] font-normal">
                      {planned.addedCount} of {planned.ingredients.length} added
                    </span>
                  )}
                </Button>
              }
            />
          )}

          <Button
            type="button"
            variant={isCooked ? "secondary" : "outline"}
            size="sm"
            // A toggle, so it reports its state rather than just its label.
            aria-pressed={isCooked}
            className={cn(
              "h-auto w-full flex-col gap-0.5 py-2",
              // Nothing to add from a recipe with no ingredients, so this takes
              // the whole width rather than leaving a gap.
              planned.ingredients.length === 0 && "col-span-2",
            )}
            disabled={isPending}
            onClick={() => {
              // Not optimistic: the card restyles heavily when this flips, and
              // a revert would be more jarring than the wait.
              void setCooked({
                plannedRecipeId: planned.id,
                cooked: !isCooked,
              }).then((result) => {
                if (result?.error) toast.error(result.error);
                router.refresh();
              });
            }}
          >
            <span className="flex items-center gap-1.5">
              {isCooked ? (
                <Check className="size-4" />
              ) : (
                <CookingPot className="size-4" />
              )}
              {isCooked ? "Cooked" : "Mark cooked"}
            </span>
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * The per-recipe servings control: a small button showing the number, with the
 * stepper itself in a popover.
 *
 * A permanent stepper is three controls wide in every row — roughly 100px — for
 * a number that is set once when the recipe goes on the plan and rarely touched
 * again. The button states the servings, which is what you actually read, and
 * the `Users` icon plus the chevron say it opens something.
 *
 * Unlike the recipe detail page's stepper, this persists: it is the number the
 * ingredient picker scales by. SPEC.md §6.2. The value updates locally on every
 * tap and the write is debounced, so holding `+` is one round trip rather than
 * one per press.
 */
function ServingsStepper({ planned }: { planned: PlannedRecipe }) {
  const router = useRouter();
  const [servings, setServings] = useState(planned.servings);
  const [lastSaved, setLastSaved] = useState(planned.servings);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The server is the authority whenever it sends a new number — after a
  // refresh, or when the other person changes it. Adjusted during render for
  // the same reason as the list above.
  if (planned.servings !== lastSaved) {
    setLastSaved(planned.servings);
    setServings(planned.servings);
  }

  // A row can be removed, or the page navigated away from, with a save still
  // queued. Without this the timer fires against an unmounted component.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function change(next: number) {
    if (next < MIN_PLANNED_SERVINGS || next > MAX_PLANNED_SERVINGS) return;

    setServings(next);
    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(() => {
      void setPlannedServings({
        plannedRecipeId: planned.id,
        servings: next,
      }).then((result) => {
        if (result?.error) {
          setServings(planned.servings);
          toast.error(result.error);
        }
        router.refresh();
      });
    }, SERVINGS_SAVE_DELAY_MS);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 gap-1 px-2"
          // The visible number is the servings; the label says what pressing
          // this does, which the number alone would not.
          aria-label={`Change servings for ${planned.name}`}
        >
          <Users className="size-3.5" />
          <span className="text-xs tabular-nums">{servings}</span>
          <ChevronDown className="text-muted-foreground size-3" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-auto p-3">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Servings</p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              aria-label={`Fewer servings of ${planned.name}`}
              disabled={servings <= MIN_PLANNED_SERVINGS}
              onClick={() => change(servings - 1)}
            >
              <Minus className="size-4" />
            </Button>
            <span
              className="w-8 text-center text-sm tabular-nums"
              aria-live="polite"
            >
              {servings}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              aria-label={`More servings of ${planned.name}`}
              disabled={servings >= MAX_PLANNED_SERVINGS}
              onClick={() => change(servings + 1)}
            >
              <Plus className="size-4" />
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            What the shopping list scales by.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
