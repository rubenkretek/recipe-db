import { requireKitchenContext } from "@/lib/kitchen";
import { signedUrlsFor } from "@/lib/photo-urls";
import { createClient } from "@/lib/supabase/server";
import type { MealType } from "@/schemas/recipe";

export type RecipeTag = {
  id: string;
  name: string;
};

export type RecipePhoto = {
  id: string;
  storagePath: string;
  sortOrder: number;
  /** Signed and short-lived. Absent if the object could not be signed. */
  url: string | null;
};

export type RecipeIngredient = {
  id: string;
  ingredientId: string;
  name: string;
  /** BASE UNITS: grams, millilitres or a count. Never kg or tbsp. */
  quantity: number | null;
  unit: string | null;
  /** How it was entered, so a tablespoon recipe still reads in tablespoons. */
  displayUnit: string | null;
  note: string | null;
};

export type RecipeRating = {
  userId: string;
  displayName: string;
  score: number;
};

export type RecipeListItem = {
  id: string;
  name: string;
  mealType: MealType;
  archivedAt: string | null;
  createdAt: string;
  tags: RecipeTag[];
  ratings: RecipeRating[];
  /** Mean of the scores actually given, or null when nobody has rated. */
  averageRating: number | null;
  /** Signed URL of the cover, or null when the recipe has no photos. */
  coverUrl: string | null;
};

export type RecipeDetail = RecipeListItem & {
  sourceUrl: string | null;
  method: string | null;
  notes: string | null;
  baseServings: number;
  /** Every photo, cover first. */
  photos: RecipePhoto[];
  /** The ingredient list, in the order the author arranged it. */
  ingredients: RecipeIngredient[];
};

export type RecipeSort = "name" | "rating" | "recent";

export type RecipeFilters = {
  search?: string;
  tagId?: string;
  mealType?: MealType;
  minRating?: number;
  sort?: RecipeSort;
  archived?: boolean;
};

/**
 * The columns and embedded rows every recipe query needs.
 *
 * Ratings are embedded rather than aggregated in SQL because sorting by average
 * cannot be expressed as a plain `order by` across a join, and because SPEC.md
 * §5.4 wants the individual scores shown next to the average anyway. One query
 * gets both.
 */
const RECIPE_SELECT = `
  id, name, meal_type, archived_at, created_at,
  source_url, method, notes, base_servings,
  recipe_tags ( tags ( id, name ) ),
  ratings ( user_id, score, profiles ( display_name ) ),
  recipe_photos ( id, storage_path, sort_order ),
  recipe_ingredients (
    id, ingredient_id, quantity, unit, display_unit, note, sort_order,
    ingredients ( name )
  )
`;

type RecipeRow = {
  id: string;
  name: string;
  meal_type: MealType;
  archived_at: string | null;
  created_at: string;
  source_url: string | null;
  method: string | null;
  notes: string | null;
  base_servings: number;
  recipe_tags: { tags: { id: string; name: string } | null }[];
  ratings: {
    user_id: string;
    score: number;
    profiles: { display_name: string } | null;
  }[];
  recipe_photos: {
    id: string;
    storage_path: string;
    sort_order: number;
  }[];
  recipe_ingredients: {
    id: string;
    ingredient_id: string;
    quantity: number | null;
    unit: string | null;
    display_unit: string | null;
    note: string | null;
    sort_order: number;
    ingredients: { name: string } | null;
  }[];
};

/**
 * Averages the scores that were actually given.
 *
 * Members who have not rated are absent rather than counted as zero, so an
 * unrated recipe is not dragged down the ranking as though it were bad. Returns
 * null when nobody has rated, which the UI shows as "Not rated".
 */
