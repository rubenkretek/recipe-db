"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RecipeTag } from "@/lib/recipes";
import { MEAL_TYPES } from "@/schemas/recipe";

const SEARCH_DEBOUNCE_MS = 300;

/** Sentinel for "no filter", since a Radix Select item cannot have an empty value. */
const ANY = "any";

/**
 * Search, filter and sort controls for the recipe grid.
 *
 * All state lives in the URL rather than in React. That keeps the grid itself a
 * Server Component doing one database query, makes a filtered view shareable and
 * survivable across a refresh, and means the back button behaves.
 */
export function RecipeFilters({ allTags }: { allTags: RecipeTag[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "" || value === ANY) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }

    router.replace(next.size ? `${pathname}?${next}` : pathname, {
      scroll: false,
    });
  }

  function onSearchChange(value: string) {
    setSearch(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => apply({ q: value }), SEARCH_DEBOUNCE_MS);
  }

  const archived = searchParams.get("archived") === "1";
  const hasFilters =
    Boolean(searchParams.get("q")) ||
    Boolean(searchParams.get("tag")) ||
    Boolean(searchParams.get("meal")) ||
    Boolean(searchParams.get("min"));

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search recipes"
          className="pl-9"
          aria-label="Search recipes by name"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Select
          value={searchParams.get("tag") ?? ANY}
          onValueChange={(value) => apply({ tag: value })}
        >
          <SelectTrigger className="w-auto min-w-32" aria-label="Filter by tag">
            <SelectValue placeholder="Any tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any tag</SelectItem>
            {allTags.map((tag) => (
              <SelectItem key={tag.id} value={tag.id}>
                {tag.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("meal") ?? ANY}
          onValueChange={(value) => apply({ meal: value })}
        >
          <SelectTrigger className="w-auto min-w-32" aria-label="Filter by meal type">
            <SelectValue placeholder="Any meal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any meal</SelectItem>
            {MEAL_TYPES.map((mealType) => (
              <SelectItem key={mealType} value={mealType} className="capitalize">
                {mealType}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("min") ?? ANY}
          onValueChange={(value) => apply({ min: value })}
        >
          <SelectTrigger className="w-auto min-w-32" aria-label="Minimum rating">
            <SelectValue placeholder="Any rating" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any rating</SelectItem>
            {[6, 7, 8, 9].map((minimum) => (
              <SelectItem key={minimum} value={String(minimum)}>
                {minimum}+
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("sort") ?? "name"}
          onValueChange={(value) => apply({ sort: value === "name" ? null : value })}
        >
          <SelectTrigger className="w-auto min-w-36" aria-label="Sort recipes">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="rating">Highest rated</SelectItem>
            <SelectItem value="recent">Recently added</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              apply({ q: null, tag: null, meal: null, min: null })
            }
          >
            <X className="size-4" />
            Clear
          </Button>
        )}

        <Button
          variant={archived ? "secondary" : "ghost"}
          size="sm"
          className="ml-auto"
          onClick={() => apply({ archived: archived ? null : "1" })}
        >
          {archived ? "Showing archive" : "Archive"}
        </Button>
      </div>
    </div>
  );
}
