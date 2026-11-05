"use client";

import { LayoutGrid, List } from "lucide-react";
import { useState } from "react";

import { StepCards } from "@/components/recipes/step-cards";
import { StepList } from "@/components/recipes/step-list";
import type { WordField } from "@/components/recipes/step-text";
import {
  SegmentedControl,
  type SegmentedOption,
} from "@/components/ui/segmented-control";
import type { RecipeStep } from "@/lib/recipes";
import type { HighlightedWord } from "@/lib/word-spans";

/**
 * The two ways to read a method. Declared outside the component so the array
 * identity is stable — `SegmentedControl` keeps a ref of its buttons and the
 * options feed its keyboard navigation.
 */
const VIEW_OPTIONS: SegmentedOption[] = [
  { value: "list", label: "List", icon: <List className="size-3.5" /> },
  { value: "cards", label: "Cards", icon: <LayoutGrid className="size-3.5" /> },
];

/**
 * The method, in whichever view the cook wants, with the heading beside the
 * switch.
 *
 * Owns both pieces of client state so neither view has to:
 *
 * - **The view.** Starts on the list every time rather than being remembered.
 *   The list is the one that reads as a recipe, and a half-remembered carousel
 *   from a fortnight ago is not what you want when you open a recipe to read
 *   it. Worth persisting later if the cards turn out to be what gets used.
 * - **The highlight.** Lives up here, which is what lets it survive switching
 *   views — mark your place in the list, flip to cards, it is still marked.
 *   Deliberately not stored anywhere: it is "I am here", true for ten minutes.
 */
export function StepMethod({ steps }: { steps: RecipeStep[] }) {
  const [view, setView] = useState<"list" | "cards">("list");
  const [highlight, setHighlight] = useState<HighlightedWord>(null);

  /**
   * One word at a time, and tapping the marked word again clears it.
   *
   * Clearing on a second tap matters because there is otherwise no way to put
   * the marker away once you have finished a step.
   */
  function onTap(stepId: string, field: WordField, index: number) {
    setHighlight((current) =>
      current &&
      current.stepId === stepId &&
      current.field === field &&
      current.index === index
        ? null
        : { stepId, field, index },
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Method</h2>

        <SegmentedControl
          label="How to show the method"
          options={VIEW_OPTIONS}
          value={view}
          onValueChange={(next) => setView(next as "list" | "cards")}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        Tap a word to mark where you are.
      </p>

      {view === "list" ? (
        <StepList steps={steps} highlight={highlight} onTap={onTap} />
      ) : (
        <StepCards steps={steps} highlight={highlight} onTap={onTap} />
      )}
    </>
  );
}
