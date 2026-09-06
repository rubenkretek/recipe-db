-- Phase 7, SPEC.md §5.1, §5.6 and §5.7. The shopping list.

-- The last of the three enums in §5.1. meal_type came in Phase 2, plan_status in
-- Phase 6.
create type public.list_status as enum ('active', 'archived');


-- ---------------------------------------------------------------------------
-- Shopping lists
-- ---------------------------------------------------------------------------

create table public.shopping_lists (
  id           uuid primary key default gen_random_uuid(),
  kitchen_id   uuid not null references public.kitchens (id) on delete cascade,
  -- Nullable, and deliberately so: you can shop without planning. `set null`
  -- rather than cascade, because deleting a plan must not destroy the list of
  -- things you still have to buy.
  meal_plan_id uuid references public.meal_plans (id) on delete set null,
  status       list_status not null default 'active',
  created_at   timestamptz not null default now(),
  archived_at  timestamptz
);

-- At most one active list per kitchen, exactly as meal_plans. The same warning
-- applies: this is checked per statement, not deferred to commit, so
-- complete_meal_plan() must archive the old list BEFORE inserting the new one.
create unique index shopping_lists_one_active_per_kitchen
  on public.shopping_lists (kitchen_id) where status = 'active';

create index shopping_lists_kitchen_id_idx
  on public.shopping_lists (kitchen_id);

alter table public.shopping_lists
  add constraint shopping_lists_id_kitchen_key unique (id, kitchen_id);


-- ---------------------------------------------------------------------------
-- Items
-- ---------------------------------------------------------------------------

create table public.shopping_list_items (
  id               uuid primary key default gen_random_uuid(),
  kitchen_id       uuid not null references public.kitchens (id) on delete cascade,
  shopping_list_id uuid not null,
  -- Null for a free-text item, which carries manual_name instead.
  ingredient_id    uuid,
  manual_name      text check (manual_name is null or length(trim(manual_name)) between 1 and 200),
  -- BASE UNITS, like everywhere else. Null for unquantified or free-text items.
  quantity         numeric,
  unit             text,
  is_checked       boolean not null default false,
  -- Who ticked it, for the "Got it" section. Provenance only, so `set null`
  -- rather than cascade: a closed account must not delete the shopping list.
  checked_by       uuid references public.profiles (id) on delete set null,
  checked_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ingredient_id is not null or manual_name is not null),

  foreign key (shopping_list_id, kitchen_id)
    references public.shopping_lists (id, kitchen_id) on delete cascade,

  -- Column-scoped `set null`, which Postgres 15+ allows and this project (17.6)
  -- supports. A plain `on delete set null` on a composite key would null
  -- kitchen_id too, and kitchen_id is `not null` — the delete would fail. Only
  -- the ingredient half may be cleared.
  --
  -- In practice this never fires: an ingredient cannot be deleted while a recipe
  -- uses it, and merge_ingredients() below repoints these rows before deleting
  -- the source. It is the declared behaviour for a hard delete that does not
  -- exist yet, not a live code path.
  foreign key (ingredient_id, kitchen_id)
    references public.ingredients (id, kitchen_id) on delete set null (ingredient_id)
);

create index shopping_list_items_kitchen_id_idx
  on public.shopping_list_items (kitchen_id);

-- The shopping screen's only query, run on every render and every tick.
-- §5.7 specified no indexes at all.
create index shopping_list_items_list_checked_idx
  on public.shopping_list_items (shopping_list_id, is_checked);

-- Serves the merge lookup in §6.3 step 2, and the repointing in
-- merge_ingredients() below.
create index shopping_list_items_ingredient_id_idx
  on public.shopping_list_items (ingredient_id);

alter table public.shopping_list_items
  add constraint shopping_list_items_id_kitchen_key unique (id, kitchen_id);

-- §6.3 step 3 bumps updated_at on a merge. Done by the shared trigger rather
-- than by hand in each server action, so nothing can forget.
create trigger shopping_list_items_set_updated_at
  before update on public.shopping_list_items
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- Which shops an item belongs under
-- ---------------------------------------------------------------------------

