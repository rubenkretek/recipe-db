/**
 * Pure rating helpers, safe to import from both Server and Client Components.
 *
 * These live here rather than beside the rating control because that component
 * is `"use client"`, and a Server Component cannot call a function exported
 * from a client module — it fails at render time, not at build time, so the
 * mistake is invisible until the page is actually requested.
 */

/**
 * Formats a score for display: one decimal place, but no trailing ".0" on a
 * whole number, so 8 reads as "8" and 7.5 as "7.5".
 */
export function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}
