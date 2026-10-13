"use client";

import {
  StepDescription,
  StepTitle,
  type WordField,
} from "@/components/recipes/step-text";
import type { RecipeStep } from "@/lib/recipes";
import type { HighlightedWord } from "@/lib/word-spans";

/**
 * The method as numbered steps, in order. The default view.
 *
 * Numbers come from position, not from a stored field, so reordering in the
 * editor can never leave a gap or a duplicate "Step 3".
 *
 * A Client Component since tap-to-highlight arrived — it was a Server
 * Component, and the words have to be tappable. It holds no state of its own:
 * the highlight lives in `StepMethod`, so switching views keeps it.
 */
export function StepList({
  steps,
  highlight,
  onTap,
}: {
  steps: RecipeStep[];
  highlight: HighlightedWord;
  onTap: (stepId: string, field: WordField, index: number) => void;
}) {
  return (
    <ol className="flex flex-col gap-6">
      {steps.map((step, index) => (
        <li key={step.id} className="flex gap-3">
          <span
            aria-hidden
            className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-medium tabular-nums"
          >
            {index + 1}
          </span>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <h3 className="pt-0.5 font-medium">
              <span className="sr-only">Step {index + 1}: </span>
              <StepTitle
                stepId={step.id}
                text={step.title}
                highlight={highlight}
                onTap={onTap}
              />
            </h3>

            {step.photoUrl && (
              // A plain <img>, like every recipe photo: signed URLs rotate their
              // token, which defeats next/image's cache. CLAUDE.md "Gotchas".
              <img
                src={step.photoUrl}
                alt=""
                loading="lazy"
                className="max-h-80 w-full rounded-md border object-cover sm:w-2/3"
              />
            )}

            {step.description && (
              <StepDescription
                stepId={step.id}
                text={step.description}
                highlight={highlight}
                onTap={onTap}
              />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
