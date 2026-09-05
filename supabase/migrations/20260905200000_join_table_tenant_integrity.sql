-- Closes the tenant-mismatch gap on the join tables from Phases 2, 3 and 4.
--
-- The Phase 5 verification proved that `is_kitchen_member(kitchen_id)` validates
-- the column, not the relationship: it establishes that the caller belongs to
-- the kitchen a row *claims*, and never checks that the rows being joined live
-- there too. A user who belongs to two kitchens could write a join row that
-- straddles them, and every member of the stated kitchen could then read it.
-- Confirmed open by writing and removing real rows on recipe_tags and
-- recipe_ingredients — not theoretical. See SPEC.md §5.8.
--
-- `ingredient_supermarkets` was fixed in 20260905190000 with composite foreign
-- keys. This applies the same shape to the four tables that were left, and it is
-- done now rather than later because Phase 6's meal_plan_recipes needs
-- `recipes (id, kitchen_id)` to be a referenceable pair anyway. Adding it once
-- serves both.
--
-- Verified before applying: zero existing rows violate any of these constraints.

-- ---------------------------------------------------------------------------
-- Referenceable (id, kitchen_id) pairs
-- ---------------------------------------------------------------------------
-- Redundant with each primary key, and that is fine: their only job is to give
-- a composite foreign key something to point at. `ingredients` already has one
-- from Phase 5.

alter table public.recipes
  add constraint recipes_id_kitchen_key unique (id, kitchen_id);

alter table public.tags
  add constraint tags_id_kitchen_key unique (id, kitchen_id);


-- ---------------------------------------------------------------------------
-- recipe_tags — Phase 2
-- ---------------------------------------------------------------------------

alter table public.recipe_tags
  drop constraint recipe_tags_recipe_id_fkey;

alter table public.recipe_tags
  drop constraint recipe_tags_tag_id_fkey;

alter table public.recipe_tags
  add constraint recipe_tags_recipe_fkey
  foreign key (recipe_id, kitchen_id)
  references public.recipes (id, kitchen_id) on delete cascade;

alter table public.recipe_tags
  add constraint recipe_tags_tag_fkey
  foreign key (tag_id, kitchen_id)
  references public.tags (id, kitchen_id) on delete cascade;


-- ---------------------------------------------------------------------------
-- recipe_ingredients — Phase 4
-- ---------------------------------------------------------------------------
-- `on delete restrict` on the ingredient half is preserved deliberately: an
-- ingredient in use cannot be deleted at all, which is why the ingredient
-- manager has no delete and merging is how a duplicate goes away. SPEC.md §5.5.

alter table public.recipe_ingredients
  drop constraint recipe_ingredients_recipe_id_fkey;

alter table public.recipe_ingredients
  drop constraint recipe_ingredients_ingredient_id_fkey;

alter table public.recipe_ingredients
  add constraint recipe_ingredients_recipe_fkey
  foreign key (recipe_id, kitchen_id)
  references public.recipes (id, kitchen_id) on delete cascade;

alter table public.recipe_ingredients
  add constraint recipe_ingredients_ingredient_fkey
  foreign key (ingredient_id, kitchen_id)
  references public.ingredients (id, kitchen_id) on delete restrict;


-- ---------------------------------------------------------------------------
-- recipe_photos — Phase 3
-- ---------------------------------------------------------------------------

alter table public.recipe_photos
  drop constraint recipe_photos_recipe_id_fkey;

alter table public.recipe_photos
  add constraint recipe_photos_recipe_fkey
  foreign key (recipe_id, kitchen_id)
  references public.recipes (id, kitchen_id) on delete cascade;


-- ---------------------------------------------------------------------------
-- ratings — Phase 2
-- ---------------------------------------------------------------------------
-- Only the recipe half is kitchen-scoped. `user_id` references profiles, which
-- has no kitchen_id and belongs to no kitchen, so it stays a plain foreign key.

alter table public.ratings
  drop constraint ratings_recipe_id_fkey;

alter table public.ratings
  add constraint ratings_recipe_fkey
  foreign key (recipe_id, kitchen_id)
  references public.recipes (id, kitchen_id) on delete cascade;