function averageOf(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

/**
 * Photos of a recipe, cover first.
 *
 * Sorted by `sort_order` and tie-broken by id, because deletes leave gaps and
 * nothing guarantees the values stay contiguous. The first entry is the cover.
 * SPEC.md §5.4.
 */
function photosOf(row: RecipeRow, urls: Map<string, string>): RecipePhoto[] {
  return [...row.recipe_photos]
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .map((photo) => ({
      id: photo.id,
      storagePath: photo.storage_path,
      sortOrder: photo.sort_order,
      url: urls.get(photo.storage_path) ?? null,
    }));
}

function toRecipeDetail(
  row: RecipeRow,
  urls: Map<string, string>,
): RecipeDetail {
  const ratings = row.ratings.map((rating) => ({
    userId: rating.user_id,
    displayName: rating.profiles?.display_name ?? "Someone",
    // numeric(3,1) arrives as a number through PostgREST, but be explicit.
    score: Number(rating.score),
  }));

  const photos = photosOf(row, urls);

  // sort_order is the author's arrangement; id is only a tie-break so the order
  // is stable if two rows ever share one.
  const ingredients = [...row.recipe_ingredients]
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .map((row) => ({
      id: row.id,
      ingredientId: row.ingredient_id,
      name: row.ingredients?.name ?? "Unknown ingredient",
      quantity: row.quantity === null ? null : Number(row.quantity),
      unit: row.unit,
      displayUnit: row.display_unit,
      note: row.note,
    }));

  return {
    id: row.id,
    name: row.name,
    mealType: row.meal_type,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    sourceUrl: row.source_url,
    method: row.method,
    notes: row.notes,
    baseServings: row.base_servings,
    tags: row.recipe_tags
      .map((link) => link.tags)
      .filter((tag): tag is RecipeTag => tag !== null)
      .sort((a, b) => a.name.localeCompare(b.name)),
    ratings,
    averageRating: averageOf(ratings.map((rating) => rating.score)),
    photos,
    coverUrl: photos[0]?.url ?? null,
    ingredients,
  };
}

/**
 * Signs every photo across a set of recipes in one batch.
 *
 * One round trip for the whole grid rather than one per recipe, which is the
 * difference between a fast page and an obvious stall once there are more than a
 * handful of recipes.
 */
async function signPhotosOf(rows: RecipeRow[]): Promise<Map<string, string>> {
  const paths = rows.flatMap((row) =>
    row.recipe_photos.map((photo) => photo.storage_path),
  );
  return signedUrlsFor(paths);
}

/**
 * The recipe grid, filtered and sorted per the URL search params.
 *
 * Kitchen, archived state, name search and meal type are narrowed in SQL
 * because they are cheap and cut the payload down. Tag filtering, the minimum
 * rating and all sorting happen here in TypeScript instead:
 *
 * - Sorting by average rating cannot be a plain `order by` across the ratings
 *   join, and the minimum-rating filter reads the same average.
 * - Tag filtering *could* be a PostgREST `!inner` join, but adding a filter on
 *   an embedded resource also filters the embedded rows that come back, so a
 *   recipe matching "healthy" would render showing only that one tag and
 *   silently lose its others.
 *
 * For a two-person library of a few hundred recipes this is comfortably fast.
 * If it ever grows past a thousand, the swap is a `security invoker` view that
 * exposes `avg_rating` so all of this returns to SQL.
 */
export async function listRecipes(
  filters: RecipeFilters = {},
): Promise<RecipeListItem[]> {
  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  // Filtered by the active kitchen explicitly, even though RLS would already do
  // it. RLS is the safety net, not the filter. See CLAUDE.md "Multi-tenancy".
  let query = supabase
    .from("recipes")
    .select(RECIPE_SELECT)
    .eq("kitchen_id", active.id);

  query = filters.archived
    ? query.not("archived_at", "is", null)
    : query.is("archived_at", null);

  if (filters.search) {
    // Escape the LIKE wildcards so a literal % or _ searches for itself.
    const escaped = filters.search.replace(/[%_]/g, (char) => `\\${char}`);
    query = query.ilike("name", `%${escaped}%`);
  }

  if (filters.mealType) {
    query = query.eq("meal_type", filters.mealType);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Could not load recipes: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as RecipeRow[];
  const urls = await signPhotosOf(rows);
  let recipes = rows.map((row) => toRecipeDetail(row, urls));

  if (filters.tagId) {
    recipes = recipes.filter((recipe) =>
      recipe.tags.some((tag) => tag.id === filters.tagId),
    );
  }

  if (filters.minRating !== undefined) {
    const minimum = filters.minRating;
    recipes = recipes.filter(
      (recipe) => recipe.averageRating !== null && recipe.averageRating >= minimum,
    );
  }

  return sortRecipes(recipes, filters.sort ?? "name");
}

function sortRecipes(
  recipes: RecipeListItem[],
  sort: RecipeSort,
): RecipeListItem[] {
  const sorted = [...recipes];

  if (sort === "rating") {
    // Unrated recipes sink to the bottom rather than sorting as though zero.
    sorted.sort((a, b) => {
      if (a.averageRating === null && b.averageRating === null) {
        return a.name.localeCompare(b.name);
      }
      if (a.averageRating === null) return 1;
      if (b.averageRating === null) return -1;
      return b.averageRating - a.averageRating;
    });
    return sorted;
  }

  if (sort === "recent") {
    sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return sorted;
  }

  sorted.sort((a, b) => a.name.localeCompare(b.name));
  return sorted;
}

/**
 * One recipe with its tags and ratings, or null if it does not exist in the
 * active kitchen. Used by the detail and edit pages.
 */
export async function getRecipe(recipeId: string): Promise<RecipeDetail | null> {
  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("recipes")
    .select(RECIPE_SELECT)
    .eq("kitchen_id", active.id)
    .eq("id", recipeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load the recipe: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  const row = data as unknown as RecipeRow;
  return toRecipeDetail(row, await signPhotosOf([row]));
}

/**
 * Every tag in the active kitchen, alphabetically.
 *
 * Feeds both the editor's combobox and the grid's tag filter. A household has
 * few enough tags that loading all of them and filtering in the browser is
 * simpler and snappier than a search-as-you-type round trip.
 */
export async function listTags(): Promise<RecipeTag[]> {
  const { active } = await requireKitchenContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tags")
    .select("id, name")
    .eq("kitchen_id", active.id)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load tags: ${error.message}`);
  }

  return data ?? [];
}
