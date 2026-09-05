import { z } from "zod";

/**
 * A supermarket name, as typed. Trimmed but not lower-cased: the name keeps the
 * capitalisation the author used, while the unique index on
 * `(kitchen_id, lower(name))` stops a second row differing only in case.
 */
const supermarketName = z
  .string()
  .trim()
  .min(1, "Give the supermarket a name.")
  .max(60, "That name is too long.");

export const createSupermarketSchema = z.object({
  name: supermarketName,
});

export const renameSupermarketSchema = z.object({
  supermarketId: z.uuid(),
  name: supermarketName,
});

export const supermarketIdSchema = z.object({
  supermarketId: z.uuid(),
});

/**
 * The full ordering after a drag, as ids in their new order.
 *
 * Sent whole rather than as a pair of indices so the server never has to
 * reconstruct what moved: the array position becomes `sort_order` directly.
 */
export const reorderSupermarketsSchema = z.object({
  supermarketIds: z.array(z.uuid()).min(1),
});

/**
 * Replaces every supermarket assignment for one ingredient.
 *
 * Sent as the complete set rather than as add/remove, so a half-applied change
 * is impossible and the caller never has to diff. An empty array is meaningful:
 * it means "sold nowhere in particular", which lands the ingredient in the
 * Unassigned group. SPEC.md §8 Phase 5 acceptance criterion 2.
 */
export const setIngredientSupermarketsSchema = z.object({
  ingredientId: z.uuid(),
  supermarketIds: z.array(z.uuid()),
});

export type CreateSupermarketInput = z.infer<typeof createSupermarketSchema>;
export type RenameSupermarketInput = z.infer<typeof renameSupermarketSchema>;
export type SetIngredientSupermarketsInput = z.infer<
  typeof setIngredientSupermarketsSchema
>;
