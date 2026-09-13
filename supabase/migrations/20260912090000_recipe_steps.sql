-- Structured method steps, replacing the single markdown `method` field.
--
-- This REVERSES SPEC.md §9 decision 4, which chose "a single markdown field,
-- not a structured list of steps... at the cost of a fiddlier editor now". The
-- cost was accepted deliberately on 2026-09-12: a step list reads better while
-- cooking and is what a step-by-step cook mode would need later.
--
-- Nothing is destroyed here. `recipes.method` is kept and its content copied
-- into a first step, so the change is reversible until a later migration drops
-- the column.

create table public.recipe_steps (
  id          uuid primary key default gen_random_uuid(),
  kitchen_id  uuid not null references public.kitchens (id) on delete cascade,
  recipe_id   uuid not null,
  -- Required: a step with no title is not a step. The description is what may
  -- be omitted — "Preheat the oven to 200C" needs nothing further.
  title       text not null check (length(trim(title)) between 1 and 200),
  -- Markdown, rendered by the same component as the old method field, which
  -- means `rehype-raw` stays absent and raw HTML stays inert. CLAUDE.md.
  description text,
  -- At most one photo per step, held as a storage path rather than a row in
  -- `recipe_photos`.
  --
  -- Deliberately NOT a foreign key into that table. Step photos there would
  -- mean every query that picks a recipe's cover — the grid, the plan screen,
  -- the picker — has to filter them out, and missing one silently promotes a
  -- close-up of a chopped onion to the recipe's cover image. A column cannot
  -- be forgotten in that way.
  --
  -- The path shape is the same `{kitchen_id}/{recipe_id}/{uuid}.jpg` that
  -- `photoStoragePath()` builds, so the existing bucket and its three storage
  -- policies already authorise it with no change: they read only the first
  -- segment. SPEC.md §5.8.
  photo_path  text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- COMPOSITE foreign key, per SPEC.md §5.8. A step cannot claim one kitchen
  -- while its recipe lives in another.
  foreign key (recipe_id, kitchen_id)
    references public.recipes (id, kitchen_id) on delete cascade
);

create index recipe_steps_kitchen_id_idx on public.recipe_steps (kitchen_id);

-- The only query the recipe page makes against this table.
create index recipe_steps_recipe_order_idx
  on public.recipe_steps (recipe_id, sort_order);

-- Every other parent in this schema carries this pair, so anything that ever
-- references a step can use the composite shape without a second migration.
-- Uniformity here is what stops the Phase 5 tenancy bug reappearing.
alter table public.recipe_steps
  add constraint recipe_steps_id_kitchen_key unique (id, kitchen_id);

create trigger recipe_steps_set_updated_at
  before update on public.recipe_steps
  for each row execute function public.set_updated_at();

alter table public.recipe_steps enable row level security;

create policy "recipe steps full access for members"
  on public.recipe_steps for all to authenticated
  using (public.is_kitchen_member(kitchen_id))
  with check (public.is_kitchen_member(kitchen_id));


-- ---------------------------------------------------------------------------
-- Carrying the existing methods across
-- ---------------------------------------------------------------------------

-- Every recipe that has a method becomes a recipe with one step holding it.
-- Nobody loses what they wrote, and a recipe whose method was already a
-- numbered list reads exactly as it did before until it is split up by hand.
--
-- Derives everything from existing rows; no generated ids are hardcoded.
insert into public.recipe_steps (kitchen_id, recipe_id, title, description, sort_order)
select r.kitchen_id, r.id, 'Method', r.method, 0
  from public.recipes r
 where r.method is not null
   and length(trim(r.method)) > 0;

-- `recipes.method` is deliberately left in place and simply stops being read.
-- It is the undo for the copy above. A later migration drops it once the steps
-- have been lived with; dropping it in the same breath as creating their
-- replacement would leave no way back.
comment on column public.recipes.method is
  'Superseded by recipe_steps on 2026-09-12. Retained unread as a fallback until the migration is proven; do not write to it.';

-- A recipe may still have zero steps. SPEC.md §8 Phase 2 acceptance is explicit
-- that "a recipe can be created with a name only, everything else optional",
-- and a `>= 1` constraint would contradict it. The editor starts you with one
-- blank step instead, which is a convention rather than a rule.
