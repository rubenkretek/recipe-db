"use client";

import { FileUp, Loader2, TriangleAlert } from "lucide-react";
import { useRef, useState, useTransition } from "react";
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
  const [isReading, setIsReading] = useState(false);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [isPending, startTransition] = useTransition();

  async function read(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      toast.error("That file is too big to be a recipe.");
      return;
    }

    setIsReading(true);
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
      setIsReading(false);
    }
  }

  async function readText(text: string) {
    setIsReading(true);
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
      setIsReading(false);
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

        const name = choice?.name?.trim() || ingredient.name;
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
          <>
            <Loader2 className="text-muted-foreground size-5 animate-spin" />
            <p className="text-sm font-medium">Reading the recipe…</p>
            <p className="text-muted-foreground text-xs">
              It is read twice, so this takes a few seconds.
            </p>
          </>
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
                            [index]: { mode: "create", name: ingredient.name },
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
                          [index]: { mode: "create", name: event.target.value },
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
      choices[index] = { mode: "create", name: ingredient.name };
    }
  });

  return choices;
}
