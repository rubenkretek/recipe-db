-- Makes it structurally impossible for an ingredient_supermarkets row to link
-- rows from different kitchens.
--
-- Found by the Phase 5 verification. The RLS policy checks
-- `is_kitchen_member(kitchen_id)` and nothing more, so a user who belongs to two
-- kitchens could write a row whose kitchen_id said one kitchen while the
-- supermarket_id belonged to another. The row was then readable by every member
-- of the *stated* kitchen, including members who are not in the other one.
--
-- The denormalised kitchen_id on every join table is only trustworthy if
-- something enforces it, and RLS alone does not: it validates the column, not
-- the relationship between the column and what the row points at.
--
-- Composite foreign keys fix this declaratively. Referencing (id, kitchen_id)
-- rather than (id) means the parent's kitchen must equal the row's kitchen, so
-- a mismatch cannot be written at all — by the app, by a direct API call, or by
-- anything else. No trigger to maintain.

-- A composite foreign key needs a matching unique constraint to point at. These
-- are redundant with each primary key, and that is fine: their only job is to
-- make (id, kitchen_id) a referenceable target.
alter table public.ingredients
  add constraint ingredients_id_kitchen_key unique (id, kitchen_id);

alter table public.supermarkets
  add constraint supermarkets_id_kitchen_key unique (id, kitchen_id);

alter table public.ingredient_supermarkets
  drop constraint ingredient_supermarkets_ingredient_id_fkey;

alter table public.ingredient_supermarkets
  drop constraint ingredient_supermarkets_supermarket_id_fkey;

alter table public.ingredient_supermarkets
  add constraint ingredient_supermarkets_ingredient_fkey
  foreign key (ingredient_id, kitchen_id)
  references public.ingredients (id, kitchen_id) on delete cascade;

alter table public.ingredient_supermarkets
  add constraint ingredient_supermarkets_supermarket_fkey
  foreign key (supermarket_id, kitchen_id)
  references public.supermarkets (id, kitchen_id) on delete cascade;
