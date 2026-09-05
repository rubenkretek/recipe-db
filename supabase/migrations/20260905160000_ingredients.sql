-- Phase 4, SPEC.md §5.5. Ingredients and the recipe ingredient rows.

create table public.ingredients (
  id           uuid primary key default gen_random_uuid(),
  kitchen_id   uuid not null references public.kitchens (id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 80),
  -- 'g' | 'ml' | a count unit. Prefills the recipe editor. Never interpreted by
  -- the database: units live in src/lib/units.ts. SPEC.md §5.3.
  default_unit text,
  -- Aisle, e.g. 'produce'. Column exists because it belongs to this table; no
  -- UI reads it until Phase 12.
  category     text,
  created_at   timestamptz not null default now()
);

-- Case-insensitive uniqueness per kitchen, same shape as tags: typing
-- "Chicken Breast" when "chicken breast" exists must reuse the existing row.
create unique index ingredients_kitchen_name_key
  on public.ingredients (kitchen_id, lower(name));

create index ingredients_kitchen_id_idx on public.ingredients (kitchen_id);


-- Matching aid for the Phase 10 importer: "spring onions" -> "spring onion".
-- Created here because §8 puts it in Phase 4's scope, but nothing reads or
-- writes it until Phase 10. It will sit empty until then, deliberately.
create table public.ingredient_aliases (
  id            uuid primary key default gen_random_uuid(),
  kitchen_id    uuid not null references public.kitchens (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  alias         text not null check (length(trim(alias)) between 1 and 80),
  created_at    timestamptz not null default now()
);

-- Two ingredients must not both claim the same alias, or matching becomes
-- ambiguous the moment Phase 10 starts using it.
create unique index ingredient_aliases_kitchen_alias_key
  on public.ingredient_aliases (kitchen_id, lower(alias));

create index ingredient_aliases_kitchen_id_idx
  on public.ingredient_aliases (kitchen_id);

create index ingredient_aliases_ingredient_id_idx
  on public.ingredient_aliases (ingredient_id);


create table public.recipe_ingredients (
  id            uuid primary key default gen_random_uuid(),
  -- SPEC.md §5.5 declares kitchen_id with no `references` clause. Added for the
  -- same reason as on ratings, recipe_tags and recipe_photos.
  kitchen_id    uuid not null references public.kitchens (id) on delete cascade,
  recipe_id     uuid not null references public.recipes (id) on delete cascade,
  -- `restrict`, per the spec: an ingredient in use cannot be deleted. Merging
  -- is how a duplicate goes away, which is why there is no delete button.
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  -- BASE UNITS ONLY: grams, millilitres, or the count unit itself. Never a
  -- kilogram or a tablespoon. Conversion happens client-side in units.ts.
  -- SPEC.md §5.3 and CLAUDE.md "Units and quantities".
  quantity      numeric,
  unit          text,
  -- How it was originally entered, so a tablespoon recipe still reads in
  -- tablespoons. Advisory only. SPEC.md §5.3 and §9 decision 3.
  display_unit  text,
  note          text,
  sort_order    int not null default 0,
  -- "null when quantity is null", SPEC.md §5.5. An unquantified ingredient is
  -- "salt, to taste": no number and no unit, never one without the other.
  constraint recipe_ingredients_quantity_unit_agree check (
    (quantity is null and unit is null)
    or (quantity is not null and unit is not null)
  )
);

create index recipe_ingredients_kitchen_id_idx
  on public.recipe_ingredients (kitchen_id);

-- "the ingredients of this recipe, in order", which is every read on a recipe.
create index recipe_ingredients_recipe_order_idx
  on public.recipe_ingredients (recipe_id, sort_order);

-- "which recipes use this ingredient". No primary key answers this, and rename,
-- merge and the manager's usage count all need it.
create index recipe_ingredients_ingredient_id_idx
  on public.recipe_ingredients (ingredient_id);


-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.ingredients enable row level security;
alter table public.ingredient_aliases enable row level security;
alter table public.recipe_ingredients enable row level security;

create policy "ingredients full access for members"
  on public.ingredients for all to authenticated
  using (public.is_kitchen_member(kitchen_id))
  with check (public.is_kitchen_member(kitchen_id));

create policy "ingredient aliases full access for members"
  on public.ingredient_aliases for all to authenticated
  using (public.is_kitchen_member(kitchen_id))
  with check (public.is_kitchen_member(kitchen_id));

create policy "recipe ingredients full access for members"
  on public.recipe_ingredients for all to authenticated
  using (public.is_kitchen_member(kitchen_id))
  with check (public.is_kitchen_member(kitchen_id));


-- ---------------------------------------------------------------------------
-- Merging duplicates
-- ---------------------------------------------------------------------------

-- Repoints every recipe_ingredients row from one ingredient to another and
-- deletes the loser, atomically.
--
-- security INVOKER, not definer: nothing here needs to escape RLS, it only
-- needs to be one transaction. The caller's own policies still apply, so a
-- member cannot merge ingredients belonging to a kitchen they are not in.
--
-- A recipe that used both sides ends up with two rows for the same ingredient.
-- That is deliberate: they may carry different units or notes, and combining
-- quantities is shopping-list logic (SPEC.md §6.3), not recipe logic.
create or replace function public.merge_ingredients(
  source_id uuid,
  target_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_kitchen uuid;
  target_kitchen uuid;
begin
  if source_id = target_id then
    raise exception 'cannot merge an ingredient into itself' using errcode = '22023';
  end if;

  select kitchen_id into source_kitchen from public.ingredients where id = source_id;
  select kitchen_id into target_kitchen from public.ingredients where id = target_id;

  -- Null means RLS hid the row, which is the same answer as "does not exist".
  if source_kitchen is null or target_kitchen is null then
    raise exception 'ingredient not found' using errcode = '22023';
  end if;

  if source_kitchen <> target_kitchen then
    raise exception 'cannot merge across kitchens' using errcode = '42501';
  end if;

  update public.recipe_ingredients
     set ingredient_id = target_id
   where ingredient_id = source_id;

  -- Safe now that nothing references it: the `restrict` foreign key would have
  -- refused otherwise, which is the backstop if the update above missed a row.
  delete from public.ingredients where id = source_id;
end;
$$;

revoke execute on function public.merge_ingredients(uuid, uuid) from anon, public;
grant execute on function public.merge_ingredients(uuid, uuid) to authenticated;
