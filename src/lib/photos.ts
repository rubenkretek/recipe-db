/**
 * Photo constants and the storage path rule.
 *
 * Deliberately free of server-only imports, because both the browser (which
 * resizes and uploads) and the server (which signs URLs) need these. The
 * server-side signing lives in `photo-urls.ts` instead — importing that from a
 * client component pulls `next/headers` into the browser bundle and breaks the
 * build.
 */

/** The private bucket holding every recipe photo. SPEC.md §5.8. */
export const PHOTO_BUCKET = "recipe-photos";

/** Longest edge of a stored photo, in pixels. SPEC.md §8 Phase 3. */
export const MAX_PHOTO_DIMENSION = 1600;

/** JPEG quality used when re-encoding. Roughly 200-400KB at 1600px. */
export const PHOTO_QUALITY = 0.8;

/** Bucket-enforced ceiling, mirrored here so the client can reject early. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** How many photos one recipe may hold. */
export const MAX_PHOTOS_PER_RECIPE = 10;

/**
 * Builds the storage path for a new photo.
 *
 * The kitchen id has to be the first segment: the RLS policy on
 * `storage.objects` reads it with `storage.foldername(name)[1]` and authorises
 * on that alone. Changing this shape breaks the security boundary, not just the
 * tidiness. SPEC.md §5.8.
 */
export function photoStoragePath(
  kitchenId: string,
  recipeId: string,
  fileId: string,
): string {
  return `${kitchenId}/${recipeId}/${fileId}.jpg`;
}

/** Shown when a paste carries no image, so pasting never fails silently. */
export const NO_CLIPBOARD_IMAGE =
  "No image found on the clipboard. If you copied it from a website, save it and upload it instead.";

/**
 * The image files carried by a paste, or none.
 *
 * Reads `items` first and falls back to `files`, because browsers disagree about
 * which one holds a pasted image — a screenshot usually appears in both, a file
 * copied in Finder or Explorer sometimes in only one.
 *
 * Anything that is not an image is ignored. That includes the link-and-HTML some
 * browsers put on the clipboard for "Copy image" on a web page, which cannot be
 * rescued: fetching the linked image from another site is blocked by its CORS
 * policy. Pasted screenshots arrive as PNG; the existing upload pipeline
 * re-encodes them to JPEG like any other photo.
 */
export function imageFilesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];

  const fromItems = Array.from(data.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);

  if (fromItems.length > 0) return fromItems;

  return Array.from(data.files ?? []).filter((file) =>
    file.type.startsWith("image/"),
  );
}
