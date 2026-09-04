import { z } from "zod";

/**
 * Profile edits available in Phase 1. Avatars wait for Phase 3, when Supabase
 * Storage and its kitchen-scoped path policy exist.
 */
export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Tell us what to call you.")
    .max(60, "That name is too long."),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
