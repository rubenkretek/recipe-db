-- Phase 1, SPEC.md §5.2. Identity: a public mirror of auth.users.

-- Shared trigger function for maintaining updated_at columns. SPEC.md puts
-- updated_at on recipes, ratings and shopping_list_items but never says what
-- maintains them, so it is created here and later phases just attach it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Creates the profile row on signup. The display name arrives as user metadata
-- from the signup form (options.data.display_name). Email signup supplies no
-- metadata otherwise, hence the fallback to the email local part.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- No insert policy: profiles are written only by the trigger above.
-- No delete policy: profiles disappear when the auth user does, by cascade.
--
-- Until kitchens exist a profile is visible only to its owner. The tenancy
-- migration widens this to "anyone sharing a kitchen with you", SPEC.md §5.8.
create policy "profiles are readable by self"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles are updatable by self"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
