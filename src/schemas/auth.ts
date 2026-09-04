import { z } from "zod";

/**
 * Minimum password length enforced in the app.
 *
 * Supabase enforces its own minimum server-side (6 by default). This is
 * deliberately stricter, so the client-side message is the one users see rather
 * than a raw API error.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Signup input. The display name is required here and passed to Supabase as
 * options.data.display_name, because email signup carries no metadata otherwise
 * and the profile trigger would fall back to the email local part.
 * See CLAUDE.md "Gotchas".
 */
export const signUpSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Tell us what to call you.")
    .max(60, "That name is too long."),
  email: z.email("That does not look like an email address."),
  password: z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    ),
  // Where to go afterwards, used when an invite link sent someone here to sign
  // up first. Never trusted as given: see safeRedirectPath in lib/redirect.ts.
  next: z.string().optional(),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

/**
 * Login input. No length rule on the password: an existing account may predate
 * any rule we introduce, and the only useful answer here is whether it matches.
 */
export const logInSchema = z.object({
  email: z.email("That does not look like an email address."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export type LogInInput = z.infer<typeof logInSchema>;