-- COPIED from ingredient_supermarkets when the item is created, then edited
-- independently. Reassigning an ingredient does NOT move items already on a
-- list. SPEC.md §5.7 and CLAUDE.md "Gotchas".
create table public.shopping_list_item_supermarkets (
  item_id        uuid not null,
  supermarket_id uuid not null,
  kitchen_id     uuid not null references public.kitchens (id) on delete cascade,
  primary key (item_id, supermarket_id),

  foreign key (item_id, kitchen_id)
    references public.shopping_list_items (id, kitchen_id) on delete cascade,
  foreign key (supermarket_id, kitchen_id)
    references public.supermarkets (id, kitchen_id) on delete cascade
);

create index shopping_list_item_supermarkets_kitchen_id_idx
  on public.shopping_list_item_supermarkets (kitchen_id);

-- The primary key leads with item_id, so it answers "which shops is this item
-- under" but not "which items are at this shop" — which is what selecting a
-- supermarket chip asks.
create index shopping_list_item_supermarkets_supermarket_id_idx
  on public.shopping_list_item_supermarkets (supermarket_id);


-- ---------------------------------------------------------------------------
-- What has already been sent to the list
-- ---------------------------------------------------------------------------

-- meal_plan_recipes needs a referenceable (id, kitchen_id) pair for the
-- composite foreign key below, the same shape every other parent carries.
alter table public.meal_plan_recipes
  add constraint meal_plan_recipes_id_kitchen_key unique (id, kitchen_id);

-- Purely informational: it never drives quantities. It is what lets the picker
-- grey out an ingredient and the plan row read "6 of 8 added". SPEC.md §5.6.
create table public.meal_plan_recipe_added_ingredients (
  meal_plan_recipe_id uuid not null,
  ingredient_id       uuid not null,
  kitchen_id          uuid not null references public.kitchens (id) on delete cascade,
  added_at            timestamptz not null default now(),
  primary key (meal_plan_recipe_id, ingredient_id),

  foreign key (meal_plan_recipe_id, kitchen_id)
    references public.meal_plan_recipes (id, kitchen_id) on delete cascade,
  foreign key (ingredient_id, kitchen_id)
    references public.ingredients (id, kitchen_id) on delete cascade
);

create index meal_plan_recipe_added_ingredients_kitchen_id_idx
  on public.meal_plan_recipe_added_ingredients (kitchen_id);

-- For the repointing in merge_ingredients() below.
create index meal_plan_recipe_added_ingredients_ingredient_id_idx
  on public.meal_plan_recipe_added_ingredients (ingredient_id);


-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;
alter table public.shopping_list_item_supermarkets enable row level security;
alter table public.meal_plan_recipe_added_ingredients enable row level security;

create policy "shopping lists full access for members"
  on public.shopping_lists for all to authenticated
  using (public.is_kitchen_member(kitchen_id))
  with check (public.is_kitchen_member(kitchen_id));

create policy "shopping list items full access for members"
  on public.shopping_list_items for all to authenticated
  using (public.is_kitchen_member(kitchen_id))
  with check (public.is_kitchen_member(kitchen_id));

create policy "shopping list item supermarkets full access for members"
  on public.shopping_list_item_supermarkets for all to authenticated
  using (public.is_kitchen_member(kitchen_id))
  with check (public.is_kitchen_member(kitchen_id));

create policy "added ingredients full access for members"
  on public.meal_plan_recipe_added_ingredients for all to authenticated
  using (public.is_kitchen_member(kitchen_id))
  with check (public.is_kitchen_member(kitchen_id));


-- ---------------------------------------------------------------------------
-- Merging ingredients, now that a shopping list can point at one
-- ---------------------------------------------------------------------------

-- Extended in Phase 7. Deleting the source ingredient fires `on delete set
-- null (ingredient_id)` on shopping_list_items, which would leave a row with no
-- ingredient AND no manual_name — violating its check constraint and aborting
-- the whole merge. Repointing first means the delete never reaches such a row.
--
-- Everything else is unchanged from 20260905160000.
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

  -- Two lines that become the same ingredient are deliberately NOT summed into
  -- one. Combining them would mean quantity arithmetic in SQL, which CLAUDE.md
  -- rules out, and §6.3's merge rule governs adding to the list rather than
  -- renaming what is already on it.
  update public.shopping_list_items
     set ingredient_id = target_id
   where ingredient_id = source_id;

  -- The primary key is (meal_plan_recipe_id, ingredient_id), so repointing can
  -- collide where both ingredients were added to the same planned recipe. Those
  -- rows are left alone and cascade away with the source: the target is already
  -- recorded as added, which is the answer the picker needs.
  update public.meal_plan_recipe_added_ingredients added
     set ingredient_id = target_id
   where added.ingredient_id = source_id
     and not exists (
       select 1
         from public.meal_plan_recipe_added_ingredients existing
        where existing.meal_plan_recipe_id = added.meal_plan_recipe_id
          and existing.ingredient_id = target_id
     );

  -- Safe now that nothing references it: the `restrict` foreign key would have
  -- refused otherwise, which is the backstop if the updates above missed a row.
  delete from public.ingredients where id = source_id;
