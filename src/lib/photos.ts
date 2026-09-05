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
