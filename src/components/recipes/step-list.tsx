import { Markdown } from "@/components/recipes/markdown";
import type { RecipeStep } from "@/lib/recipes";

/**
 * The method on the recipe page: numbered steps, in order.
 *
 * A Server Component — nothing here is interactive. Numbers come from position,
 * not from a stored field, so reordering in the editor can never leave a gap or
 * a duplicate "Step 3".
 */
export function StepList({ steps }: { steps: RecipeStep[] }) {
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
              {step.title}
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

            {step.description && <Markdown>{step.description}</Markdown>}
          </div>
        </li>
      ))}
    </ol>
  );
}
