-- Let the household choose which unchecked items carry onto the next list.
-- Added 2026-09-22.
--
-- `complete_meal_plan` copied EVERY unchecked item, which is SPEC.md §6.4 step 5
-- as written. In practice a list accumulates things you thought better of, and
-- the only way to drop one was to go back and delete it before completing.
--
-- The selection is a PARAMETER rather than a delete-then-complete pair of calls
-- from the server action, because the swap has to stay atomic: a dropped
-- connection between archiving the old plan and inserting the new one would
-- leave the kitchen with no active plan at all. See CLAUDE.md.
--
-- `carry_item_ids` null means "carry everything", exactly what the old
-- one-argument function did, so nothing that has not been updated changes
-- behaviour. An empty array means "carry nothing", which is a real choice and
-- deliberately distinct from null.
--
-- The old signature is dropped rather than left beside the new one: with a
-- default on the added parameter a one-argument call would match both, and
-- Postgres refuses that as ambiguous rather than picking one.
--
-- Still SECURITY INVOKER, like the function it replaces. It must run as the
-- caller so RLS decides which plan and which items they can touch.

drop function if exists public.complete_meal_plan(uuid);

create function public.complete_meal_plan(
  plan_id uuid,
  carry_item_ids uuid[] default null
)
returns uuid
language plpgsql
set search_path to ''
as $function$
declare
  plan_kitchen   uuid;
  next_plan_id   uuid;
  old_list_id    uuid;
  new_list_id    uuid;
  carried        record;
  copied_item_id uuid;
begin
  select kitchen_id into plan_kitchen
    from public.meal_plans
   where id = plan_id and status = 'active';

  if plan_kitchen is null then
    raise exception 'no active meal plan with that id'
      using errcode = '22023';
  end if;

  -- Marked complete BEFORE the next one is inserted. The partial unique index
  -- `unique (kitchen_id) where status = 'active'` is checked per statement, not
  -- at commit, so the reverse order throws every single time. See CLAUDE.md.
  update public.meal_plans
     set status = 'complete',
         ends_on = current_date,
         completed_at = now()
   where id = plan_id;

  select id into old_list_id
    from public.shopping_lists
   where kitchen_id = plan_kitchen and status = 'active';

  if old_list_id is not null then
    update public.shopping_lists
       set status = 'archived',
           archived_at = now()
     where id = old_list_id;
  end if;

  insert into public.meal_plans (kitchen_id, starts_on, status)
  values (plan_kitchen, current_date, 'active')
  returning id into next_plan_id;

  insert into public.shopping_lists (kitchen_id, meal_plan_id, status)
  values (plan_kitchen, next_plan_id, 'active')
  returning id into new_list_id;

  if old_list_id is not null then
    for carried in
      select id, kitchen_id, ingredient_id, manual_name, quantity, unit
        from public.shopping_list_items
       where shopping_list_id = old_list_id
         and is_checked = false
         -- Null carries everything; otherwise only what was ticked in the
         -- confirmation. Anything left behind stays on the archived list, so
         -- completing a plan still deletes nothing.
         and (carry_item_ids is null or id = any (carry_item_ids))
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

  return next_plan_id;
end;
$function$;

comment on function public.complete_meal_plan(uuid, uuid[]) is
  'Completes a plan and opens the next, atomically. carry_item_ids null carries every unchecked item; an array carries only those; an empty array carries none.';
