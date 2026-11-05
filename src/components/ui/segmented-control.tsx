"use client";

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "cn";

/**
 * Spring for the thumb. Stiff and well damped, so it arrives quickly and does
 * not wobble — the same intent as `--ease-snappy`, which this cannot use
 * because the movement is driven from JavaScript rather than CSS.
 */
const THUMB_SPRING = {
  type: "spring",
  stiffness: 520,
  damping: 34,
  mass: 0.45,
} as const;

/**
 * Shared by all three copies of the labels. They must size identically or the
 * thumb's text will not sit exactly on top of the track's text.
 */
const SEGMENT =
  "flex items-center justify-center gap-1.5 whitespace-nowrap px-3 py-1 text-xs leading-5";

export type SegmentedOption = {
  value: string;
  /** Also the accessible name, so it stays a plain string. */
  label: string;
  /** Optional leading glyph. Decorative; the label carries the meaning. */
  icon?: React.ReactNode;
  disabled?: boolean;
};

export type SegmentedControlProps = {
  options: SegmentedOption[];
  /** Accessible name for the group, e.g. "How to show the method". */
  label: string;
  /** Controlled selection. Pair with `onValueChange`. */
  value?: string;
  /** Uncontrolled starting selection. Defaults to the first option. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
};

/**
 * A single-choice switch whose selected state slides between the options.
 *
 * Why this rather than two `aria-pressed` buttons: the thumb moving is what
 * tells you the two options are *one* setting with a position, instead of two
 * independent toggles that happen to sit together. The label colour changes
 * exactly as the thumb edge crosses it, which is the whole trick below.
 *
 * **The labels are rendered three times, and all three are load-bearing.** The
 * track's copy is what gives the control its width and shows the unselected
 * colour. The thumb holds a second, full-width copy inside an `overflow-hidden`
 * box translated the opposite way, so the thumb acts as a moving window onto
 * differently-coloured text — no per-letter crossfade, and the colour change is
 * exactly as wide as the thumb. The third copy is the `sr-only` text inside the
 * real buttons, which is what a screen reader actually reads. Only the last is
 * not `aria-hidden`.
 *
 * Keyboard behaviour is a roving tabindex: one tab stop for the group, then
 * arrows/Home/End to move, skipping disabled options.
 *
 * Ported from interior.dev's Segmented Control onto this app's tokens, sizing
 * and focus ring, with icon support added. `useReducedMotion` is honoured here
 * rather than left to the `prefers-reduced-motion` block in `globals.css`,
 * because that block collapses CSS *durations* and this animation is a
 * JavaScript spring it cannot reach. See CLAUDE.md.
 */
export function SegmentedControl({
  options,
  label,
  value,
  defaultValue,
  onValueChange,
  className,
}: SegmentedControlProps) {
  const count = Math.max(1, options.length);
  const columns = `repeat(${count}, minmax(0, 1fr))`;

  const [uncontrolled, setUncontrolled] = useState(
    () => defaultValue ?? options[0]?.value ?? "",
  );
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;

  const found = options.findIndex((option) => option.value === current);
  const index = found < 0 ? 0 : found;

  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const reduced = useReducedMotion();
  const position = useMotionValue(index);
  const thumbOffset = useTransform(position, (at) => `${at * 100}%`);
  const maskOffset = useTransform(position, (at) => `${at * -100}%`);

  useEffect(() => {
    if (reduced) {
      position.set(index);
      return;
    }
    const controls = animate(position, index, THUMB_SPRING);
    return () => controls.stop();
  }, [index, reduced, position]);

  // Called straight rather than through a ref. The upstream component holds
  // `onValueChange` in a ref and assigns it during render to keep `select`'s
  // identity stable, which `react-hooks/refs` rejects — and nothing here needs
  // that stability: no effect depends on `select`, and it is only reached from
  // an event handler.
  const select = useCallback(
    (next: string) => {
      if (!isControlled) setUncontrolled(next);
      if (next !== current) onValueChange?.(next);
    },
    [isControlled, current, onValueChange],
  );

  /** The next enabled option in `direction`, wrapping, or `from` if there is none. */
  const seek = useCallback(
    (from: number, direction: number) => {
      let at = from;
      for (let step = 0; step < count; step++) {
        at = (at + direction + count) % count;
        if (!options[at]?.disabled) return at;
      }
      return from;
    },
    [count, options],
  );

  const go = useCallback(
    (at: number) => {
      const option = options[at];
      if (!option || option.disabled) return;
      buttons.current[at]?.focus();
      select(option.value);
    },
    [options, select],
  );

  function onKeyDown(event: React.KeyboardEvent, at: number) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      go(seek(at, 1));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      go(seek(at, -1));
    } else if (event.key === "Home") {
      event.preventDefault();
      go(seek(count - 1, 1));
    } else if (event.key === "End") {
      event.preventDefault();
      go(seek(0, -1));
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "relative inline-block rounded-full border p-0.5 select-none",
        className,
      )}
    >
      <div
        className="relative grid"
        style={{ gridTemplateColumns: columns, touchAction: "manipulation" }}
      >
        {options.map((option) => (
          <span
            key={option.value}
            aria-hidden
            className={cn(
              SEGMENT,
              "pointer-events-none",
              option.disabled
                ? "text-muted-foreground/50"
                : "text-muted-foreground",
            )}
          >
            {option.icon}
            {option.label}
          </span>
        ))}

        <motion.div
          aria-hidden
          className="bg-muted pointer-events-none absolute inset-y-0 left-0 overflow-hidden rounded-full"
          style={{ width: `${100 / count}%`, x: thumbOffset }}
          initial={false}
        >
          <motion.div
            className="absolute inset-0"
            style={{ x: maskOffset }}
            initial={false}
          >
            <div
              className="absolute inset-y-0 left-0 grid"
              style={{ width: `${count * 100}%`, gridTemplateColumns: columns }}
            >
              {options.map((option) => (
                <span
                  key={option.value}
                  className={cn(SEGMENT, "text-foreground font-medium")}
                >
                  {option.icon}
                  {option.label}
                </span>
              ))}
            </div>
          </motion.div>
        </motion.div>

        <div
          className="absolute inset-0 grid"
          style={{ gridTemplateColumns: columns }}
        >
          {options.map((option, at) => (
            <button
              key={option.value}
              ref={(node) => {
                buttons.current[at] = node;
              }}
              type="button"
              role="radio"
              aria-checked={at === index}
              aria-disabled={option.disabled || undefined}
              tabIndex={at === index ? 0 : -1}
              onClick={() => !option.disabled && select(option.value)}
              onKeyDown={(event) => onKeyDown(event, at)}
              className="focus-visible:border-ring focus-visible:ring-ring/50 cursor-pointer rounded-full border border-transparent outline-none focus-visible:ring-3 aria-disabled:cursor-not-allowed"
            >
              <span className="sr-only">{option.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
