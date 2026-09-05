"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SupermarketChips } from "@/components/ingredients/supermarket-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Supermarket } from "@/lib/supermarkets";
import { findOrCreateIngredient } from "@/server/actions/ingredients";

export type IngredientOption = {
  id: string;
  name: string;
  defaultUnit: string | null;
};

/**
 * Picks one ingredient, with create-on-the-fly.
 *
 * The same shape as `TagCombobox`: the create option only appears when what you
 * have typed does not already match an existing ingredient case-insensitively,
 * which is what stops "Chicken Breast" being offered as new when "chicken
 * breast" exists. The unique index on `(kitchen_id, lower(name))` is the real
 * guarantee; this makes it visible before you press anything.
 *
 * Reports the ingredient's `default_unit` back to the caller so the editor can
 * prefill the unit picker.
 */
export function IngredientCombobox({
  options,
  value,
  onChange,
  onOptionCreated,
  supermarkets,
}: {
  options: IngredientOption[];
  value: string | null;
  onChange: (ingredient: IngredientOption) => void;
  onOptionCreated: (ingredient: IngredientOption) => void;
  supermarkets: Supermarket[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  // Set only for an ingredient that did not exist a moment ago, so the prompt
  // never appears for one that was merely picked from the list.
  const [justCreated, setJustCreated] = useState<IngredientOption | null>(null);

  const selected = options.find((option) => option.id === value) ?? null;
  const trimmedQuery = query.trim();

  const alreadyExists = options.some(
    (option) => option.name.toLowerCase() === trimmedQuery.toLowerCase(),
  );
  const canCreate = trimmedQuery.length > 0 && !alreadyExists;

  function create() {
    startTransition(async () => {
      const result = await findOrCreateIngredient({ name: trimmedQuery });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      const created = {
        id: result.ingredient.id,
        name: result.ingredient.name,
        defaultUnit: result.ingredient.default_unit,
      };

      // The action returns the existing row if one matched case-insensitively,
      // so this both adds new ingredients and quietly reuses an existing one.
      onOptionCreated(created);
      onChange(created);
      setQuery("");
      setOpen(false);

      // Ask where it is bought while the author is still thinking about it.
      // Only when there are shops to pick from, and only for a genuinely new
      // ingredient — reusing an existing one already has its assignments.
      const isReallyNew = !options.some((option) => option.id === created.id);
      if (isReallyNew && supermarkets.length > 0) {
        setJustCreated(created);
      }
    });
  }

  return (
    <>
      <NewIngredientSupermarketPrompt
        ingredient={justCreated}
        supermarkets={supermarkets}
        onClose={() => setJustCreated(null)}
      />
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
        >
          <span className={selected ? "" : "text-muted-foreground"}>
            {selected ? selected.name : "Pick an ingredient"}
          </span>
          <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command
          // Filtered in memory: a household has few enough ingredients that a
          // round trip per keystroke would be slower than searching the list we
          // already have.
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput
            placeholder="Search or create…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {!canCreate && <CommandEmpty>No ingredients found.</CommandEmpty>}
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.name}
                  onSelect={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={
                      option.id === value ? "size-4" : "size-4 opacity-0"
                    }
                  />
                  {option.name}
                </CommandItem>
              ))}
            </CommandGroup>
            {canCreate && (
              <CommandGroup>
                <CommandItem
                  value={`create-${trimmedQuery}`}
                  onSelect={create}
                  disabled={isPending}
                >
                  <Plus className="size-4" />
                  Create &ldquo;{trimmedQuery}&rdquo;
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
    </>
  );
}

/**
 * Asks where a newly created ingredient is bought. SPEC.md §8 Phase 5.
 *
 * Dismissible with Skip, and that matters: acceptance criterion 2 requires an
 * unassigned ingredient to remain perfectly usable, so this must never be a
 * gate. The chips save themselves as they are tapped, so Skip is genuinely just
 * "stop asking" rather than a discard.
 */
function NewIngredientSupermarketPrompt({
  ingredient,
  supermarkets,
  onClose,
}: {
  ingredient: IngredientOption | null;
  supermarkets: Supermarket[];
  onClose: () => void;
}) {
  return (
    <Dialog open={ingredient !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Where do you buy {ingredient?.name}?</DialogTitle>
          <DialogDescription>
            Optional. You can set this later from kitchen settings, and an
            unassigned ingredient works exactly the same.
          </DialogDescription>
        </DialogHeader>

        {ingredient && (
          <SupermarketChips
            ingredientId={ingredient.id}
            supermarkets={supermarkets}
            assignedIds={[]}
          />
        )}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
