import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Loader2Icon } from "lucide-react";
import { Slot } from "radix-ui";

const buttonVariants = cva(
  // `duration-100 ease-snappy` and the press scale are the interaction
  // feedback: the 1px nudge alone was too quiet to register as a response, and
  // a tap that looks like nothing happened gets tapped again. The
  // `not-aria-[haspopup]` guard is kept so a dropdown trigger stays still —
  // its feedback is the menu opening.
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all duration-100 ease-snappy outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px active:not-aria-[haspopup]:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/**
 * A button that can show its own in-flight state.
 *
 * `pending` adds a spinner and, with `pendingLabel`, swaps the label — which is
 * the pattern nearly thirty call sites were writing by hand as
 * `disabled={isPending}` plus `{isPending ? "Saving…" : "Save"}`. Two things
 * were wrong with that. There was no spinner, so a tap produced a greyed-out
 * button and no sense that anything was happening; and "Save" → "Saving…"
 * changes the button's width, nudging whatever sits beside it.
 *
 * **Both labels are always in the DOM, stacked in one grid cell.** That is what
 * fixes the width: the button is as wide as the longer of the two from the
 * start, so the swap moves nothing. Only the opacity changes.
 *
 * `pending` keeps the native `disabled` attribute rather than `aria-disabled`,
 * because that is what stops a second submit reaching a server action, and
 * preserving it means no call site changes behaviour. The button therefore
 * dims to `disabled:opacity-50` while pending; the spinner is the signal that
 * distinguishes "working" from "unavailable".
 *
 * Ignored entirely under `asChild`: `Slot.Root` must receive exactly one child
 * and the stack would be a second, so a `<Button asChild>` wrapping a `<Link>`
 * renders exactly as it always did.
 *
 * The crossfade is a CSS transition, deliberately — the
 * `prefers-reduced-motion` block in `globals.css` collapses durations, so this
 * becomes an instant swap for anyone who asked for that, with no JavaScript
 * involved. See CLAUDE.md.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  pending,
  pendingLabel,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** True while the action behind this button is in flight. */
    pending?: boolean;
    /** Label to show instead of `children` while pending, e.g. "Saving…". */
    pendingLabel?: React.ReactNode;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  // Only opt in when a caller asks for it, so every existing button renders
  // byte-for-byte what it did before.
  const showsPendingState =
    !asChild && (pending !== undefined || pendingLabel !== undefined);

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={showsPendingState ? disabled || pending : disabled}
      aria-busy={showsPendingState && pending ? true : undefined}
      {...props}
    >
      {showsPendingState ? (
        <ButtonPendingContent pending={pending} pendingLabel={pendingLabel}>
          {children}
        </ButtonPendingContent>
      ) : (
        children
      )}
    </Comp>
  );
}

/**
 * The two stacked labels that make up a button's pending state.
 *
 * Exported because `AlertDialogAction` needs exactly this markup and cannot get
 * it from `Button`: it renders `<Button asChild>` around a Radix `Action`, and
 * `asChild` turns the pending stack off by design. Sharing the one
 * implementation rather than keeping a second copy there, because two
 * hand-maintained copies of an opacity crossfade drift — one gets a tweak and
 * the other does not, and nothing fails loudly when they disagree.
 *
 * Both children occupy the same grid cell, so the element is sized by the wider
 * of the two labels and nothing moves when they swap.
 */
function ButtonPendingContent({
  pending,
  pendingLabel,
  children,
}: {
  pending?: boolean;
  pendingLabel?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <span className="grid place-items-center">
      <span
        aria-hidden={pending || undefined}
        className={cn(
          "col-start-1 row-start-1 inline-flex items-center gap-1.5 transition-opacity duration-100 ease-snappy",
          pending ? "opacity-0" : "opacity-100",
        )}
      >
        {children}
      </span>
      <span
        aria-hidden={!pending || undefined}
        className={cn(
          "col-start-1 row-start-1 inline-flex items-center gap-1.5 transition-opacity duration-100 ease-snappy",
          pending ? "opacity-100" : "opacity-0",
        )}
      >
        <Loader2Icon className="animate-spin" />
        {pendingLabel ?? children}
      </span>
    </span>
  );
}

export { Button, ButtonPendingContent, buttonVariants };
