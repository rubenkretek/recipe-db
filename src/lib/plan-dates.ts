import { format, formatDistanceToNowStrict, parseISO } from "date-fns";

/**
 * Pure date formatting for plans. No database access, no `next/headers`.
 *
 * Split from `src/lib/plans.ts` for the same reason `photos.ts` is split from
 * `photo-urls.ts`: that module builds a Supabase client, which reads cookies, so
 * importing anything from it into a Client Component would drag `next/headers`
 * into the browser bundle and fail the build. See CLAUDE.md "Gotchas".
 */

/**
 * What an unnamed plan is called. Most plans are unnamed.
 *
 * Lives here rather than beside the plan header component, because that module
 * is `"use client"` and its exports become client references: a Server
 * Component reading this from there would not get the string.
 */
export const UNNAMED_PLAN = "Current plan";

/**
 * How long a plan has been running, or how long it ran for.
 *
 * SPEC.md §8 Phase 6 is explicit that a plan is a period of arbitrary length,
 * so this reads "Started 4 days ago" rather than "Week of 12 Jan". A plan
 * started today reads "Started today" rather than "in 0 days".
 */
export function describePlanPeriod(
  startsOn: string,
  endsOn: string | null,
): string {
  const started = parseISO(startsOn);

  if (endsOn) {
    return `${format(started, "d MMM")} to ${format(parseISO(endsOn), "d MMM yyyy")}`;
  }

  const age = formatDistanceToNowStrict(started, { unit: "day" });
  return age === "0 days" ? "Started today" : `Started ${age} ago`;
}
