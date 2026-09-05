-- Phase 5, SPEC.md §5.5. Supermarkets, and which shops sell which ingredient.

create table public.supermarkets (
  id         uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references public.kitchens (id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),
  -- Drives the order of the supermarket chips on the Phase 7 shopping screen,
  -- so it is user-facing rather than incidental. Deletes leave gaps: nothing
  -- may assume these values are contiguous.
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness per kitchen, matching tags and ingredients. Two
-- shops both called "Tesco" is a mistake every time.
create unique index supermarkets_kitchen_name_key
  on public.supermarkets (kitchen_id, lower(name));

create index supermarkets_kitchen_id_idx on public.supermarkets (kitchen_id);


-- An ingredient can be bought at several supermarkets. SPEC.md §5.5.
create table public.ingredient_supermarkets (
  ingredient_id  uuid not null references public.ingredients (id) on delete cascade,
  supermarket_id uuid not null references public.supermarkets (id) on delete cascade,
  -- SPEC.md §5.5 declares kitchen_id with no `references` clause — the fifth
  -- table with that omission. Added for the same reason as everywhere else.
  kitchen_id     uuid not null references public.kitchens (id) on delete cascade,
  primary key (ingredient_id, supermarket_id)
);

create index ingredient_supermarkets_kitchen_id_idx
  on public.ingredient_supermarkets (kitchen_id);

-- The primary key leads with ingredient_id, so it answers "which shops sell
-- this ingredient" but not "which ingredients are sold at this shop" — which is
-- the central query of the Phase 7 shopping screen.
create index ingredient_supermarkets_supermarket_id_idx
  on public.ingredient_supermarkets (supermarket_id);


-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.supermarkets enable row level security;
alter table public.ingredient_supermarkets enable row level security;

create policy "supermarkets full access for members"
  on public.supermarkets for all to authenticated
  using (public.is_kitchen_member(kitchen_id))
  with check (public.is_kitchen_member(kitchen_id));

-- Deleting a supermarket cascades these rows away but harms no ingredient, so
-- unlike ingredients (which recipes depend on, hence `on delete restrict`) a
-- supermarket can genuinely be deleted.
create policy "ingredient supermarkets full access for members"
  on public.ingredient_supermarkets for all to authenticated
  using (public.is_kitchen_member(kitchen_id))
  with check (public.is_kitchen_member(kitchen_id));
