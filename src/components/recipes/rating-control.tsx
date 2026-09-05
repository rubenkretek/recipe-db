"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { RecipeRating } from "@/lib/recipes";
import { RATING_MAX, RATING_MIN, RATING_STEP } from "@/schemas/recipe";
import { clearRating, rateRecipe } from "@/server/actions/recipes";

const SAVE_DEBOUNCE_MS = 500;

/** One decimal place, but no trailing ".0" on whole numbers. */
export function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

/**
 * The signed-in member's own rating: a slider that saves itself.
 *
 * SPEC.md §8 Phase 2 asks for ratings that update instantly, so there is no
 * Save button. The displayed value follows the slider immediately and the write
 * is debounced, because dragging from 0 to 8 would otherwise fire a request per
 * step.
 *
 * "Not rated" is a real state, distinct from a score of 0: no row means nobody
 * has judged it, and the average ignores it rather than counting it as zero.
 */
export function RatingControl({
  recipeId,
  initialScore,
}: {
  recipeId: string;
  initialScore: number | null;
}) {
  const [score, setScore] = useState<number | null>(initialScore);
  const [isSaving, setIsSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A pending save must not outlive the component, or it fires against a page
  // the user has already left.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function scheduleSave(nextScore: number) {
    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(async () => {
      setIsSaving(true);
      const result = await rateRecipe({ recipeId, score: nextScore });
      setIsSaving(false);

      if (result?.error) {
        toast.error(result.error);
      }
    }, SAVE_DEBOUNCE_MS);
  }

  async function remove() {
    if (timer.current) clearTimeout(timer.current);
    setScore(null);
    setIsSaving(true);
    const result = await clearRating({ recipeId });
    setIsSaving(false);

    if (result?.error) {
      toast.error(result.error);
    }
  }

  if (score === null) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground text-sm">Not rated</span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            // Start in the middle rather than at 0, so the first nudge is not
            // interpreted as "this is terrible".
            const starting = 5;
            setScore(starting);
            scheduleSave(starting);
          }}
        >
          Rate it
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Slider
        value={[score]}
        min={RATING_MIN}
        max={RATING_MAX}
        step={RATING_STEP}
        aria-label="Your rating"
        className="max-w-56 flex-1"
        onValueChange={([next]) => {
          setScore(next);
          scheduleSave(next);
        }}
      />
      <span className="w-8 text-right text-sm font-medium tabular-nums">
        {formatScore(score)}
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={remove}
        disabled={isSaving}
      >
        Clear
      </Button>
    </div>
  );
}

/**
 * Everyone's scores on a recipe, with the average.
 *
 * Each score is attributed by name. That matters because the RLS policy on
 * `ratings` is the uniform members-full-access shape, so either member could
 * overwrite the other's score — showing whose is whose makes an accidental edit
 * visible. See CLAUDE.md "Gotchas".
 */
export function RatingSummary({
  ratings,
  averageRating,
}: {
  ratings: RecipeRating[];
  averageRating: number | null;
}) {
  if (averageRating === null) {
    return <p className="text-muted-foreground text-sm">Nobody has rated this yet.</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm">
        <span className="font-medium">{formatScore(averageRating)}</span>
        <span className="text-muted-foreground">
          {" "}
          average from {ratings.length}{" "}
          {ratings.length === 1 ? "rating" : "ratings"}
        </span>
      </p>
      <p className="text-muted-foreground text-sm">
        {ratings
          .map((rating) => `${rating.displayName} ${formatScore(rating.score)}`)
          .join(" · ")}
      </p>
    </div>
  );
}
