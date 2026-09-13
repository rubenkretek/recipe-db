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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import { toast } from "sonner";

import { MethodEditor } from "@/components/recipes/method-editor";
import { prepareForUpload } from "@/components/recipes/photo-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NO_CLIPBOARD_IMAGE,
  PHOTO_BUCKET,
  imageFilesFromClipboard,
  photoStoragePath,
} from "@/lib/photos";
import { createClient } from "@/lib/supabase/client";
import {
  BLANK_STEP,
  type RecipeFormInput,
  type RecipeFormValues,
} from "@/schemas/recipe";

/**
 * The method, as an ordered list of steps, on the recipe form.
 *
 * Titles, descriptions and order save with the rest of the form, like
 * ingredients. Photos cannot wait for Save — a file cannot sit in a form field —
 * so a chosen photo uploads straight to Storage at once and only its path goes
 * into the form. The path is what Save records.
 *
 * That leaves one gap to close: a photo uploaded during this edit and then
 * removed or replaced before Save would never be referenced by anything. Such
 * photos are deleted immediately. Photos that were already saved are left for
 * the server to remove once the new steps are safely written, so pressing
 * Cancel never loses one.
 */
export function StepEditor({
  control,
  register,
  setValue,
  errors,
  kitchenId,
  recipeId,
  photoUrls,
}: {
  control: Control<RecipeFormInput, unknown, RecipeFormValues>;
  register: UseFormRegister<RecipeFormInput>;
  setValue: UseFormSetValue<RecipeFormInput>;
  errors: FieldErrors<RecipeFormInput>;
  kitchenId: string;
  /**
   * Null on the new-recipe page. A photo's storage path contains the recipe id,
   * so there is nowhere to file one until the recipe exists — the same rule the
   * gallery follows.
   */
  recipeId: string | null;
  /** Saved photo path to signed URL, for showing photos already on steps. */
  photoUrls: Record<string, string>;
}) {
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "steps",
  });

  // Paths that were saved when the form opened. Anything not in here was
  // uploaded during this edit.
  const [savedPaths] = useState(() => new Set(Object.keys(photoUrls)));
  const [previews, setPreviews] = useState<Record<string, string>>(photoUrls);

  // Same sensors as every other sortable list in the app: pointer, touch for
  // phones, and keyboard so reordering needs no pointer at all.
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
      // The array index is `sort_order` at save time, and the step numbers
      // shown are derived from it, so moving the row renumbers everything.
      move(from, to);
    }
  }

  /**
   * Deletes a photo nothing will reference, if it was uploaded in this edit.
   * Best effort: an orphaned file is invisible and costs a few hundred KB.
   */
  function discardIfUnsaved(path: string) {
    if (savedPaths.has(path)) return;
    void createClient().storage.from(PHOTO_BUCKET).remove([path]);
  }

  return (
    <div className="flex flex-col gap-3">
      <DndContext
        // Explicit id: dnd-kit's generated one differs between server and
        // client and causes a hydration mismatch. See CLAUDE.md "Gotchas".
        id="step-editor"
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={fields.map((field) => field.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol className="flex flex-col gap-3">
            {fields.map((field, index) => (
              <StepRow
                key={field.id}
                id={field.id}
                index={index}
                control={control}
                register={register}
                setValue={setValue}
                titleError={errors.steps?.[index]?.title?.message}
                kitchenId={kitchenId}
                recipeId={recipeId}
                previews={previews}
                onPreview={(path, url) =>
                  setPreviews((current) => ({ ...current, [path]: url }))
                }
                onDiscard={discardIfUnsaved}
                // A recipe keeps at least one step on screen. Clearing the last
                // one's text is how to have no method; a blank step is dropped
                // on save.
                canRemove={fields.length > 1}
                onRemove={(photoPath) => {
                  if (photoPath) discardIfUnsaved(photoPath);
                  remove(index);
                }}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => append({ ...BLANK_STEP })}
      >
        <Plus className="size-4" />
        Add step
      </Button>

      {!recipeId && (
        <p className="text-muted-foreground text-xs">
          Step photos can be added once the recipe is saved.
        </p>
      )}
    </div>
  );
}

function StepRow({
  id,
  index,
  control,
  register,
  setValue,
  titleError,
  kitchenId,
  recipeId,
  previews,
  onPreview,
  onDiscard,
  canRemove,
  onRemove,
}: {
  id: string;
  index: number;
  control: Control<RecipeFormInput, unknown, RecipeFormValues>;
  register: UseFormRegister<RecipeFormInput>;
  setValue: UseFormSetValue<RecipeFormInput>;
  titleError: string | undefined;
  kitchenId: string;
  recipeId: string | null;
  previews: Record<string, string>;
  onPreview: (path: string, url: string) => void;
  onDiscard: (path: string) => void;
  canRemove: boolean;
  onRemove: (photoPath: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Read through the form rather than local state, so an existing recipe opens
  // with its photos already showing.
  const photoPath = useWatch({ control, name: `steps.${index}.photoPath` });
  const stepNumber = index + 1;

  async function onFileChosen(file: File | undefined) {
    if (!file || !recipeId) return;

    setIsUploading(true);
    try {
      const prepared = await prepareForUpload(file);
      const path = photoStoragePath(kitchenId, recipeId, crypto.randomUUID());

      // Straight to Storage, never through a server action. The storage policy
      // authorises the write on the kitchen id in the first path segment.
      const { error } = await createClient()
        .storage.from(PHOTO_BUCKET)
        .upload(path, prepared, { contentType: "image/jpeg", upsert: false });

      if (error) {
        toast.error(`Could not upload ${file.name}: ${error.message}`);
        return;
      }

      const replaced = photoPath;
      // A local preview: the new object has no signed URL yet, and minting one
      // just to show what is already in memory would be a wasted round trip.
      onPreview(path, URL.createObjectURL(prepared));
      setValue(`steps.${index}.photoPath`, path, { shouldDirty: true });
      if (replaced) onDiscard(replaced);
    } catch {
      // Almost always an undecodable format, typically HEIC from an iPhone.
      toast.error(
        `Could not read ${file.name}. If it is a HEIC photo, share it as JPEG first.`,
      );
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  /**
   * A pasted image becomes this step's photo, replacing any it already has —
   * the same outcome as pressing Replace. A step holds one photo, so if the
   * clipboard carries several, the first is used.
   *
   * The paste box wraps only the photo, never the description, so pasting text
   * into the markdown editor is untouched.
   */
  function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const [image] = imageFilesFromClipboard(event.clipboardData);
    if (!image) {
      toast.error(NO_CLIPBOARD_IMAGE);
      return;
    }

    event.preventDefault();
    if (isUploading) {
      toast.error("Wait for the current upload to finish.");
      return;
    }
    void onFileChosen(image);
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={
        isDragging
          ? "bg-background relative z-10 flex flex-col gap-3 rounded-md border p-3 shadow-lg"
          : "flex flex-col gap-3 rounded-md border p-3"
      }
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
          aria-label={`Reorder step ${stepNumber}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="text-sm font-medium">Step {stepNumber}</span>

        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive ml-auto size-8"
            aria-label={`Remove step ${stepNumber}`}
            onClick={() => onRemove(photoPath ?? null)}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      <div className="grid gap-1.5">
        <Input
          placeholder="Make the sauce"
          aria-label={`Step ${stepNumber} title`}
          {...register(`steps.${index}.title`)}
        />
        {titleError && <p className="text-destructive text-sm">{titleError}</p>}
      </div>

      <Controller
        control={control}
        name={`steps.${index}.description`}
        render={({ field }) => (
          <MethodEditor
            compact
            value={field.value ?? ""}
            onChange={field.onChange}
            placeholder="Optional. Markdown works here."
          />
        )}
      />

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => onFileChosen(event.target.files?.[0])}
      />

      {/*
        The paste target. Only focusable once the recipe exists — before that
        there is no folder to upload into, exactly as with the Add photo button.
        Highlights on `focus` rather than `focus-visible` so a click shows it is
        ready; see the gallery section in photo-manager.tsx.
      */}
      <div
        tabIndex={recipeId ? 0 : undefined}
        onPaste={recipeId ? onPaste : undefined}
        aria-label={
          recipeId
            ? `Step ${stepNumber} photo. Click here and paste to add a copied image.`
            : undefined
        }
        className="focus:border-ring focus:ring-ring/50 flex flex-col gap-2 rounded-md border border-dashed p-2 outline-none focus:ring-[3px]"
      >
      {photoPath ? (
        <div className="flex items-end gap-2">
          <div className="bg-muted aspect-video w-40 overflow-hidden rounded-md border">
            {previews[photoPath] ? (
              <img
                src={previews[photoPath]}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <div className="text-muted-foreground flex size-full items-center justify-center text-xs">
                Unavailable
              </div>
            )}
          </div>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isUploading || !recipeId}
              onClick={() => inputRef.current?.click()}
            >
              {isUploading ? "Uploading…" : "Replace"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={isUploading}
              onClick={() => {
                setValue(`steps.${index}.photoPath`, null, { shouldDirty: true });
                onDiscard(photoPath);
              }}
            >
              <Trash2 className="size-4" />
              Remove photo
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          disabled={isUploading || !recipeId}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="size-4" />
          {isUploading ? "Uploading…" : "Add photo"}
        </Button>
      )}
      {recipeId && (
        <p className="text-muted-foreground text-xs">
          {photoPath
            ? "Or click this box and paste to replace it."
            : "Or click this box and paste a copied image."}
        </p>
      )}
      </div>
    </li>
  );
}
