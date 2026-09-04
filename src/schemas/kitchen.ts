import { z } from "zod";

/** Length of a generated invite code. Matches create_invite() in the database. */
export const INVITE_CODE_LENGTH = 8;

/**
 * Kitchen name. The 60 character ceiling matches the check constraint on
 * kitchens.name, so the form rejects what the database would reject.
 */
const kitchenName = z
  .string()
  .trim()
  .min(1, "Give the kitchen a name.")
  .max(60, "That name is too long.");

export const createKitchenSchema = z.object({
  name: kitchenName,
});

export const renameKitchenSchema = z.object({
  kitchenId: z.uuid(),
  name: kitchenName,
});

export const kitchenIdSchema = z.object({
  kitchenId: z.uuid(),
});

export const inviteIdSchema = z.object({
  inviteId: z.uuid(),
});

/**
 * An invite code as typed by a human. Case and surrounding whitespace are
 * normalised here; the database matches case-insensitively regardless.
 */
export const redeemInviteSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .length(INVITE_CODE_LENGTH, `Codes are ${INVITE_CODE_LENGTH} characters.`),
});

export type CreateKitchenInput = z.infer<typeof createKitchenSchema>;
export type RenameKitchenInput = z.infer<typeof renameKitchenSchema>;
export type RedeemInviteInput = z.infer<typeof redeemInviteSchema>;
