"use client";

import { Check, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import type { RecipeTag } from "@/lib/recipes";
import { findOrCreateTag } from "@/server/actions/recipes";

/**
 * Picks tags for a recipe, with create-on-the-fly.
 *
 * The "create" option only appears when what you have typed does not already
 * match an existing tag case-insensitively, which is what stops "Healthy"
 * being offered as new when "healthy" exists. SPEC.md §8 Phase 2 acceptance.
 * The database's unique index on `(kitchen_id, lower(name))` is the real
 * guarantee; this is the part that makes it visible before you press anything.
 */
export function TagCombobox({
  allTags,
  selectedIds,
  onChange,
}: {
  allTags: RecipeTag[];
  selectedIds: string[];
  onChange: (tagIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [knownTags, setKnownTags] = useState(allTags);
  const [isPending, startTransition] = useTransition();

  const selected = knownTags.filter((tag) => selectedIds.includes(tag.id));
  const trimmedQuery = query.trim();

  const alreadyExists = knownTags.some(
    (tag) => tag.name.toLowerCase() === trimmedQuery.toLowerCase(),
  );
  const canCreate = trimmedQuery.length > 0 && !alreadyExists;

  function toggle(tagId: string) {
    onChange(
      selectedIds.includes(tagId)
        ? selectedIds.filter((id) => id !== tagId)
        : [...selectedIds, tagId],
    );
  }

  function create() {
    startTransition(async () => {
      const result = await findOrCreateTag({ name: trimmedQuery });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      // The action returns the existing tag if one matched case-insensitively,
      // so this both adds new tags and quietly reuses an existing one.
      setKnownTags((tags) =>
        tags.some((tag) => tag.id === result.tag.id)
          ? tags
          : [...tags, result.tag].sort((a, b) => a.name.localeCompare(b.name)),
      );
      if (!selectedIds.includes(result.tag.id)) {
        onChange([...selectedIds, result.tag.id]);
      }
      setQuery("");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((tag) => (
          <Badge key={tag.id} variant="secondary" className="gap-1">
            {tag.name}
            <button
              type="button"
              onClick={() => toggle(tag.id)}
              aria-label={`Remove ${tag.name}`}
              className="hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <Plus className="size-4" />
              Add tag
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command
              // Filtering happens here rather than in the database: a household
              // has few enough tags that a round trip per keystroke would be
              // slower than searching the list already in memory.
              filter={(value, search) =>
                value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
              }
            >
              <CommandInput
                placeholder="Search or create…"
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                {!canCreate && <CommandEmpty>No tags found.</CommandEmpty>}
                <CommandGroup>
                  {knownTags.map((tag) => (
                    <CommandItem
                      key={tag.id}
                      value={tag.name}
                      onSelect={() => toggle(tag.id)}
                    >
                      <Check
                        className={
                          selectedIds.includes(tag.id)
                            ? "size-4"
                            : "size-4 opacity-0"
                        }
                      />
                      {tag.name}
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
      </div>
    </div>
  );
}
