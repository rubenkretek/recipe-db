/**
 * Sanitises a post-authentication redirect target.
 *
 * A `next` parameter travels in the URL, so an attacker can put anything in it.
 * Only same-site absolute paths are allowed through: anything else, including
 * the protocol-relative form "//evil.example", would carry the user off the
 * site and turn the login page into an open redirect.
 *
 * Returns null when the value cannot be trusted, so callers fall back to their
 * own default rather than to something an attacker chose.
 */
export function safeRedirectPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  if (!value.startsWith("/") || value.startsWith("//")) {
    return null;
  }
  return value;
}
