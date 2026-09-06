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
import { Check, GripVertical, Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Supermarket } from "@/lib/supermarkets";
import {
  createSupermarket,
  deleteSupermarket,
  renameSupermarket,
  reorderSupermarkets,
} from "@/server/actions/supermarkets";

/**
 * Create, rename, reorder and delete the kitchen's supermarkets.
 * SPEC.md §8 Phase 5.
 *
 * The order is the point of the drag handle, not decoration: it becomes the
 * order of the supermarket chips on the Phase 7 shopping screen, which is
 * walked in aisle order with a trolley.
 */
export function SupermarketManager({
  supermarkets,
}: {
  supermarkets: Supermarket[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(supermarkets);
  const [lastSupermarkets, setLastSupermarkets] = useState(supermarkets);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Supermarket | null>(null);
  const [isPending, startTransition] = useTransition();

  // The list is held locally so a drag lands instantly, which means the props
  // arriving after `router.refresh()` have to win — otherwise a newly added or
  // renamed shop never appears until the page is reloaded by hand. Adjusted
  // during render rather than in an effect, the same shape as `PlanBoard`.
  // See CLAUDE.md "Syncing props into state belongs in render, not an effect".
  if (supermarkets !== lastSupermarkets) {
    setLastSupermarkets(supermarkets);
    setItems(supermarkets);
  }

  // Pointer for mouse, Touch for phones, Keyboard so reordering is reachable
  // without a pointer at all. Same sensors as the ingredient editor.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function run(
    action: () => Promise<{ error: string } | void>,
    success: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        toast.error(result.error);
        router.refresh();
      } else {
        toast.success(success);
        router.refresh();
      }
    });
  }

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
      const result = await reorderSupermarkets({
        supermarketIds: reordered.map((item) => item.id),
      });
      if (result?.error) {
        setItems(items);
        toast.error(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
          No supermarkets yet. Add the shops you actually use.
        </p>
      ) : (
        <DndContext
          // Explicit id, not optional. dnd-kit derives its accessibility
          // `aria-describedby` from a MODULE-SCOPED counter, which on the
          // server climbs for the life of the Node process and in the browser
          // restarts at 0 — so the two disagree and React reports a hydration
          // mismatch. Naming it makes the attribute deterministic.
          id="supermarket-manager"
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
              {items.map((supermarket) => (
                <SupermarketRow
                  key={supermarket.id}
                  supermarket={supermarket}
                  isEditing={editingId === supermarket.id}
                  draftName={draftName}
                  isPending={isPending}
                  onDraftChange={setDraftName}
                  onStartEditing={() => {
                    setEditingId(supermarket.id);
                    setDraftName(supermarket.name);
                  }}
                  onCancelEditing={() => setEditingId(null)}
                  onRename={() => {
                    run(
                      () =>
                        renameSupermarket({
                          supermarketId: supermarket.id,
                          name: draftName,
                        }),
                      "Renamed.",
                    );
                    setEditingId(null);
                  }}
                  onDelete={() => setPendingDelete(supermarket)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!newName.trim()) return;
          run(() => createSupermarket({ name: newName }), "Supermarket added.");
          setNewName("");
        }}
      >
        <Input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Add a supermarket"
          aria-label="New supermarket name"
        />
        <Button type="submit" variant="secondary" disabled={isPending}>
          <Plus className="size-4" />
          Add
        </Button>
      </form>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.ingredientCount
                ? `${pendingDelete.ingredientCount} ${
                    pendingDelete.ingredientCount === 1
                      ? "ingredient is"
                      : "ingredients are"
                  } assigned here and will become unassigned. No ingredient is deleted.`
                : "Nothing is assigned to it, so nothing else changes."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!pendingDelete) return;
                const id = pendingDelete.id;
                setItems((current) => current.filter((item) => item.id !== id));
                run(
                  () => deleteSupermarket({ supermarketId: id }),
                  "Supermarket deleted.",
                );
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SupermarketRow({
  supermarket,
  isEditing,
  draftName,
  isPending,
  onDraftChange,
  onStartEditing,
  onCancelEditing,
  onRename,
  onDelete,
}: {
  supermarket: Supermarket;
  isEditing: boolean;
  draftName: string;
  isPending: boolean;
  onDraftChange: (value: string) => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: supermarket.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={
        isDragging
          ? "bg-background relative z-10 flex items-center gap-2 p-3 shadow-lg"
          : "flex items-center gap-2 p-3"
      }
    >
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
        aria-label={`Reorder ${supermarket.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      {isEditing ? (
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onRename();
          }}
        >
          <Input
            value={draftName}
            onChange={(event) => onDraftChange(event.target.value)}
            aria-label="Supermarket name"
            autoFocus
          />
          <Button type="submit" size="icon" className="size-8" disabled={isPending}>
            <Check className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onCancelEditing}
          >
            <X className="size-4" />
          </Button>
        </form>
      ) : (
        <>
          <div className="flex-1">
            <p className="text-sm font-medium">{supermarket.name}</p>
            <p className="text-muted-foreground text-xs">
              {supermarket.ingredientCount === 0
                ? "Nothing assigned"
                : `${supermarket.ingredientCount} ${
                    supermarket.ingredientCount === 1
                      ? "ingredient"
                      : "ingredients"
                  }`}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Rename ${supermarket.name}`}
            onClick={onStartEditing}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive size-8"
            aria-label={`Delete ${supermarket.name}`}
            onClick={onDelete}
          >
            <X className="size-4" />
          </Button>
        </>
      )}
    </li>
  );
}
