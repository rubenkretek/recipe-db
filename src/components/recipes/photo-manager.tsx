"use client";

import imageCompression from "browser-image-compression";
import { ChevronLeft, ChevronRight, ImagePlus, Star, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTO_DIMENSION,
  MAX_PHOTOS_PER_RECIPE,
  PHOTO_BUCKET,
  PHOTO_QUALITY,
  photoStoragePath,
} from "@/lib/photos";
import type { RecipePhoto } from "@/lib/recipes";
import { createClient } from "@/lib/supabase/client";
import {
  deletePhoto,
  makeCover,
  movePhoto,
  recordPhoto,
} from "@/server/actions/photos";

/**
 * Resizes and re-encodes a photo before it leaves the device.
 *
 * `browser-image-compression` is used rather than hand-rolled canvas work
 * specifically because it honours EXIF orientation. A canvas draw silently
 * discards it, which is why naive implementations turn every portrait phone
 * photo on its side.
 */
async function prepareForUpload(file: File): Promise<File> {
  return imageCompression(file, {
    maxWidthOrHeight: MAX_PHOTO_DIMENSION,
    initialQuality: PHOTO_QUALITY,
    fileType: "image/jpeg",
    useWebWorker: true,
    // The bucket rejects anything larger, so fail here where we can explain it.
    maxSizeMB: MAX_PHOTO_BYTES / (1024 * 1024),
  });
}

/**
 * Upload, reorder and delete photos for one recipe.
 *
 * Everything here saves immediately rather than waiting for the recipe form's
 * Save button, because files cannot sit in a form field waiting to be submitted.
 * The section is visually separated for that reason.
 *
 * Bytes go straight from the browser to Supabase Storage. They never pass
 * through a server action: Next caps an action's body at 1MB, and the round trip
 * through the Next server would double the bandwidth for no benefit. The RLS
 * policy on `storage.objects` is what authorises the write, keyed on the kitchen
 * id in the first path segment. See CLAUDE.md "Gotchas".
 */
export function PhotoManager({
  recipeId,
  kitchenId,
  photos,
}: {
  recipeId: string;
  kitchenId: string;
  photos: RecipePhoto[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const remaining = MAX_PHOTOS_PER_RECIPE - photos.length;
  const busy = isUploading || isPending;

  async function onFilesChosen(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList).slice(0, Math.max(remaining, 0));
    if (files.length === 0) {
      toast.error(`A recipe can hold ${MAX_PHOTOS_PER_RECIPE} photos.`);
      return;
    }

    setIsUploading(true);
    const supabase = createClient();
    let uploaded = 0;

    for (const file of files) {
      try {
        const prepared = await prepareForUpload(file);
        const path = photoStoragePath(kitchenId, recipeId, crypto.randomUUID());

        const { error: uploadError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, prepared, {
            contentType: "image/jpeg",
            upsert: false,
          });

        if (uploadError) {
          toast.error(`Could not upload ${file.name}: ${uploadError.message}`);
          continue;
        }

        const result = await recordPhoto({ recipeId, storagePath: path });
        if (result?.error) {
          // The object is up but unreferenced. Clear it rather than leaving a
          // file nothing points at.
          await supabase.storage.from(PHOTO_BUCKET).remove([path]);
          toast.error(result.error);
          continue;
        }

        uploaded += 1;
      } catch {
        // Almost always an undecodable format. iPhones sometimes hand over HEIC
        // rather than converting, and no desktop browser can decode it.
        toast.error(
          `Could not read ${file.name}. If it is a HEIC photo, share it as JPEG first.`,
        );
      }
    }

    setIsUploading(false);
    if (inputRef.current) inputRef.current.value = "";

    if (uploaded > 0) {
      toast.success(uploaded === 1 ? "Photo added." : `${uploaded} photos added.`);
      router.refresh();
    }
  }

  function run(action: () => Promise<{ error: string } | void>) {
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        toast.error(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">Photos</h2>
          <p className="text-muted-foreground text-xs">
            Saved as you go, separately from the rest of the form. The first is
            the cover.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy || remaining <= 0}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="size-4" />
          {isUploading ? "Uploading…" : "Add photos"}
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => onFilesChosen(event.target.files)}
      />

      {photos.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          No photos yet.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, index) => (
            <li key={photo.id} className="flex flex-col gap-1.5">
              <div className="bg-muted relative aspect-video overflow-hidden rounded-md border">
                {photo.url ? (
                  <img
                    src={photo.url}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="text-muted-foreground flex size-full items-center justify-center text-xs">
                    Unavailable
                  </div>
                )}
                {index === 0 && (
                  <span className="bg-background/90 absolute top-1 left-1 rounded px-1.5 py-0.5 text-xs font-medium">
                    Cover
                  </span>
                )}
              </div>

              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="Move earlier"
                  disabled={busy || index === 0}
                  onClick={() =>
                    run(() => movePhoto({ photoId: photo.id, direction: "earlier" }))
                  }
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="Move later"
                  disabled={busy || index === photos.length - 1}
                  onClick={() =>
                    run(() => movePhoto({ photoId: photo.id, direction: "later" }))
                  }
                >
                  <ChevronRight className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="Make cover"
                  title="Make cover"
                  disabled={busy || index === 0}
                  onClick={() => run(() => makeCover({ photoId: photo.id }))}
                >
                  <Star className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive ml-auto size-7"
                  aria-label="Delete photo"
                  disabled={busy}
                  onClick={() => run(() => deletePhoto({ photoId: photo.id }))}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
