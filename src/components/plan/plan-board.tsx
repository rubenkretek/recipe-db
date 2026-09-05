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
import { GripVertical, ImageIcon, Minus, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { PlannedRecipe } from "@/lib/plans";
import {
  MAX_PLANNED_SERVINGS,
  MIN_PLANNED_SERVINGS,
} from "@/schemas/plan";
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
      <ul className="flex flex-col divide-y rounded-lg border">
        {items.map((planned) => (
          <PlannedRecipeRow
            key={planned.id}
            planned={planned}
            readOnly
            isPending={false}
          />
        ))}
      </ul>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex flex-col divide-y rounded-lg border">
          {items.map((planned) => (
            <PlannedRecipeRow
              key={planned.id}
              planned={planned}
              isPending={isPending}
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
  );
}

function PlannedRecipeRow({
  planned,
  isPending,
  readOnly = false,
  onRemoved,
}: {
  planned: PlannedRecipe;
  isPending: boolean;
  readOnly?: boolean;
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
  } = useSortable({ id: planned.id, disabled: readOnly });

  const isCooked = planned.cookedAt !== null;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={
        isDragging
          ? "bg-background relative z-10 flex items-center gap-3 p-3 shadow-lg"
          : "flex items-center gap-3 p-3"
      }
    >
      {!readOnly && (
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
        <Link
          href={`/recipes/${planned.recipeId}`}
          className={
            isCooked
              ? "text-muted-foreground truncate text-sm font-medium line-through"
              : "truncate text-sm font-medium hover:underline"
          }
        >
          {planned.name}
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="capitalize">
            {planned.mealType}
          </Badge>
          {isCooked && <Badge variant="secondary">Cooked</Badge>}
          {planned.archivedAt && <Badge variant="outline">Archived</Badge>}
        </div>
      </div>

      {readOnly ? (
        <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
          {planned.servings} {planned.servings === 1 ? "serving" : "servings"}
        </span>
      ) : (
        <ServingsStepper planned={planned} />
      )}

      {!readOnly && (
        <>
          <Checkbox
            checked={isCooked}
            aria-label={`Mark ${planned.name} cooked`}
            onCheckedChange={(checked) => {
              // Not optimistic: the row restyles heavily when this flips, and a
              // revert would be more jarring than the wait.
              void setCooked({
                plannedRecipeId: planned.id,
                cooked: checked === true,
              }).then((result) => {
                if (result?.error) toast.error(result.error);
                router.refresh();
              });
            }}
          />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive size-8 shrink-0"
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
            <X className="size-4" />
          </Button>
        </>
      )}
    </li>
  );
}

/**
 * The per-recipe servings control.
 *
 * Unlike the recipe detail page's stepper, this persists: it is the number the
 * Phase 7 ingredient picker will scale by. SPEC.md §6.2. The value updates
 * locally on every tap and the write is debounced, so holding `+` is one round
 * trip rather than one per press.
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
    <div className="flex shrink-0 items-center gap-1">
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
      <span className="w-6 text-center text-sm tabular-nums" aria-live="polite">
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
  );
}
