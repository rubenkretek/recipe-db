import { z } from "zod";

/**
 * Records a photo that the browser has already uploaded to Storage.
 *
 * The bytes never pass through a server action — they go from the browser
 * straight to Supabase Storage, guarded by the RLS policy on `storage.objects`.
 * This only writes the metadata row. See CLAUDE.md "Gotchas".
 *
 * `storagePath` is validated against the exact shape the storage policy
 * authorises on, so a caller cannot record a row pointing at another kitchen's
 * folder even though the row itself is kitchen-scoped by RLS.
 */
export const recordPhotoSchema = z.object({
  recipeId: z.uuid(),
  storagePath: z
    .string()
    .regex(
      /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/i,
      "That is not a valid photo path.",
    ),
});

export const photoIdSchema = z.object({
  photoId: z.uuid(),
});

export const movePhotoSchema = z.object({
  photoId: z.uuid(),
  direction: z.enum(["earlier", "later"]),
});

export type RecordPhotoInput = z.infer<typeof recordPhotoSchema>;
export type MovePhotoInput = z.infer<typeof movePhotoSchema>;
