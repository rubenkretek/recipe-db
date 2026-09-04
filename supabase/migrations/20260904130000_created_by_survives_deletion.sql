-- Lets a user account be deleted without taking the kitchen with it.
--
-- SPEC.md §5.2 originally gave both of these columns as
-- `not null references profiles(id)` with no delete rule, which defaults to
-- `no action`. Because profiles cascades from auth.users, that made any user who
-- had ever created a kitchen or an invite permanently undeletable: the cascade
-- reached the foreign key and the whole delete failed.
--
-- created_by is provenance, nothing more. Nothing reads it, no policy depends on
-- it, and a kitchen belongs to all of its members equally (SPEC.md §2), so it
-- should outlive whoever happened to create it. Hence `on delete set null`
-- rather than `cascade`, which would destroy a shared kitchen when one person
-- closed their account.
--
-- The foreign keys are dropped and recreated because Postgres cannot alter a
-- delete action in place. No rows are modified.

alter table public.kitchens
  alter column created_by drop not null;

alter table public.kitchens
  drop constraint kitchens_created_by_fkey;

alter table public.kitchens
  add constraint kitchens_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.kitchen_invites
  alter column created_by drop not null;

alter table public.kitchen_invites
  drop constraint kitchen_invites_created_by_fkey;

alter table public.kitchen_invites
  add constraint kitchen_invites_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;
