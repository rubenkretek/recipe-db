import { Skeleton } from "@/components/ui/skeleton";

/**
 * The shapes each `loading.tsx` is built from.
 *
 * Why these exist at all: every route in this app is server-rendered on demand
 * and every query reads the session, so before this there was nothing for
 * `<Link>` to prefetch and nothing to paint on click — a navigation sat on the
 * old page until the server answered. A `loading.tsx` gives the router a shell
 * it can show the instant a link is tapped, which is what the Next.js instant
 * navigation guide calls the App Shell.
 *
 * They deliberately echo the real layout — same borders, same row heights, same
 * grid — so the swap to real content is a fill-in rather than a jolt. A skeleton
 * that does not match its page is worse than a spinner, because it moves
 * everything when the data lands.
 *
 * Nothing here pulses under `prefers-reduced-motion`: the global rule in
 * `globals.css` collapses animation durations, leaving the blocks static but
 * still visible.
 */

/** Varying widths so a column of rows does not look like a barcode. */
const WIDTHS = ["w-3/5", "w-4/5", "w-2/5", "w-3/4", "w-1/2", "w-2/3"];

function widthFor(index: number): string {
  return WIDTHS[index % WIDTHS.length];
}

/**
 * Wraps a loading screen so assistive technology knows what is happening.
 *
 * A screen of grey blocks says nothing to a screen reader, and the page title
 * has usually already been announced by the time the fallback appears.
 */
export function LoadingArea({
  children,
  label = "Loading",
  className = "flex flex-col gap-6",
}: {
  children: React.ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Stands in for a heading whose text is not known until the data arrives. */
export function TitleSkeleton() {
  return <Skeleton className="h-8 w-48" />;
}

/** The recipe grid: cover image, name, then the meal-type and tag pills. */
export function RecipeGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-xl border">
          <Skeleton className="aspect-video rounded-none" />
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className={`h-4 ${widthFor(index)}`} />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A bordered list of rows: the shopping list, plan history, ingredient lines.
 *
 * `min-h-14` matches the real shopping row, which is sized for a thumb.
 */
export function RowsSkeleton({
  count = 5,
  withLeading = true,
}: {
  count?: number;
  /** A tick box or thumbnail at the start of each row. */
  withLeading?: boolean;
}) {
  return (
    <ul className="flex flex-col rounded-lg border">
      {Array.from({ length: count }, (_, index) => (
        <li
          key={index}
          className="flex min-h-14 items-center gap-3 border-b px-3 last:border-b-0"
        >
          {withLeading && <Skeleton className="size-5 shrink-0 rounded" />}
          <Skeleton className={`h-4 ${widthFor(index)}`} />
        </li>
      ))}
    </ul>
  );
}

/** Bordered cards stacked vertically: the plan board, past plans. */
export function StackedCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-6">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-lg border p-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 shrink-0 rounded-md" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className={`h-4 ${widthFor(index)}`} />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The dashboard's four quick-action cards. */
export function DashboardCardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-xl border p-6">
          <Skeleton className="size-5 rounded" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Label-and-input pairs, for the recipe and profile forms. */
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="flex flex-col gap-6">
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
      <Skeleton className="h-8 w-28" />
    </div>
  );
}

/** The ingredients grid: shops across, ingredients down. */
export function TableSkeleton({
  rows = 8,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center gap-3 border-b px-3 py-2">
        <Skeleton className="h-3 w-24" />
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className="h-3 w-12" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 border-b px-3 py-3 last:border-b-0"
        >
          <Skeleton className={`h-4 ${widthFor(index)} max-w-32`} />
          <div className="ml-auto flex gap-6">
            {Array.from({ length: columns }, (_, cell) => (
              <Skeleton key={cell} className="size-4 rounded" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A paragraph of text, for descriptions and notes. */
export function TextSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={`h-3 ${index === lines - 1 ? "w-2/5" : "w-full"}`}
        />
      ))}
    </div>
  );
}
