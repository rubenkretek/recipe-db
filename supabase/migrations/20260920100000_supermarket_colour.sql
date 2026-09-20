-- A colour per supermarket, so the ingredients grid can tint each shop's
-- column. Added 2026-09-20, after Phase 5.
--
-- Nullable with no default, and every view must cope with that: a kitchen that
-- has never set a colour, or a shop added before this migration, still has to
-- render. The grid falls back to no tint rather than inventing one.
--
-- Stored as a `#rrggbb` string rather than three integers because that is what
-- `<input type="color">` reads and writes, and what CSS wants back. The check
-- constraint is the guarantee: the column cannot hold anything a browser would
-- refuse to render, whatever the client sends.
alter table public.supermarkets
  add column colour text
  check (colour is null or colour ~* '^#[0-9a-f]{6}$');

comment on column public.supermarkets.colour is
  'Hex colour (#rrggbb) tinting this shop''s column on the ingredients grid. Null means no colour, which every view must still render.';
