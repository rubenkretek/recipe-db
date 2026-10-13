"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";

import {
  StepDescription,
  StepTitle,
  type WordField,
} from "@/components/recipes/step-text";
import { Button } from "@/components/ui/button";
import type { RecipeStep } from "@/lib/recipes";
import type { HighlightedWord } from "@/lib/word-spans";

/**
 * How wide the edge tap zones are.
 *
 * Narrow on purpose, and sitting in the carousel's own gutter so they never
 * cover a word. Tapping text marks your place; tapping the edge moves on. If
 * these overlapped the text the two gestures would fight, and the one you
 * wanted would be whichever happened to be on top.
 */
const EDGE_TAP_WIDTH = "w-10";

/**
 * The method as one card per step, swiped through. SPEC.md §7.
 *
 * Scrolling is the browser's, not ours: a scroll-snap container gives real
 * swipe momentum, snapping and edge resistance for free, and the buttons just
 * scroll it. Hand-rolled touch maths would be a worse imitation of what every
 * phone already does well.
 *
 * Cooking is the use case, hence the oversized footer buttons — they are hit
 * with a wet thumb while holding a pan.
 */
export function StepCards({
  steps,
  highlight,
  onTap,
}: {
  steps: RecipeStep[];
  highlight: HighlightedWord;
  onTap: (stepId: string, field: WordField, index: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  function go(to: number) {
    const element = scroller.current;
    if (!element) return;

    const clamped = Math.max(0, Math.min(steps.length - 1, to));
    element.scrollTo({
      left: clamped * element.clientWidth,
      behavior: "smooth",
    });
  }

  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <div
          ref={scroller}
          // Only set state when the card actually changes. A setState per
          // scroll event would re-render — and re-parse every step's markdown —
          // dozens of times per swipe.
          onScroll={(event) => {
            const element = event.currentTarget;
            const next = Math.round(element.scrollLeft / element.clientWidth);
            if (next !== index) setIndex(next);
          }}
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {steps.map((step, position) => (
            <article
              key={step.id}
              // The horizontal padding is what the edge tap zones sit in.
              className="w-full shrink-0 snap-center px-10"
              aria-label={`Step ${position + 1} of ${steps.length}`}
            >
              <div className="bg-card flex min-h-64 flex-col gap-3 rounded-xl border p-4 shadow-sm">
                <p className="text-muted-foreground text-xs font-medium tabular-nums">
                  Step {position + 1} of {steps.length}
                </p>

                <h3 className="text-lg font-semibold">
                  <StepTitle
                    stepId={step.id}
                    text={step.title}
                    highlight={highlight}
                    onTap={onTap}
                  />
                </h3>

                {step.photoUrl && (
                  // A plain <img> for the same reason as everywhere else: a
                  // signed URL's rotating token defeats next/image's cache.
                  <img
                    src={step.photoUrl}
                    alt=""
                    loading="lazy"
                    className="max-h-56 w-full rounded-md border object-cover"
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
            </article>
          ))}
        </div>

        {/* Touch affordances rather than keyboard controls: the footer buttons
            below are the accessible path, so these stay out of the tab order
            instead of duplicating every stop. */}
        <button
          type="button"
          tabIndex={-1}
          aria-label="Previous step"
          disabled={isFirst}
          onClick={() => go(index - 1)}
          className={`absolute inset-y-0 left-0 ${EDGE_TAP_WIDTH} disabled:pointer-events-none`}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Next step"
          disabled={isLast}
          onClick={() => go(index + 1)}
          className={`absolute inset-y-0 right-0 ${EDGE_TAP_WIDTH} disabled:pointer-events-none`}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          className="h-12 flex-1"
          disabled={isFirst}
          onClick={() => go(index - 1)}
        >
          <ChevronLeft className="size-5" />
          Back
        </Button>

        <span
          aria-live="polite"
          className="text-muted-foreground w-16 shrink-0 text-center text-sm tabular-nums"
        >
          {index + 1} / {steps.length}
        </span>

        <Button
          type="button"
          className="h-12 flex-1"
          disabled={isLast}
          onClick={() => go(index + 1)}
        >
          Next
          <ChevronRight className="size-5" />
        </Button>
      </div>
    </div>
  );
}