end;
$$;

revoke execute on function public.merge_ingredients(uuid, uuid) from anon, public;
grant execute on function public.merge_ingredients(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Completing a plan, now with the shopping list half
-- ---------------------------------------------------------------------------

-- Phase 6 implemented steps 1 and 3 of SPEC.md §6.4 and left the other four,
-- which all touch shopping_lists, until the tables existed. This is the whole
-- of §6.4.
--
-- Still `security invoker`: RLS applies to every statement inside, so this
-- cannot be used to reach another kitchen's plan.
create or replace function public.complete_meal_plan(plan_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  plan_kitchen   uuid;
  next_plan_id   uuid;
  old_list_id    uuid;
  new_list_id    uuid;
  carried        record;
  copied_item_id uuid;
begin
  -- RLS filters this select, so a plan in a kitchen the caller is not a member
  -- of reads as absent — the same answer as "does not exist".
  select kitchen_id into plan_kitchen
    from public.meal_plans
   where id = plan_id and status = 'active';

  if plan_kitchen is null then
    raise exception 'no active meal plan with that id'
      using errcode = '22023';
  end if;

  -- Step 1. MUST precede the insert in step 3: the partial unique index is
  -- checked per statement, not deferred to commit.
  update public.meal_plans
     set status = 'complete',
         ends_on = current_date,
         completed_at = now()
   where id = plan_id;

  -- Step 2. A kitchen may have no list at all — nothing forces one to exist
  -- until something is added to it — so this is conditional.
  select id into old_list_id
    from public.shopping_lists
   where kitchen_id = plan_kitchen and status = 'active';

  if old_list_id is not null then
    -- Archived before step 4 inserts the new one, for the same per-statement
    -- reason as the plan above.
    update public.shopping_lists
       set status = 'archived',
           archived_at = now()
     where id = old_list_id;
  end if;

  -- Step 3.
  insert into public.meal_plans (kitchen_id, starts_on, status)
  values (plan_kitchen, current_date, 'active')
  returning id into next_plan_id;

  -- Step 4.
  insert into public.shopping_lists (kitchen_id, meal_plan_id, status)
  values (plan_kitchen, next_plan_id, 'active')
  returning id into new_list_id;

  -- Step 5. A straight copy of every unchecked item and its supermarket
  -- assignments. Row by row rather than one insert...select, because each new
  -- item's id is needed to copy its assignments and RETURNING cannot report
  -- which source row produced it. A household's list is tens of rows.
  if old_list_id is not null then
    for carried in
      select id, kitchen_id, ingredient_id, manual_name, quantity, unit
        from public.shopping_list_items
       where shopping_list_id = old_list_id
         and is_checked = false
       order by created_at
    loop
      insert into public.shopping_list_items
        (kitchen_id, shopping_list_id, ingredient_id, manual_name, quantity, unit)
      values
        (carried.kitchen_id, new_list_id, carried.ingredient_id,
         carried.manual_name, carried.quantity, carried.unit)
      returning id into copied_item_id;

      insert into public.shopping_list_item_supermarkets
        (kitchen_id, item_id, supermarket_id)
      select kitchen_id, copied_item_id, supermarket_id
        from public.shopping_list_item_supermarkets
       where item_id = carried.id;
    end loop;
  end if;

  -- Step 6 needs no code: checked items simply stay on the archived list, which
  -- is kept read-only for history.

  return next_plan_id;
end;
$$;

revoke execute on function public.complete_meal_plan(uuid) from anon, public;
grant execute on function public.complete_meal_plan(uuid) to authenticated;
