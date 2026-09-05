-- Phase 2, SPEC.md §5.1 and §5.4. The recipe library: recipes, tags and ratings.

-- Only meal_type is created here. plan_status and list_status are also defined in
-- §5.1 but belong to Phases 6 and 7, and creating them now would be building ahead.
create type public.meal_type as enum (
  'breakfast', 'lunch', 'dinner', 'dessert', 'snack'
);


-- ---------------------------------------------------------------------------
-- Recipes
-- ---------------------------------------------------------------------------

create table public.recipes (
  id               uuid primary key default gen_random_uuid(),
  kitchen_id       uuid not null references public.kitchens (id) on delete cascade,
  name             text not null check (length(trim(name)) between 1 and 200),
  source_url       text,
  method           text,
  notes            text,
  meal_type        public.meal_type not null default 'dinner',
  base_servings    int not null default 2 check (base_servings > 0),
  -- Written from Phase 9 onwards. The column lives here because it belongs to
  -- this table; nothing reads or writes it yet.
  last_reviewed_at timestamptz,
  -- Soft delete. Archiving is the only removal: there is no hard delete and no
  -- delete policy, so a recipe can always be restored. SPEC.md §8 Phase 2.
  archived_at      timestamptz,
  -- Provenance only, nullable with `on delete set null`. SPEC.md §5.4 still says
  -- `not null`, which is the defect fixed in Phase 1 for kitchens: profiles
  -- cascades from auth.users, so a `no action` foreign key would make anyone who
  -- had written a recipe permanently undeletable. See CLAUDE.md "Gotchas".
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index recipes_kitchen_id_idx on public.recipes (kitchen_id);

-- The grid excludes archived recipes by default, so this is the common path.
create index recipes_kitchen_active_idx
  on public.recipes (kitchen_id)
  where archived_at is null;

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------

create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references public.kitchens (id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness per kitchen, so typing "Healthy" when "healthy"
-- exists cannot create a second tag. SPEC.md §5.4 and §8 Phase 2 acceptance.
create unique index tags_kitchen_name_key
  on public.tags (kitchen_id, lower(name));

create index tags_kitchen_id_idx on public.tags (kitchen_id);


create table public.recipe_tags (
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  tag_id     uuid not null references public.tags (id) on delete cascade,
  kitchen_id uuid not null references public.kitchens (id) on delete cascade,
  primary key (recipe_id, tag_id)
);

-- The primary key leads with recipe_id, so it answers "tags of this recipe" but
-- not "recipes with this tag" — which is exactly what filtering by tag needs.
create index recipe_tags_tag_id_idx on public.recipe_tags (tag_id);

create index recipe_tags_kitchen_id_idx on public.recipe_tags (kitchen_id);


-- ---------------------------------------------------------------------------
-- Ratings
-- ---------------------------------------------------------------------------

create table public.ratings (
  id         uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references public.kitchens (id) on delete cascade,
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  score      numeric(3,1) not null check (score >= 0 and score <= 10),
  updated_at timestamptz not null default now(),
  unique (recipe_id, user_id)
);

create index ratings_kitchen_id_idx on public.ratings (kitchen_id);
create index ratings_recipe_id_idx on public.ratings (recipe_id);

create trigger ratings_set_updated_at
  before update on public.ratings
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.recipes enable row level security;
alter table public.tags enable row level security;
alter table public.recipe_tags enable row level security;
alter table public.ratings enable row level security;

-- recipes and tags: read, create and edit for members, but no delete policy.
-- Removal is archiving, which is an update. SPEC.md §8 Phase 2.
create policy "recipes readable by members"
  on public.recipes for select to authenticated
  using (public.is_kitchen_member(kitchen_id));

create policy "recipes writable by members"
  on public.recipes for insert to authenticated
  with check (public.is_kitchen_member(kitchen_id));

create policy "recipes editable by members"
  on public.recipes for update to authenticated
  using (public.is_kitchen_member(kitchen_id))
  with check (public.is_kitchen_member(kitchen_id));

create policy "tags readable by members"
  on public.tags for select to authenticated
  using (public.is_kitchen_member(kitchen_id));

create policy "tags creatable by members"
  on public.tags for insert to authenticated
  with check (public.is_kitchen_member(kitchen_id));

-- recipe_tags is a pure join table: attaching and detaching a tag is insert and
-- delete, so it gets the full uniform policy.
create policy "recipe tags full access for members"
  on public.recipe_tags for all to authenticated
  using (public.is_kitchen_member(kitchen_id))
  with check (public.is_kitchen_member(kitchen_id));

-- ratings: the uniform policy from SPEC.md §5.8, applied deliberately.
--
-- This means any member can change any other member's score. That was raised and
-- consciously accepted rather than split into read-for-all / write-your-own: with
-- two people who trust each other the realistic risk is a mis-tap, not malice, and
-- keeping one policy shape everywhere is worth more than the guard. The UI
-- attributes every score by name so an accidental edit is visible.
-- Do not "fix" this without asking. See CLAUDE.md "Gotchas".
create policy "ratings full access for members"
  on public.ratings for all to authenticated
  using (public.is_kitchen_member(kitchen_id))
  with check (public.is_kitchen_member(kitchen_id));
