"use client";

import { LayoutGrid, List } from "lucide-react";
import { useState } from "react";

import { StepCards } from "@/components/recipes/step-cards";
import { StepList } from "@/components/recipes/step-list";
import type { WordField } from "@/components/recipes/step-text";
import type { RecipeStep } from "@/lib/recipes";
import type { HighlightedWord } from "@/lib/word-spans";

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

        <div
          role="group"
          aria-label="How to show the method"
          className="flex gap-0.5 rounded-full border p-0.5"
        >
          <ViewButton
            isOn={view === "list"}
            onClick={() => setView("list")}
            icon={<List className="size-3.5" />}
            label="List"
          />
          <ViewButton
            isOn={view === "cards"}
            onClick={() => setView("cards")}
            icon={<LayoutGrid className="size-3.5" />}
            label="Cards"
          />
        </div>
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

function ViewButton({
  isOn,
  onClick,
  icon,
  label,
}: {
  isOn: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={isOn}
      onClick={onClick}
      className={
        isOn
          ? "bg-muted flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
          : "text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-full px-3 py-1 text-xs"
      }
    >
      {icon}
      {label}
    </button>
  );
}
