"use client";

import { FileUp, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import type { IngredientOption } from "@/components/recipes/ingredient-combobox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { withHeadings } from "@/lib/ingredient-groups";
import { BLANK_INGREDIENT_ROW } from "@/schemas/ingredient";
import { BLANK_STEP, type RecipeFormInput } from "@/schemas/recipe";
import { importRecipeFile, type RecipeDraft } from "@/server/actions/import";
import {
  findOrCreateIngredient,
  recordIngredientAlias,
} from "@/server/actions/ingredients";
import { findOrCreateTag } from "@/server/actions/recipes";

/** Well under the server action body limit; a recipe is a page of text. */
const MAX_FILE_BYTES = 200_000;

const ACCEPTED = ".md,.markdown,.txt,text/markdown,text/plain";

/** What to do about an ingredient the kitchen does not already have. */
type Choice = { mode: "existing" | "create"; name: string };

/**
 * Capitalises the first letter, leaving the rest of the name alone.
 *
 * Sentence case, not title case: the kitchen's own names read "Green beans"
 * and "Coconut milk", so "Green Beans" would be the odd one out. The model
 * returns everything lowercase, and a list mixing "Olive oil" with "red
 * lentils" looks like a mistake even when nothing is wrong.
 *
 * Applied to the *value* rather than with `autoCapitalize`, which would only
 * hint to a phone keyboard and leave the saved name untouched — and which is
 * the same family of attribute as `autoComplete` and `enterKeyHint`, both of
 * which cause a hydration mismatch on this stack. See CLAUDE.md.
 */
function capitaliseFirst(name: string): string {
  const text = name.trimStart();
  return text === "" ? text : text[0].toUpperCase() + text.slice(1);
}

/**
 * The progress bar is an **estimate**, and deliberately so.
 *
 * There is no real progress to report: the import is two calls to the model
 * inside one server action, and neither streams anything back. What the bar
 * measures is elapsed time against how long imports actually take — around 23
 * to 28 seconds for the two passes, measured against the sample files.
 *
 * The curve is asymptotic rather than linear, which matters: a linear bar that
 * reaches its estimate early then stops is the spinner problem again, just with
 * a rectangle. This one always creeps, never arrives, and only snaps to gone
 * when the answer does. It stops short of 100 for the same reason — the only
 * honest 100% is the draft appearing.
 */
const PROGRESS_TICK_MS = 250;
const PROGRESS_TAU_MS = 12_000;
const PROGRESS_CEILING = 96;

/**
 * Importing a recipe from an exported file.
 *
 * Drop a file, a model reads it, and the draft fills the normal recipe form —
 * which is the review step, rather than a second editor built to review with.
 * Nothing is written until the user accepts: the only things created at the
 * moment of accepting are the ingredients and tags the recipe needs, because
 * the form works in ids and those have to exist first.
 *
 * The box is focusable and takes a paste as well as a drop, the same shape as
 * the photo areas. See CLAUDE.md "Pasting a photo works only inside a focused
 * photo box".
 */
export function RecipeImport({
  onDraft,
}: {
  /**
   * Hands the finished draft to whatever owns the form, along with any
   * ingredients that had to be created for it.
   *
   * The second argument is not a convenience: the form resolves a row's
   * ingredient id against the list the page rendered on the server, which was
   * built before these existed. Without them the row holds a valid id and
   * still renders blank.
   */
  onDraft: (values: RecipeFormInput, created: IngredientOption[]) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [isOver, setIsOver] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [isPending, startTransition] = useTransition();

  // `startedAt` is the single source of truth for "an import is running", so
  // there is no separate boolean that could disagree with it.
  const isReading = startedAt !== null;

  // The clock only ticks while something is being read. State is set inside the
  // interval callback rather than in the effect body, which is what keeps this
  // clear of `react-hooks/set-state-in-effect`. See CLAUDE.md.
  useEffect(() => {
    if (startedAt === null) return;

    const id = setInterval(() => setNow(Date.now()), PROGRESS_TICK_MS);
    return () => clearInterval(id);
  }, [startedAt]);

  const elapsed = startedAt === null ? 0 : Math.max(0, now - startedAt);
  const seconds = Math.floor(elapsed / 1000);
  const percent = isReading
    ? Math.round(PROGRESS_CEILING * (1 - Math.exp(-elapsed / PROGRESS_TAU_MS)))
    : 0;

  // Named for what the server is actually doing at roughly that point, in the
  // order it does it: extract, then the second pass that checks for omissions,
  // then matching names against the kitchen's ingredients.
  // Thresholds chosen from the measured split, not picked to look busy: of a
  // ~26s import, the first pass runs to about 13s (64% on this curve) and the
  // second to about 25s (85%). Set any lower and the label claims the second
  // pass has begun while the first is still running.
  const stage =
    percent < 64
      ? "Reading the recipe"
      : percent < 85
        ? "Checking nothing was missed"
        : "Matching your ingredients";

  async function read(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      toast.error("That file is too big to be a recipe.");
      return;
    }

    setStartedAt(Date.now());
    try {
      const text = await file.text();
      const result = await importRecipeFile({ filename: file.name, text });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      setDraft(result.draft);
      setChoices(startingChoices(result.draft));
    } catch {
      toast.error("That file could not be read.");
    } finally {
      setStartedAt(null);
    }
  }

  async function readText(text: string) {
    setStartedAt(Date.now());
    try {
      const result = await importRecipeFile({
        filename: "pasted recipe",
        text,
      });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      setDraft(result.draft);
      setChoices(startingChoices(result.draft));
    } finally {
      setStartedAt(null);
    }
  }

  /**
   * Turns the draft into form values, creating what it references first.
   *
   * One round trip per ingredient that has to be created, which is the worst
   * case on a first import and close to none afterwards. Sequential on purpose:
   * two lines naming the same new ingredient must not race each other into two
   * rows.
   */
  function accept() {
    if (!draft) return;

    startTransition(async () => {
      const ingredientIds: string[] = [];
      // Everything created here, so the form can show it. The page's own list
      // predates these rows and will not contain them.
      const created: IngredientOption[] = [];

      for (const [index, ingredient] of draft.ingredients.entries()) {
        if (ingredient.match.status === "matched") {
          ingredientIds[index] = ingredient.match.ingredientId;
          continue;
        }

        const choice = choices[index];

        if (ingredient.match.status === "suggested" && choice?.mode === "existing") {
          ingredientIds[index] = ingredient.match.ingredientId;
          // Learn the file's wording so the next import matches it silently.
          await recordIngredientAlias({
            ingredientId: ingredient.match.ingredientId,
            alias: ingredient.name,
          });
          continue;
        }

        // The fallback is the model's raw wording, so it needs the same
        // treatment as the field: a row the user never opened must not create a
        // lowercase ingredient.
        const name = capitaliseFirst(choice?.name?.trim() || ingredient.name);
        const result = await findOrCreateIngredient({ name });

        if ("error" in result) {
          toast.error(result.error);
          return;
        }

        ingredientIds[index] = result.ingredient.id;
        created.push({
          id: result.ingredient.id,
          name: result.ingredient.name,
          defaultUnit: result.ingredient.default_unit,
        });

        if (name.toLowerCase() !== ingredient.name.toLowerCase()) {
          await recordIngredientAlias({
            ingredientId: result.ingredient.id,
            alias: ingredient.name,
          });
        }
      }

      const tagIds: string[] = [];
      for (const tag of draft.tags) {
        if (tag.existingId) {
          tagIds.push(tag.existingId);
          continue;
        }

        const created = await findOrCreateTag({ name: tag.name });
        if ("error" in created) {
          toast.error(created.error);
          return;
        }
        tagIds.push(created.tag.id);
      }

      // Stored lines carry a group name; the editor wants a heading row wherever
      // a group starts. Same conversion the edit form uses.
      const rows = withHeadings(
        draft.ingredients.map((ingredient, index) => ({
          ...ingredient,
          ingredientId: ingredientIds[index],
        })),
      ).map((entry) =>
        entry.kind === "heading"
          ? {
              ...BLANK_INGREDIENT_ROW,
              kind: "heading" as const,
              heading: entry.heading,
            }
          : {
              ...BLANK_INGREDIENT_ROW,
              ingredientId: entry.line.ingredientId,
              quantity: entry.line.quantity,
              unit: entry.line.unit,
              note: entry.line.note,
            },
      );

      onDraft(
        {
        name: draft.name,
        mealType: draft.mealType,
        baseServings: draft.baseServings,
        sourceUrl: draft.sourceUrl ?? "",
        notes: draft.notes ?? "",
        tagIds,
        ingredients: rows,
        steps:
          draft.steps.length > 0
            ? draft.steps.map((step) => ({
                title: step.title,
                description: step.description ?? "",
                photoPath: null,
              }))
            : [{ ...BLANK_STEP }],
        },
        created,
      );

      setDraft(null);
      toast.success("Imported. Check it over, then save.");
    });
  }

  const undecided = draft
    ? draft.ingredients
        .map((ingredient, index) => ({ ingredient, index }))
        .filter(({ ingredient }) => ingredient.match.status !== "matched")
    : [];

  return (
    <>
      <div
        tabIndex={0}
        onDragOver={(event) => {
          event.preventDefault();
          setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsOver(false);
          const file = event.dataTransfer.files[0];
          if (file) void read(file);
        }}
        onPaste={(event) => {
          const text = event.clipboardData.getData("text/plain");
          if (text.trim().length > 40) {
            event.preventDefault();
            void readText(text);
          }
        }}
        className={
          isOver
            ? "border-foreground/40 bg-muted/60 flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors focus:outline-2"
            : "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors focus:outline-2"
        }
      >
        {isReading ? (
          <div className="flex w-full max-w-xs flex-col items-center gap-2">
            <p className="text-sm font-medium">{stage}…</p>

            <div
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Reading the recipe"
              className="bg-muted h-2 w-full overflow-hidden rounded-full"
            >
              <div
                className="bg-primary h-full rounded-full transition-[width] duration-300 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>

            {/* The seconds are here because the percentage alone is not enough.
                The curve flattens by design, so on a slow import the integer
                stops changing for stretches — which is the frozen-spinner
                problem wearing a rectangle. A counter that ticks every second
                regardless is what says "still going". */}
            <p className="text-muted-foreground text-xs tabular-nums">
              {percent}% · {seconds}s
            </p>
            <p className="text-muted-foreground text-xs">
              Read twice, so it takes around half a minute.
            </p>
          </div>
        ) : (
          <>
            <FileUp className="text-muted-foreground size-5" />
            <p className="text-sm font-medium">
              Drop an exported recipe here to fill the form
            </p>
            <p className="text-muted-foreground text-xs">
              Markdown or text. You can also click the box and paste one.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInput.current?.click()}
            >
              Choose a file
            </Button>
          </>
        )}

        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void read(file);
            // Cleared so choosing the same file twice still fires a change.
            event.target.value = "";
          }}
        />
      </div>

      <Dialog
        open={draft !== null}
        onOpenChange={(open) => !open && setDraft(null)}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.name}</DialogTitle>
            <DialogDescription>
              {draft
                ? `${draft.ingredients.length} ingredients, ${draft.steps.length} steps, serves ${draft.baseServings}. Nothing is saved yet.`
                : null}
            </DialogDescription>
          </DialogHeader>

          {draft && draft.warnings.length > 0 && (
            <div className="flex flex-col gap-1 rounded-lg border px-3 py-2">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <TriangleAlert className="size-4" />
                Worth a look
              </p>
              <ul className="text-muted-foreground list-disc pl-5 text-xs">
                {draft.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {draft && draft.unclaimed.length > 0 && (
            <div className="flex flex-col gap-1 rounded-lg border px-3 py-2">
              <p className="text-sm font-medium">Not imported</p>
              <p className="text-muted-foreground text-xs">
                Nothing in the draft accounts for these lines. Add them by hand
                if they matter.
              </p>
              <ul className="text-muted-foreground list-disc pl-5 text-xs">
                {draft.unclaimed.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          {undecided.length > 0 && (
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-medium">New ingredients</p>
                <p className="text-muted-foreground text-xs">
                  These are not in your list yet. Check the names — they are
                  shared by every recipe.
                </p>
              </div>

              {undecided.map(({ ingredient, index }) => (
                <div key={index} className="flex flex-col gap-1.5">
                  <Label htmlFor={`import-name-${index}`} className="text-xs">
                    The file says “{ingredient.name}”
                  </Label>

                  {ingredient.match.status === "suggested" && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          choices[index]?.mode === "existing"
                            ? "secondary"
                            : "outline"
                        }
                        aria-pressed={choices[index]?.mode === "existing"}
                        onClick={() =>
                          setChoices((current) => ({
                            ...current,
                            [index]: {
                              mode: "existing",
                              name:
                                ingredient.match.status === "suggested"
                                  ? ingredient.match.name
                                  : ingredient.name,
                            },
                          }))
                        }
                      >
                        Use “{ingredient.match.name}”
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          choices[index]?.mode === "create"
                            ? "secondary"
                            : "outline"
                        }
                        aria-pressed={choices[index]?.mode === "create"}
                        onClick={() =>
                          setChoices((current) => ({
                            ...current,
                            [index]: {
                              mode: "create",
                              name: capitaliseFirst(ingredient.name),
                            },
                          }))
                        }
                      >
                        Add as new
                      </Button>
                    </div>
                  )}

                  {choices[index]?.mode === "create" && (
                    <Input
                      id={`import-name-${index}`}
                      value={choices[index]?.name ?? ""}
                      onChange={(event) =>
                        setChoices((current) => ({
                          ...current,
                          [index]: {
                            mode: "create",
                            name: capitaliseFirst(event.target.value),
                          },
                        }))
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDraft(null)}
              disabled={isPending}
            >
              Discard
            </Button>
            <Button type="button" onClick={accept} disabled={isPending}>
              {isPending ? "Adding…" : "Fill the form"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Every undecided ingredient starts on the safest option. */
function startingChoices(draft: RecipeDraft): Record<number, Choice> {
  const choices: Record<number, Choice> = {};

  draft.ingredients.forEach((ingredient, index) => {
    if (ingredient.match.status === "suggested") {
      // Defaulting to the existing ingredient keeps the list from growing a
      // near-duplicate every import; the other button is right there.
      choices[index] = { mode: "existing", name: ingredient.match.name };
    } else if (ingredient.match.status === "new") {
      // Capitalised at the seed too, not only as you type — otherwise the field
      // sits there lowercase until touched, and an untouched field is the
      // common case.
      choices[index] = { mode: "create", name: capitaliseFirst(ingredient.name) };
    }
  });

  return choices;
}
