-- Phase 3, SPEC.md §5.4 and §5.8. Recipe photos: the table and the storage bucket.

create table public.recipe_photos (
  id           uuid primary key default gen_random_uuid(),
  -- SPEC.md §5.4 declares kitchen_id with no `references` clause. The foreign key
  -- is added here for the same reason it was on ratings and recipe_tags in
  -- Phase 2: a kitchen-scoped row should not outlive its kitchen.
  kitchen_id   uuid not null references public.kitchens (id) on delete cascade,
  recipe_id    uuid not null references public.recipes (id) on delete cascade,
  -- '{kitchen_id}/{recipe_id}/{uuid}.jpg'. The kitchen id is the first path
  -- segment so one storage policy can authorise the whole bucket. SPEC.md §5.8.
  storage_path text not null unique,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create index recipe_photos_kitchen_id_idx on public.recipe_photos (kitchen_id);

-- Serves "the photos of this recipe, cover first", which is every read there is.
create index recipe_photos_recipe_order_idx
  on public.recipe_photos (recipe_id, sort_order);

alter table public.recipe_photos enable row level security;

create policy "recipe photos full access for members"
  on public.recipe_photos for all to authenticated
  using (public.is_kitchen_member(kitchen_id))
  with check (public.is_kitchen_member(kitchen_id));


-- ---------------------------------------------------------------------------
-- Storage bucket
-- ---------------------------------------------------------------------------

-- Private: every read goes through a signed URL. SPEC.md §5.8.
--
-- The size and mime limits are a server-side backstop, not the main control.
-- Photos are resized to 1600px JPEG in the browser before upload, but anyone
-- can post directly to the storage API, so the bucket has to have its own
-- opinion about what it will accept.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-photos',
  'recipe-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- Storage policies
-- ---------------------------------------------------------------------------

-- These are the real security boundary for photos. Uploads go straight from the
-- browser to Storage rather than through a server action (see CLAUDE.md), so
-- nothing in the application code stands between a user and this bucket.
--
-- Every policy authorises on the first path segment, which is the kitchen id.
-- The insert policy is what guarantees that segment is honest: without it a user
-- could file a photo into another kitchen's folder and then read it back.
--
-- Note `storage.objects` is owned by `supabase_storage_admin` and the migration
-- role is not a member of it, yet these applied successfully — Supabase grants
-- policy creation on this table specifically. Applied in three separate
-- migrations because the outcome was uncertain; kept together here as the record.

create policy "recipe photos readable by kitchen members"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'recipe-photos'
    and public.is_kitchen_member(((storage.foldername(name))[1])::uuid)
  );

create policy "recipe photos writable by kitchen members"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recipe-photos'
    and public.is_kitchen_member(((storage.foldername(name))[1])::uuid)
  );

create policy "recipe photos deletable by kitchen members"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'recipe-photos'
    and public.is_kitchen_member(((storage.foldername(name))[1])::uuid)
  );
