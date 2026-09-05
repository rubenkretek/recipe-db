"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { RecipePhoto } from "@/lib/recipes";

/**
 * The photo gallery on a recipe page: a cover with thumbnails beneath, each
 * opening full size in a dialog.
 *
 * Uses a plain `<img>` rather than `next/image` throughout. Signed URLs carry a
 * token that rotates, so the image optimiser would re-fetch and re-encode every
 * photo on each new URL for no benefit — and these are already resized to
 * 1600px before upload.
 */
export function PhotoGallery({
  photos,
  recipeName,
}: {
  photos: RecipePhoto[];
  recipeName: string;
}) {
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  const usable = photos.filter((photo) => photo.url !== null);

  if (usable.length === 0) {
    return null;
  }

  const [cover, ...rest] = usable;

  return (
    <div className="flex flex-col gap-2">
      <Lightbox
        photo={cover}
        recipeName={recipeName}
        isOpen={openPhotoId === cover.id}
        onOpenChange={(open) => setOpenPhotoId(open ? cover.id : null)}
      >
        <button
          type="button"
          className="bg-muted w-full overflow-hidden rounded-lg border"
        >
          <img
            src={cover.url!}
            alt={recipeName}
            className="aspect-video w-full object-cover"
          />
        </button>
      </Lightbox>

      {rest.length > 0 && (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {rest.map((photo) => (
            <li key={photo.id}>
              <Lightbox
                photo={photo}
                recipeName={recipeName}
                isOpen={openPhotoId === photo.id}
                onOpenChange={(open) => setOpenPhotoId(open ? photo.id : null)}
              >
                <button
                  type="button"
                  className="bg-muted w-full overflow-hidden rounded-md border"
                >
                  <img
                    src={photo.url!}
                    alt=""
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                </button>
              </Lightbox>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Lightbox({
  photo,
  recipeName,
  isOpen,
  onOpenChange,
  children,
}: {
  photo: RecipePhoto;
  recipeName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-3xl p-2">
        <DialogTitle className="sr-only">{recipeName}</DialogTitle>
        <img
          src={photo.url!}
          alt={recipeName}
          className="max-h-[80vh] w-full rounded object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}
