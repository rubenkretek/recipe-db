-- Phase 6, SPEC.md §5.1 and §5.6. Meal plans: what we are cooking, and when.

-- §5.1 defines plan_status alongside meal_type and list_status. meal_type was
-- created in Phase 2; list_status belongs to Phase 7 and creating it now would
-- be building ahead.
create type public.plan_status as enum ('active', 'complete');


-- ---------------------------------------------------------------------------
-- Meal plans
-- ---------------------------------------------------------------------------

create table public.meal_plans (
  id           uuid primary key default gen_random_uuid(),
  kitchen_id   uuid not null references public.kitchens (id) on delete cascade,
  -- Optional. A plan is a period, not a week, so most are unnamed and render as
  -- "Current plan"; naming one matters for history, where "Christmas week"
  -- reads and "Plan from 5 Sept" does not.
  name         text check (name is null or length(trim(name)) between 1 and 80),
  starts_on    date not null default current_date,
  ends_on      date,
  status       plan_status not null default 'active',
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);

-- At most one active plan per kitchen. SPEC.md §8 Phase 6 acceptance criterion
-- 2 credits this index with the guarantee, and it is the backstop that makes it
-- true — but see complete_meal_plan() below: it is checked per statement, not
-- deferred to commit, so the order of the swap is what stops it firing.
create unique index meal_plans_one_active_per_kitchen
  on public.meal_plans (kitchen_id) where status = 'active';

create index meal_plans_kitchen_id_idx on public.meal_plans (kitchen_id);

-- The pair a composite foreign key can point at, so meal_plan_recipes below
-- cannot straddle two kitchens. Same shape as recipes and ingredients.
alter table public.meal_plans
  add constraint meal_plans_id_kitchen_key unique (id, kitchen_id);


-- ---------------------------------------------------------------------------
-- Recipes on a plan
-- ---------------------------------------------------------------------------

create table public.meal_plan_recipes (
  id           uuid primary key default gen_random_uuid(),
  -- SPEC.md §5.6 declares kitchen_id with no `references` clause — the sixth
  -- table with that omission. Added for the same reason as everywhere else.
  kitchen_id   uuid not null references public.kitchens (id) on delete cascade,
  meal_plan_id uuid not null,
  recipe_id    uuid not null,
  -- Defaults to recipe.base_servings when added, then persisted: unlike the
  -- recipe detail page's stepper, which is display only. SPEC.md §6.2.
  -- §5.6 gives no check, while the base_servings it is copied from has one.
  servings     int not null check (servings > 0),
  sort_order   int not null default 0,
  cooked_at    timestamptz,
  created_at   timestamptz not null default now(),

  -- COMPOSITE foreign keys, not single-column ones. See SPEC.md §5.8 and the
  -- 20260905200000 migration: referencing (id, kitchen_id) forces both parents
  -- into this row's kitchen, so a plan from one kitchen cannot be joined to a
  -- recipe from another.
  foreign key (meal_plan_id, kitchen_id)
    references public.meal_plans (id, kitchen_id) on delete cascade,
  foreign key (recipe_id, kitchen_id)
    references public.recipes (id, kitchen_id) on delete cascade
);

-- Deliberately no unique constraint on (meal_plan_id, recipe_id): cooking the
-- same thing twice in one period is real. Phase 7's added-ingredients table
-- keys on meal_plan_recipe_id, so duplicates stay safe there too.

create index meal_plan_recipes_kitchen_id_idx
  on public.meal_plan_recipes (kitchen_id);

-- The plan screen's only query, on every render. §5.6 specifies no indexes.
create index meal_plan_recipes_plan_sort_idx
  on public.meal_plan_recipes (meal_plan_id, sort_order);

-- Answers "is this recipe already on the plan", which the Add to plan button
-- needs, and "when did we last cook this", which Phase 9 needs.
create index meal_plan_recipes_recipe_id_idx
  on public.meal_plan_recipes (recipe_id);


-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.meal_plans enable row level security;
alter table public.meal_plan_recipes enable row level security;

create policy "meal plans full access for members"
  on public.meal_plans for all to authenticated
  using (public.is_kitchen_member(kitchen_id))
  with check (public.is_kitchen_member(kitchen_id));

create policy "meal plan recipes full access for members"
  on public.meal_plan_recipes for all to authenticated
  using (public.is_kitchen_member(kitchen_id))
  with check (public.is_kitchen_member(kitchen_id));


-- ---------------------------------------------------------------------------
-- Completing a plan
-- ---------------------------------------------------------------------------

-- SPEC.md §6.4 asks for this as a single Postgres function called via RPC, so a
-- dropped connection cannot leave a kitchen with two active plans or none.
--
-- §6.4 lists six steps, four of which touch shopping_lists. Those tables arrive
-- in Phase 7 and this function grows to cover them then; today it does steps 1
-- and 3, which are the whole of the plan half.
--
-- security invoker, like merge_ingredients: RLS then still applies to every
-- statement inside, and there is no policy-recursion reason to escalate.
create or replace function public.complete_meal_plan(plan_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  plan_kitchen uuid;
  next_plan_id uuid;
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

  -- Step 1. This MUST come before the insert below. The partial unique index is
  -- checked per statement rather than deferred to commit, so creating the next
  -- plan first would collide with the one still marked active, every time.
  update public.meal_plans
     set status = 'complete',
         ends_on = current_date,
         completed_at = now()
   where id = plan_id;

  -- Step 3. Completing a plan is what creates the next one, so a kitchen only
  -- ever starts a plan by hand once.
  insert into public.meal_plans (kitchen_id, starts_on, status)
  values (plan_kitchen, current_date, 'active')
  returning id into next_plan_id;

  return next_plan_id;
end;
$$;

revoke execute on function public.complete_meal_plan(uuid) from anon, public;
grant execute on function public.complete_meal_plan(uuid) to authenticated;
