"use client";

import { Markdown } from "@/components/recipes/markdown";
import {
  HIGHLIGHT_CLASS,
  WORD_ATTRIBUTE,
  WORD_CLASS,
  splitIntoWords,
  type HighlightedWord,
} from "@/lib/word-spans";

/**
 * A step's title and description, with every word tappable.
 *
 * Shared by both views rather than written twice. The layouts around them
 * differ — a numbered row in the list, a full card in the carousel — but the
 * word splitting and the highlight lookup are the fiddly part, and two copies
 * of that would drift.
 */

export type WordField = "title" | "description";

/** Reads the tapped word's index back off the DOM, or null if a gap was hit. */
function tappedWordIndex(target: EventTarget): number | null {
  if (!(target instanceof HTMLElement)) return null;

  const element = target.closest(`[${WORD_ATTRIBUTE}]`);
  const raw = element?.getAttribute(WORD_ATTRIBUTE);
  if (raw === null || raw === undefined) return null;

  const index = Number(raw);
  return Number.isNaN(index) ? null : index;
}

/** The index marked within this step and field, or null if it is elsewhere. */
function activeIndex(
  highlight: HighlightedWord,
  stepId: string,
  field: WordField,
): number | null {
  return highlight && highlight.stepId === stepId && highlight.field === field
    ? highlight.index
    : null;
}

export function StepTitle({
  stepId,
  text,
  highlight,
  onTap,
  className,
}: {
  stepId: string;
  text: string;
  highlight: HighlightedWord;
  onTap: (stepId: string, field: WordField, index: number) => void;
  className?: string;
}) {
  const active = activeIndex(highlight, stepId, "title");

  return (
    <span
      className={className}
      onClick={(event) => {
        const index = tappedWordIndex(event.target);
        if (index !== null) onTap(stepId, "title", index);
      }}
    >
      {splitIntoWords(text).map((piece, key) =>
        piece.index === null ? (
          <span key={key}>{piece.text}</span>
        ) : (
          // `data-word` written literally: a computed attribute name cannot be
          // type-checked as a data attribute. See WORD_ATTRIBUTE.
          <span
            key={key}
            data-word={String(piece.index)}
            className={piece.index === active ? HIGHLIGHT_CLASS : WORD_CLASS}
          >
            {piece.text}
          </span>
        ),
      )}
    </span>
  );
}

export function StepDescription({
  stepId,
  text,
  highlight,
  onTap,
}: {
  stepId: string;
  text: string;
  highlight: HighlightedWord;
  onTap: (stepId: string, field: WordField, index: number) => void;
}) {
  const active = activeIndex(highlight, stepId, "description");

  return (
    <div
      onClick={(event) => {
        const index = tappedWordIndex(event.target);
        if (index !== null) onTap(stepId, "description", index);
      }}
    >
      <Markdown tappableWords highlightedWord={active}>
        {text}
      </Markdown>
    </div>
  );
}
