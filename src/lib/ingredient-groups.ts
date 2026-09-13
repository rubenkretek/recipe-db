/**
 * Ingredient groups: the "Salad" and "Dressing" headings within a recipe.
 *
 * Pure and client-safe. Stored as `recipe_ingredients.group_name` on each line;
 * a group is a consecutive run of lines, in `sort_order`, sharing a name. The
 * editor instead shows headings as rows of their own, so these helpers convert
 * between the two shapes and split a list into runs for display.
 */

/**
 * The group each editor row belongs to: the nearest non-blank heading above it.
 *
 * Returns one entry per row. A heading row gets its own name. Rows above the
 * first heading are ungrouped (null).
 *
 * A blank heading is ignored rather than ending the group. Otherwise an empty
 * heading left mid-list would silently make the ingredients below it ungrouped,
 * and ungrouped lines only make sense at the top.
 */
export function groupNamesForRows(
  rows: { kind: "ingredient" | "heading"; heading: string }[],
): (string | null)[] {
  let current: string | null = null;

  return rows.map((row) => {
    if (row.kind === "heading" && row.heading.trim() !== "") {
      current = row.heading.trim();
    }
    return current;
  });
}

/**
 * Stored lines as the editor shows them: a heading entry wherever a new group
 * starts, followed by its lines.
 *
 * The inverse of `groupNamesForRows`. One case cannot survive the round trip:
 * an ungrouped line stored *after* a group (only possible by writing to the
 * database directly, never through the editor) gets no heading of its own, so it
 * joins the group above it when the recipe is next saved.
 */
export function withHeadings<Line extends { groupName: string | null }>(
  lines: Line[],
): ({ kind: "heading"; heading: string } | { kind: "ingredient"; line: Line })[] {
  const entries: (
    | { kind: "heading"; heading: string }
    | { kind: "ingredient"; line: Line }
  )[] = [];
  let previous: string | null = null;

  for (const line of lines) {
    if (line.groupName !== null && line.groupName !== previous) {
      entries.push({ kind: "heading", heading: line.groupName });
    }
    previous = line.groupName;
    entries.push({ kind: "ingredient", line });
  }

  return entries;
}

/**
 * Splits lines into consecutive runs sharing a group name, for display.
 *
 * Consecutive rather than collected by name, so a recipe that genuinely returns
 * to a heading later ("Salad", "Dressing", "Salad") keeps its order.
 */
export function consecutiveGroups<Line extends { groupName: string | null }>(
  lines: Line[],
): { groupName: string | null; lines: Line[] }[] {
  const groups: { groupName: string | null; lines: Line[] }[] = [];

  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (last && last.groupName === line.groupName) {
      last.lines.push(line);
    } else {
      groups.push({ groupName: line.groupName, lines: [line] });
    }
  }

  return groups;
}
