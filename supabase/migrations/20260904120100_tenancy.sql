-- Phase 1, SPEC.md §5.2 and §5.8. Tenancy: kitchens, membership and invites.

create table public.kitchens (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 60),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.kitchen_members (
  kitchen_id uuid not null references public.kitchens (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (kitchen_id, user_id)
);

-- The primary key already indexes kitchen_id as its leading column, so the
-- usual "index every kitchen_id" rule is satisfied without a second index.
-- This one exists for the other direction, "list my kitchens", which a
-- (kitchen_id, user_id) index cannot answer.
create index kitchen_members_user_id_idx on public.kitchen_members (user_id);

create table public.kitchen_invites (
  id         uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references public.kitchens (id) on delete cascade,
  code       text not null,
  created_by uuid not null references public.profiles (id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Codes are generated and stored uppercase, but people type them in whatever
-- case they like, so both uniqueness and lookup are case-insensitive.
create unique index kitchen_invites_code_key
  on public.kitchen_invites (upper(code));

create index kitchen_invites_kitchen_id_idx
  on public.kitchen_invites (kitchen_id);


-- ---------------------------------------------------------------------------
-- Policy helpers
-- ---------------------------------------------------------------------------

-- security definer so that policies on kitchen_members do not recurse through
-- the very table they protect. SPEC.md §5.8. Every kitchen-scoped policy in
-- every later phase should call this rather than writing its own subquery.
create or replace function public.is_kitchen_member(k uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.kitchen_members m
    where m.kitchen_id = k and m.user_id = auth.uid()
  );
$$;

-- Backs the profiles read policy in SPEC.md §5.8, "readable by anyone sharing
-- a kitchen with you". security definer for the same non-recursion reason.
create or replace function public.shares_a_kitchen_with(other uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.kitchen_members mine
    join public.kitchen_members theirs on theirs.kitchen_id = mine.kitchen_id
    where mine.user_id = auth.uid() and theirs.user_id = other
  );
$$;

-- Now that membership exists, widen the profiles read policy.
drop policy "profiles are readable by self" on public.profiles;

create policy "profiles are readable by kitchen mates"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or public.shares_a_kitchen_with(id)
  );


-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.kitchens enable row level security;
alter table public.kitchen_members enable row level security;
alter table public.kitchen_invites enable row level security;

-- kitchens: no insert policy. Creation goes through create_kitchen(), because
-- the kitchen row and its first membership row must be written together and
-- kitchen_members has no insert policy at all. CLAUDE.md "Gotchas".
-- No delete policy either: deleting a kitchen is not in Phase 1 scope.
create policy "kitchens are readable by members"
  on public.kitchens for select to authenticated
  using (public.is_kitchen_member(id));

create policy "kitchens are renameable by members"
  on public.kitchens for update to authenticated
  using (public.is_kitchen_member(id))
  with check (public.is_kitchen_member(id));

-- kitchen_members: no insert policy. Membership is granted only by
-- create_kitchen() and redeem_invite().
create policy "members are readable by members"
  on public.kitchen_members for select to authenticated
  using (public.is_kitchen_member(kitchen_id));

-- All members are equal and there are no permission tiers, SPEC.md §2, so
-- there is no "remove a member" operation. You can only remove yourself, which
-- is the leave-kitchen action.
create policy "members may remove only themselves"
  on public.kitchen_members for delete to authenticated
  using (user_id = (select auth.uid()));

-- kitchen_invites: no insert policy, minting goes through create_invite().
-- Update exists so a member can revoke a code.
create policy "invites are readable by members"
  on public.kitchen_invites for select to authenticated
  using (public.is_kitchen_member(kitchen_id));

create policy "invites are revocable by members"
  on public.kitchen_invites for update to authenticated
  using (public.is_kitchen_member(kitchen_id))
  with check (public.is_kitchen_member(kitchen_id));


-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Creates a kitchen and makes the caller its first member, atomically.
-- security definer because kitchen_members has no insert policy, so the first
-- membership row could otherwise never be written. CLAUDE.md "Gotchas".
create or replace function public.create_kitchen(kitchen_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  new_kitchen_id uuid;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.kitchens (name, created_by)
  values (trim(kitchen_name), caller)
  returning id into new_kitchen_id;

  insert into public.kitchen_members (kitchen_id, user_id)
  values (new_kitchen_id, caller);

  return new_kitchen_id;
end;
$$;

-- Mints a shareable join code, valid 7 days. SPEC.md §9 decision 2.
--
-- The alphabet is Crockford base32: digits and uppercase letters with I, L, O
-- and U removed, so a code has no character that can be misread as another and
-- cannot accidentally spell a word.
create or replace function public.create_invite(target_kitchen_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  new_code text;
  attempt int := 0;
begin
  if not public.is_kitchen_member(target_kitchen_id) then
    raise exception 'not a member of this kitchen' using errcode = '42501';
  end if;

  loop
    attempt := attempt + 1;

    new_code := '';
    for i in 1 .. 8 loop
      new_code := new_code
        || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    begin
      insert into public.kitchen_invites (kitchen_id, code, created_by, expires_at)
      values (target_kitchen_id, new_code, auth.uid(), now() + interval '7 days');
      return new_code;
    exception when unique_violation then
      if attempt >= 10 then
        raise exception 'could not generate a unique invite code';
      end if;
    end;
  end loop;
end;
$$;

-- Joins the caller to a kitchen by code.
--
-- security definer because kitchen_invites is readable only by members: a
-- person holding a code they were sent is by definition not a member yet, so
-- they cannot look it up themselves. CLAUDE.md "Gotchas".
create or replace function public.redeem_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target_kitchen_id uuid;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select kitchen_id into target_kitchen_id
  from public.kitchen_invites
  where upper(code) = upper(trim(invite_code))
    and revoked_at is null
    and expires_at > now();

  if target_kitchen_id is null then
    raise exception 'invalid or expired invite code' using errcode = '22023';
  end if;

  -- Redeeming a code for a kitchen you are already in is a no-op rather than an
  -- error, so a shared link stays safe to click twice.
  insert into public.kitchen_members (kitchen_id, user_id)
  values (target_kitchen_id, caller)
  on conflict (kitchen_id, user_id) do nothing;

  return target_kitchen_id;
end;
$$;

-- These are all security definer, so keep them off the anon role entirely.
revoke execute on function public.create_kitchen(text) from anon, public;
revoke execute on function public.create_invite(uuid) from anon, public;
revoke execute on function public.redeem_invite(text) from anon, public;
revoke execute on function public.is_kitchen_member(uuid) from anon, public;
revoke execute on function public.shares_a_kitchen_with(uuid) from anon, public;

grant execute on function public.create_kitchen(text) to authenticated;
grant execute on function public.create_invite(uuid) to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.is_kitchen_member(uuid) to authenticated;
grant execute on function public.shares_a_kitchen_with(uuid) to authenticated;
