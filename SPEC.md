# Recipe & Shopping List App — Specification

**Version:** 0.3
**Status:** In use. Phases 0–8 are built; everything else is an unscheduled future build (§8).

> **Changes since 0.1:** All quantities are now stored in base units (grams, millilitres, or a count), with every conversion done client-side. The units lookup table has been removed from the database and is now a TypeScript constant. The shopping list is populated by an explicit button with a checkbox picker rather than syncing automatically from the plan; `shopping_list_item_sources` and `manual_quantity_base` have been removed as a result.

---

## 1. Overview

A shared recipe library, meal planner and real-time shopping list, replacing a Notion recipe database and a Google Keep shopping note.

The core loop:

1. Recipes are stored with structured ingredients, a method, photos, tags and per-person ratings.
2. Recipes are added to the **current meal plan** with a chosen number of servings.
3. For each planned recipe you press **Add ingredients**, tick the ones you actually need, and they land on the **shopping list**, grouped by supermarket.
4. Both people tick items off in the shop, in real time, on their phones, with patchy signal.
5. The plan is marked complete. Unticked items carry over. A new plan begins.

### Design principles

- **Simple code over clever code.** Prefer boring, readable solutions. Use well-known libraries rather than writing from scratch.
- **Document as you go.** Every exported function gets a JSDoc block explaining what it does and why. Non-obvious business rules get an inline comment referencing the section of this spec.
- **The database stores facts, the client formats them.** No conversion, rounding or presentation logic in SQL.
- **Mobile first.** The shopping screen is used one-handed in a supermarket. Everything else can be responsive.
- **Ship each phase.** Every phase leaves the app in a working, deployable state.

---

## 2. Non-goals

Not being built now, but the schema should not actively prevent them:

- Nutrition, calories, macros
- Cost or budget tracking
- Pantry / "what we already have" tracking
- Leftovers tracking
- Calendar sync
- Public recipe sharing or discovery
- Permission tiers within a kitchen (all members are equal)
- Day-of-week meal assignment
- Native mobile apps (PWA only)

---

## 3. Glossary

| Term | Meaning |
|---|---|
| **Kitchen** | A shared workspace containing recipes, ingredients, supermarkets, plans and lists. A user can belong to many kitchens. A kitchen can have many users. |
| **Recipe** | A dish, with ingredients, method, photos, tags, meal type and ratings. |
| **Ingredient** | A canonical, kitchen-scoped item ("chicken breast"). Referenced by many recipes. Assigned to one or more supermarkets. |
| **Recipe ingredient** | A link row: this recipe needs *this much* of *this ingredient*. |
| **Meal plan** | An ordered-ish set of recipes to cook over a period. Not fixed to 7 days. Exactly one plan per kitchen is `active` at a time. |
| **Shopping list** | Items added from planned recipes, plus manual items. Exactly one list per kitchen is `active` at a time. |
| **Base unit** | The unit a quantity is stored in: grams for weight, millilitres for volume, and the count unit itself for countable things. |

---

## 4. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) | React Server Components by default, `"use client"` only where interactivity is needed. |
| Language | TypeScript, strict mode | |
| Styling | Tailwind | |
| Components | shadcn/ui | Add components as needed via CLI, don't vendor the whole set up front. |
| Database / Auth / Storage / Realtime | Supabase | |
| DB access | `@supabase/supabase-js` + `@supabase/ssr`, with generated types | No ORM. Run `supabase gen types typescript` into `src/lib/database.types.ts`. |
| Forms | `react-hook-form` + `zod` | Zod schemas shared between client validation and server actions. |
| Client data cache | TanStack Query | Needed for optimistic updates and offline queueing on the shopping list. |
| Offline storage | Dexie (IndexedDB) | Phase 8 only. |
| PWA | ~~Serwist~~ hand-written service worker | **Changed in Phase 8.** `@serwist/next` hooks the *webpack* config, and `next build` here runs Turbopack — Next 16's default — so adopting it would have meant moving the whole Coolify build to `next build --webpack` for one feature. Its main value is generating a precache manifest, and every route in this app is server-rendered on demand, so there is no static HTML to precache: only content-hashed `/_next/static/` assets, which one cache-first rule covers. `public/sw.js` is ~60 lines and has no build-time step. |
| Dates | `date-fns` | |
| Toasts | `sonner` (via shadcn) | |
| Tests | Vitest | Minimal. Unit tests for `units.ts`, `servings.ts` and `shopping-merge.ts` only. |

### Deployment constraints

- Self-hosted on Coolify. **Do not use any Vercel-specific APIs** (no `@vercel/*` packages, no edge runtime assumptions, no ISR-on-Vercel behaviour).
- `next.config.ts` must set `output: "standalone"`.
- All configuration via environment variables. Document every required variable in `.env.example`.

### Project conventions

```
src/
  app/                    # routes
  components/
    ui/                   # shadcn primitives (generated)
    <feature>/            # feature components, colocated
  lib/
    supabase/             # client, server, middleware helpers
    units.ts              # unit definitions, parsing and display formatting
    servings.ts           # scaling and rounding
    shopping-merge.ts     # merging ingredients onto the list
    database.types.ts     # generated, never hand-edited
  server/
    actions/              # server actions, one file per feature
  schemas/                # zod schemas
supabase/
  migrations/             # numbered SQL migrations
```

- Mutations go through **server actions**, not route handlers, unless a route handler is genuinely needed (webhooks, AI import streaming).
- Every server action validates its input with a zod schema before touching the database.
- No abstraction until a pattern appears three times.

---

## 5. Data model

All timestamps are `timestamptz`. All IDs are `uuid default gen_random_uuid()`.

**Every kitchen-scoped table carries a `kitchen_id` column**, including child tables such as `recipe_ingredients`. This is deliberate denormalisation: it keeps every RLS policy a single indexed check instead of a join chain.

### 5.1 Enums

```sql
create type meal_type   as enum ('breakfast','lunch','dinner','dessert','snack');
create type plan_status as enum ('active','complete');
create type list_status as enum ('active','archived');
```

### 5.2 Identity and tenancy

```sql
-- Mirrors auth.users, populated by a trigger on signup.
profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  avatar_url    text,
  created_at    timestamptz not null default now()
)

kitchens (
  id          uuid primary key,
  name        text not null,
  -- Provenance only. Nullable with `on delete set null` so that closing an
  -- account does not take the shared kitchen with it, and does not fail
  -- outright. See decision 10 in §9. Changed in Phase 1.
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
)

kitchen_members (
  kitchen_id  uuid references kitchens(id) on delete cascade,
  user_id     uuid references profiles(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (kitchen_id, user_id)
)
-- create index on kitchen_members (user_id);
-- The primary key already indexes kitchen_id as its leading column. This second
-- index serves the other direction, "list my kitchens", which the PK cannot
-- answer. Added in Phase 1.

-- Shareable join codes. A member generates one, sends it however they like.
kitchen_invites (
  id          uuid primary key,
  kitchen_id  uuid not null references kitchens(id) on delete cascade,
  code        text not null,                 -- short, human-typeable, 8 chars
  -- Uniqueness is a case-insensitive index, not a plain `unique`: codes are
  -- generated uppercase but people type them in any case. Phase 1.
  --   create unique index on kitchen_invites (upper(code));
  created_by  uuid references profiles(id) on delete set null,   -- see kitchens
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
)
```

### 5.3 Units

**There is no units table.** Units are a TypeScript constant in `src/lib/units.ts`. The database stores a number and a unit string, and never interprets either.

#### Storage rule

Every stored quantity is in **base units**:

| Dimension | Stored unit | Stored value |
|---|---|---|
| Weight | `g` | grams |
| Volume | `ml` | millilitres |
| Count | the count unit itself | how many |

So `1kg flour` is stored as `quantity: 1000, unit: 'g'`. `2 tbsp soy sauce` is stored as `quantity: 30, unit: 'ml'`. `3 cloves garlic` is stored as `quantity: 3, unit: 'clove'`.

This means the `unit` column only ever holds one of: `g`, `ml`, or a count unit code.

#### Count units

`piece`, `clove`, `bunch`, `pack`, `can`, `slice`, `pinch`.

These are not interconvertible and are stored as entered. Two cloves and two pieces of garlic are not four of anything.

#### Input units

The recipe editor accepts these and converts to base on save:

| Code | Dimension | Multiply by |
|---|---|---|
| `g` | weight | 1 |
| `kg` | weight | 1000 |
| `oz` | weight | 28.3495 |
| `lb` | weight | 453.592 |
| `ml` | volume | 1 |
| `l` | volume | 1000 |
| `tsp` | volume | 5 |
| `tbsp` | volume | 15 |
| `cup` | volume | 240 |
| count units | count | 1 |

#### Display rule

Formatting happens in the client, in `formatQuantity(quantity, unit)`:

- Weight: `>= 1000g` renders as kg to at most 2 decimal places with trailing zeros trimmed (`1500` → `1.5kg`, `250` → `250g`).
- Volume: `>= 1000ml` renders as litres on the same basis (`1500` → `1.5l`, `200` → `200ml`).
- Count: the number, then the unit pluralised where the count is not 1 (`3 cloves`, `1 clove`). `piece` is omitted entirely, so `2 piece onion` renders as `2 onions`.
- A `null` quantity renders as nothing at all, leaving just the ingredient name and note (`salt, to taste`).

#### Merge rule

Two quantities may be summed **if and only if their `unit` strings are identical.** That is the whole rule. Because everything is normalised on the way in, grams always meet grams and millilitres always meet millilitres, and no dimension checking is needed anywhere.

#### Optional display hint

`recipe_ingredients.display_unit` records how the quantity was originally entered, so a recipe that was written as `2 tbsp` can still render as `2 tbsp` rather than `30ml`. It is advisory: if it is set and the value converts back cleanly, use it; otherwise fall back to the display rule above. The shopping list ignores it entirely and always uses the display rule.

### 5.4 Recipes

```sql
recipes (
  id                uuid primary key,
  kitchen_id        uuid not null references kitchens(id) on delete cascade,
  name              text not null,
  source_url        text,                    -- provenance only, not the recipe itself
  method            text,                    -- SUPERSEDED by recipe_steps (2026-09-12). Kept unread; do not write.
  notes             text,
  meal_type         meal_type not null default 'dinner',
  base_servings     int not null default 2 check (base_servings > 0),
  last_reviewed_at  timestamptz,             -- replaces the "2026 reviewed" column
  archived_at       timestamptz,             -- soft delete
  -- Provenance only, same shape as kitchens.created_by. See decision 10 in §9.
  -- Changed in Phase 2.
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
)
-- updated_at is maintained by the shared set_updated_at() trigger, created in
-- Phase 1 and attached to recipes and ratings in Phase 2.

-- The method, as ordered steps. Replaced the single markdown `method` field on
-- 2026-09-12, reversing §9 decision 4. Each existing method was copied into one
-- step titled "Method"; `recipes.method` stays as the undo until a later
-- migration drops it.
recipe_steps (
  id          uuid primary key,
  kitchen_id  uuid not null references kitchens(id) on delete cascade,
  recipe_id   uuid not null,
  title       text not null,            -- required; 1–200 chars after trimming
  description text,                     -- optional markdown, same renderer as before
  photo_path  text,                     -- optional, at most one per step
  sort_order  int not null default 0,   -- the step number is the position, not stored
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (recipe_id, kitchen_id)
    references recipes (id, kitchen_id) on delete cascade
)
-- create index on recipe_steps (kitchen_id);
-- create index on recipe_steps (recipe_id, sort_order);
-- Also unique (id, kitchen_id), so anything that ever references a step can
-- use the composite shape. updated_at uses the shared set_updated_at() trigger.
--
-- A recipe may have ZERO steps. §8 Phase 2 says a recipe can be created with a
-- name only; the editor starts with one blank step as a convention, and blank
-- steps are dropped on save.
--
-- photo_path is a column rather than a row in recipe_photos on purpose. Step
-- photos in that table would make every cover query need a `step_id is null`
-- filter, and missing one would promote a step photo to the recipe's cover. The
-- path shape is the same {kitchen_id}/{recipe_id}/{uuid}.jpg, so the existing
-- bucket and storage policies authorise it unchanged.

recipe_photos (
  id           uuid primary key,
  kitchen_id   uuid not null references kitchens(id) on delete cascade,
  recipe_id    uuid not null references recipes(id) on delete cascade,
  storage_path text not null unique,         -- Supabase Storage, private bucket
  sort_order   int not null default 0,       -- lowest sort_order is the cover
  created_at   timestamptz not null default now()
)
-- create index on recipe_photos (recipe_id, sort_order);
-- The cover is the lowest sort_order, tie-broken by id. Deletes leave gaps, so
-- nothing may assume the values are contiguous or that the cover is exactly 0.
-- The kitchen_id foreign key and the index were added in Phase 3.
--
-- Deleting a recipe cascades these rows but NOT the storage objects: Postgres
-- cannot reach into Storage. Anything that hard-deletes a recipe must remove
-- the files first.

tags (
  id          uuid primary key,
  kitchen_id  uuid not null references kitchens(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
)
-- create unique index on tags (kitchen_id, lower(name));

recipe_tags (
  recipe_id   uuid references recipes(id) on delete cascade,
  tag_id      uuid references tags(id) on delete cascade,
  kitchen_id  uuid not null,
  primary key (recipe_id, tag_id)
)
-- create index on recipe_tags (tag_id);
-- The primary key leads with recipe_id, so it answers "tags of this recipe" but
-- not "recipes with this tag", which is what filtering the grid by tag needs.
-- Added in Phase 2.

ratings (
  id          uuid primary key,
  kitchen_id  uuid not null,
  recipe_id   uuid not null references recipes(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  score       numeric(3,1) not null check (score >= 0 and score <= 10),
  updated_at  timestamptz not null default now(),
  unique (recipe_id, user_id)
)
```

Ratings are per person and visible to everyone in the kitchen. Recipe lists sort by the **average** of all ratings, with the individual scores shown on the recipe card.

The average counts only the members who have actually rated. A missing row means
"not rated" and is not treated as a zero, so an unrated recipe is not pushed to
the bottom of a rating sort as though it were bad. Clearing a rating deletes the
row rather than storing 0. Decided in Phase 2.

`ratings` uses the same uniform policy as every other kitchen-scoped table, which
means any member can edit any member's score. See decision 11 in §9.

### 5.5 Ingredients and supermarkets

```sql
ingredients (
  id           uuid primary key,
  kitchen_id   uuid not null references kitchens(id) on delete cascade,
  name         text not null,
  default_unit text,                  -- 'g' | 'ml' | a count unit. Prefills the editor.
  category     text,                  -- aisle: 'produce', 'dairy'. Optional, UI comes later.
  created_at   timestamptz not null default now()
)
-- create unique index on ingredients (kitchen_id, lower(name));

-- Helps the AI importer and manual entry match "spring onions" to an existing "spring onion".
ingredient_aliases (
  id            uuid primary key,
  kitchen_id    uuid not null,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  alias         text not null
)

supermarkets (
  id          uuid primary key,
  kitchen_id  uuid not null references kitchens(id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  -- Tints this shop's column on the ingredients grid. Added 2026-09-20.
  -- Nullable on purpose: a shop that has never been given a colour, including
  -- every shop that existed before the migration, must still render. Stored as
  -- '#rrggbb' because that is what <input type="color"> reads and CSS wants
  -- back, with a check constraint so the column cannot hold anything else.
  colour      text check (colour is null or colour ~* '^#[0-9a-f]{6}$'),
  created_at  timestamptz not null default now()
)

-- An ingredient can be bought at several supermarkets.
ingredient_supermarkets (
  ingredient_id  uuid not null,
  supermarket_id uuid not null,
  kitchen_id     uuid not null references kitchens(id) on delete cascade,
  primary key (ingredient_id, supermarket_id),
  -- COMPOSITE foreign keys, not single-column ones. Referencing
  -- (id, kitchen_id) forces the parent's kitchen to equal this row's kitchen,
  -- so a row cannot link an ingredient and a supermarket from two different
  -- kitchens. Added in Phase 5 after the verification proved a member of two
  -- kitchens could otherwise write exactly that. See §5.8.
  foreign key (ingredient_id, kitchen_id)
    references ingredients (id, kitchen_id) on delete cascade,
  foreign key (supermarket_id, kitchen_id)
    references supermarkets (id, kitchen_id) on delete cascade
)
-- create index on ingredient_supermarkets (supermarket_id);
-- The primary key leads with ingredient_id, so it answers "which shops sell
-- this ingredient" but not "which ingredients are at this shop" — the central
-- query of the shopping screen. Added in Phase 5.

recipe_ingredients (
  id            uuid primary key,
  kitchen_id    uuid not null references kitchens(id) on delete cascade,
  recipe_id     uuid not null references recipes(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete restrict,
  quantity      numeric,                 -- BASE UNITS. null means "to taste" / unquantified.
  unit          text,                    -- 'g' | 'ml' | count unit. null when quantity is null.
  display_unit  text,                    -- optional hint, see 5.3
  note          text,                    -- 'finely chopped', 'plus extra to serve'
  -- The heading this line sits under ("Salad", "Dressing"). Null = ungrouped.
  -- A group is a CONSECUTIVE run of lines in sort_order sharing a name; there is
  -- no groups table. 1–80 chars. Added 2026-09-13.
  group_name    text,
  sort_order    int not null default 0,
  -- "null when quantity is null" made enforceable. Phase 4.
  check ((quantity is null and unit is null)
      or (quantity is not null and unit is not null))
)
-- create index on recipe_ingredients (recipe_id, sort_order);
-- create index on recipe_ingredients (ingredient_id);
-- The second answers "which recipes use this ingredient", which renaming,
-- merging and the manager's usage count all need and no primary key serves.
-- The kitchen_id foreign key and both indexes were added in Phase 4.
--
-- Ingredient groups are stored per line rather than as their own table because
-- nothing outside a recipe refers to a group, and a recipe's lines are
-- rewritten wholesale on every save, so renaming a heading is free. The editor
-- shows headings as rows in the one sortable list: an ingredient belongs to the
-- nearest heading above it, dragging a heading moves only the heading, and a
-- heading with nothing under it is dropped on save because there is no line to
-- store it on. Ungrouped lines render first. The shopping list ignores groups.
--
-- `on delete restrict` on ingredient_id means an ingredient in use cannot be
-- deleted at all. That is deliberate: there is no delete in the ingredient
-- manager, and merging is how a duplicate goes away.
```

### 5.6 Meal plans

```sql
meal_plans (
  id           uuid primary key,
  kitchen_id   uuid not null references kitchens(id) on delete cascade,
  name         text,                     -- optional, e.g. 'Christmas week'
  starts_on    date not null default current_date,
  ends_on      date,                     -- set on completion
  status       plan_status not null default 'active',
  completed_at timestamptz,
  created_at   timestamptz not null default now()
)
-- create unique index on meal_plans (kitchen_id) where status = 'active';
-- The partial index is the backstop, not the mechanism: it is checked per
-- statement rather than deferred to commit, so complete_meal_plan() must mark
-- the old plan complete BEFORE inserting the new one or it fires every time.
-- create index on meal_plans (kitchen_id);
-- meal_plans also carries unique (id, kitchen_id) so meal_plan_recipes can
-- reference the pair. Phase 6.

meal_plan_recipes (
  id            uuid primary key,
  -- §5.6 originally declared kitchen_id with no `references` clause — the sixth
  -- table with that omission. Added in Phase 6.
  kitchen_id    uuid not null references kitchens(id) on delete cascade,
  meal_plan_id  uuid not null,
  recipe_id     uuid not null,
  servings      int not null check (servings > 0),  -- defaults to recipe.base_servings
  sort_order    int not null default 0,
  cooked_at     timestamptz,              -- optional tick as you go
  created_at    timestamptz not null default now(),
  -- COMPOSITE foreign keys, per §5.8. Added in Phase 6.
  foreign key (meal_plan_id, kitchen_id)
    references meal_plans (id, kitchen_id) on delete cascade,
  foreign key (recipe_id, kitchen_id)
    references recipes (id, kitchen_id) on delete cascade
)
-- create index on meal_plan_recipes (kitchen_id);
-- create index on meal_plan_recipes (meal_plan_id, sort_order);
-- create index on meal_plan_recipes (recipe_id);
-- §5.6 specified no indexes at all. The second is the plan screen's only query;
-- the third answers "is this recipe already on the plan" for the Add button and
-- "when did we last cook this" for the review future build (formerly Phase 9).
-- All added in Phase 6.
--
-- Deliberately NO unique constraint on (meal_plan_id, recipe_id): cooking the
-- same thing twice in one period is real, and Phase 7's added-ingredients table
-- keys on meal_plan_recipe_id, so duplicates stay safe there too.

-- Records which ingredients have already been sent to the shopping list, so the
-- picker can show "already added" and the plan can show "6 of 8 added".
-- Purely informational: it never drives quantities.
meal_plan_recipe_added_ingredients (
  meal_plan_recipe_id uuid references meal_plan_recipes(id) on delete cascade,
  ingredient_id       uuid references ingredients(id) on delete cascade,
  kitchen_id          uuid not null,
  added_at            timestamptz not null default now(),
  primary key (meal_plan_recipe_id, ingredient_id)
)
```

A plan is a period, not a week. `starts_on` defaults to the day it is created. `ends_on` is set when it is completed. Completing a plan creates the next one automatically.

### 5.7 Shopping list

```sql
shopping_lists (
  id            uuid primary key,
  kitchen_id    uuid not null references kitchens(id) on delete cascade,
  meal_plan_id  uuid references meal_plans(id) on delete set null,
  status        list_status not null default 'active',
  created_at    timestamptz not null default now(),
  archived_at   timestamptz
)
-- create unique index on shopping_lists (kitchen_id) where status = 'active';

shopping_list_items (
  id               uuid primary key,
  kitchen_id       uuid not null references kitchens(id) on delete cascade,
  shopping_list_id uuid not null,
  ingredient_id    uuid,
  manual_name      text,             -- used when ingredient_id is null
  quantity         numeric,          -- BASE UNITS. null for unquantified or free-text items.
  unit             text,             -- 'g' | 'ml' | count unit
  is_checked       boolean not null default false,
  checked_by       uuid references profiles(id) on delete set null,
  checked_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ingredient_id is not null or manual_name is not null),
  foreign key (shopping_list_id, kitchen_id)
    references shopping_lists (id, kitchen_id) on delete cascade,
  -- COLUMN-SCOPED `set null`, which Postgres 15+ allows. A plain
  -- `on delete set null` on a composite key nulls kitchen_id too, and that is
  -- `not null`, so the delete would fail outright. Only the ingredient half may
  -- be cleared. Phase 7.
  foreign key (ingredient_id, kitchen_id)
    references ingredients (id, kitchen_id) on delete set null (ingredient_id)
)
-- create index on shopping_list_items (kitchen_id);
-- create index on shopping_list_items (shopping_list_id, is_checked);
-- create index on shopping_list_items (ingredient_id);
-- §5.7 originally specified no indexes. The second is the shopping screen's
-- only query, run on every render and every tick; the third serves the merge
-- lookup in §6.3 and the repointing in merge_ingredients(). Phase 7.
--
-- updated_at is maintained by the shared set_updated_at() trigger, so §6.3
-- step 3 cannot be forgotten by a server action.
--
-- The `set null` above never actually fires: an ingredient cannot be deleted
-- while a recipe uses it, and merge_ingredients() repoints these rows before
-- deleting the source. Without that repointing the merge would abort, because
-- a row with a null ingredient_id and a null manual_name violates the check
-- constraint above. See §8 Phase 7.

-- Copied from ingredient_supermarkets when the item is created, then independently editable.
shopping_list_item_supermarkets (
  item_id        uuid not null,
  supermarket_id uuid not null,
  kitchen_id     uuid not null references kitchens(id) on delete cascade,
  primary key (item_id, supermarket_id),
  -- COMPOSITE foreign keys, per §5.8. Phase 7.
  foreign key (item_id, kitchen_id)
    references shopping_list_items (id, kitchen_id) on delete cascade,
  foreign key (supermarket_id, kitchen_id)
    references supermarkets (id, kitchen_id) on delete cascade
)
-- shopping_list_items is published for Realtime — `alter publication
-- supabase_realtime add table` — so Postgres Changes emits its updates. It is
-- the only published table. Phase 8.
--
-- create index on shopping_list_item_supermarkets (kitchen_id);
-- create index on shopping_list_item_supermarkets (supermarket_id);
-- The primary key leads with item_id, so it answers "which shops is this item
-- under" but not "which items are at this shop" — what a chip selection asks.
```

`shopping_lists` also carries `unique (id, kitchen_id)` and an index on
`kitchen_id`, and `shopping_list_items` the same pair, so the composite foreign
keys above have something to point at. Both added in Phase 7.

An item exists **once** regardless of how many supermarkets it appears under. Ticking it sets `is_checked` on the item, so it disappears from every supermarket view at once. This is the behaviour requested and it falls out of the schema for free.

Because items are added deliberately rather than synced, a quantity is just a number. Editing it is a plain update, and removing a recipe from the plan has no effect on the list.

### 5.8 Row-level security

Enable RLS on every table. Use a security-definer helper so policies never recurse through `kitchen_members`:

```sql
create function public.is_kitchen_member(k uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from kitchen_members m
    where m.kitchen_id = k and m.user_id = auth.uid()
  );
$$;
```

Then, for every kitchen-scoped table:

```sql
create policy "members full access" on <table>
  for all
  to authenticated                              -- see note below
  using (public.is_kitchen_member(kitchen_id))
  with check (public.is_kitchen_member(kitchen_id));
```

**Always include `to authenticated`.** Without a role clause a policy is also
evaluated for the `anon` role on every request, which is wasted work and hides
the intent. Added in Phase 1.

Special cases:

- `profiles`: readable by anyone sharing a kitchen with you; writable only by
  yourself. The read half needs its own `security definer` helper, because the
  obvious subquery recurses through `kitchen_members`:

  ```sql
  create function public.shares_a_kitchen_with(other uuid)
  returns boolean language sql security definer stable set search_path = ''
  as $$
    select exists (
      select 1
      from public.kitchen_members mine
      join public.kitchen_members theirs on theirs.kitchen_id = mine.kitchen_id
      where mine.user_id = auth.uid() and theirs.user_id = other
    );
  $$;
  ```
- `kitchen_members`: readable by members; insert allowed via the invite-redemption RPC only.
- `kitchen_invites`: readable by members. Redemption happens through a `security definer` RPC `redeem_invite(code text)` so a non-member can look up a code without being able to read the invites table.
- Storage bucket `recipe-photos`: private, with a policy keyed on the kitchen id being the first path segment (`{kitchen_id}/{recipe_id}/{uuid}.jpg`). Serve via signed URLs.

**Add an index on `kitchen_id` for every table.** Every query filters on it.

**RLS validates the column, not the relationship.** A policy of
`is_kitchen_member(kitchen_id)` proves the caller belongs to the kitchen the row
*claims*, and nothing more. On a join table it does not check that the rows being
joined actually live in that kitchen, so a user who belongs to two kitchens can
write a row that straddles them — and every member of the stated kitchen can then
read it. Discovered in Phase 5.

The fix is a **composite foreign key**: give the parent a unique constraint on
`(id, kitchen_id)` and have the join table reference that pair rather than the id
alone. The invariant then holds against the app, a direct API call and anything
else, with no trigger to maintain.

**Every join table now does this.** `ingredient_supermarkets` was fixed in
Phase 5; `recipe_tags`, `recipe_ingredients`, `recipe_photos` and `ratings` in
Phase 6, once `recipes (id, kitchen_id)` had to exist for `meal_plan_recipes`
anyway. Verified by probing each one as a member of two kitchens: every straddling
write is refused with `23503`. `recipes`, `tags`, `ingredients`, `supermarkets`
and `meal_plans` all carry the `unique (id, kitchen_id)` these point at.

**Any new join table must use this shape.** A single-column foreign key on a
kitchen-scoped table is a bug, not a simplification.

---

## 6. Key logic

These modules are pure, with no database access, so they can be unit tested directly.

### 6.1 Units — `src/lib/units.ts`

Exports:

- `UNITS` — the constant table from §5.3.
- `toBase(quantity, inputUnit)` — returns `{ quantity, unit }` in base units. Used on save.
- `formatQuantity(quantity, unit, displayUnit?)` — returns a display string per the rule in §5.3.
- `canMerge(unitA, unitB)` — string equality. Exists as a named function so the intent is documented at every call site.
- `pluraliseName(name, count)` — added in Phase 4. §5.3 wants `2 piece onion` to read `2 onions`, which means pluralising the **ingredient name**, and `formatQuantity` is never given the name. Best effort: it handles the common English rules and gets irregulars wrong ("leafs"), so the fix for those is to name the ingredient in plural form.

**"Converts back cleanly", defined.** `display_unit` is honoured when the stored value divided by that unit's multiplier lands within 0.001 of a number with at most 2 decimal places. So 30ml entered as tbsp renders `2 tbsp`, while 100g entered as oz would be 3.5274oz and falls back to `100g`. Decided in Phase 4, because acceptance criterion 2 turns on it.

**Consequence worth knowing:** scaling can break a clean conversion, so the same ingredient may change units as the servings stepper moves — `2 tbsp` scaled by 1.33 is 40ml, which is 2.67 tbsp, so it renders as `40ml`. Correct, but surprising.

There is deliberately no conversion between dimensions and no fuzzy matching. If a user enters something the parser does not understand, the editor asks them to pick a unit rather than guessing.

### 6.2 Servings scaling — `src/lib/servings.ts`

- A recipe stores `base_servings` and ingredient quantities for that number of servings.
- The recipe view has `−` / `+` controls around a servings number, defaulting to `base_servings`.
- Changing servings scales every quantity by `target / base_servings`. This is **display only** on the recipe page and is not persisted.
- Ingredients with `quantity = null` never scale.
- Rounding: weight and volume are rounded after unit selection to at most 2 decimal places. Counts are rounded to the nearest 0.5 in the recipe view, because half an onion is a real quantity, but **rounded up to a whole number on the shopping list**, because you cannot buy 1.5 onions.

**The two roundings must not compose.** `scaleQuantity` bakes the nearest-half
rule in, so applying `roundCountForShopping` to its output rounds twice and
under-buys: a recipe for 5 using 6 eggs, planned for 1 serving, needs 1.2 eggs,
which the half-rounding turns into 1.0 and the ceiling then leaves at 1 — one egg
short. The shopping path therefore uses a separate
`scaleQuantityForShopping(quantity, unit, base, target)`, which scales raw and
takes the ceiling once. Weight and volume are identical in both; only counts
diverge. Found and fixed in Phase 7, with a test pinning exactly this case.
- When a recipe is added to a plan, the chosen servings is persisted on `meal_plan_recipes.servings` and is what the ingredient picker uses.

### 6.3 Adding ingredients to the shopping list — `src/lib/shopping-merge.ts`

Nothing reaches the shopping list without an explicit action.

**The module decides; the server action executes.** The five steps below are all
queries, which cannot live in a pure tested module. So
`planShoppingListAdditions(existingItems, candidates)` takes what is already on
the list and what is being added, and returns a list of operations —
`increment`, `keep` or `create`. `src/server/actions/shopping.ts` carries them
out. That split is what makes "refuses to merge into a checked item" testable
without a database. Decided in Phase 7.

Candidates also merge **with each other**, not just into the list: the plan-wide
picker adding two onions from one recipe and three from another produces one
`create` of five, not two rows.

The picker sends only identifiers. Quantities are recomputed server-side from the
recipe and the planned servings, so a tampered request cannot state its own
amount and all scaling goes through one path.

**A recipe that needs one ingredient more than once gets one picker row for it.**
Vinegar in the pickles and again in the dressing is summed into a single row per
ingredient *and unit* (`combineRecipeLines`), captioned with the groups it came
from — the list buys it once. Different units stay separate rows. Lines are
summed before scaling, so counts round up once rather than per line. A selection
is therefore identified by planned recipe, ingredient and unit. Recording in
`meal_plan_recipe_added_ingredients` stays per ingredient, because recipe line
ids are replaced on every save. Fixed on 2026-09-13: previously the server took
only the first matching line, silently dropping every repeat's quantity, and the
picker's repeated rows shared a key and ticked together.

**The picker.** Each recipe on the plan has an **Add ingredients** button. Pressing it opens a sheet listing every ingredient of that recipe, with quantities already scaled to the planned servings.

- Every ingredient starts **ticked and green**.
- Tapping one **unticks it and turns it grey**, excluding it from the add.
- An ingredient already recorded in `meal_plan_recipe_added_ingredients` for this planned recipe starts **unticked and grey**, with the label "already added". It can still be ticked again if you genuinely want more.
- The confirm button reads "Add N items".

**The merge, for each ticked ingredient.**

1. Take the scaled quantity, rounding counts up per §6.2.
2. Look for an existing item on the active list with the same `ingredient_id`, the same `unit`, and `is_checked = false`.
   - Checked items are **never** matched. If you have already bought the onions and another recipe needs onions, that is a new line.
   - A `null` quantity matches another `null` quantity for the same ingredient and stays null.
3. If found, add the quantities together and update `updated_at`.
4. If not found, create the item and copy its supermarket assignments from `ingredient_supermarkets`. An ingredient assigned to no supermarket still appears, under an "Unassigned" group.
5. Record the pair in `meal_plan_recipe_added_ingredients`.

**Consequences of the explicit model, all intentional:**

- Removing a recipe from the plan does not remove anything from the list. Show a toast saying so, with an undo that restores the planned recipe.
- Changing servings after adding does not retroactively change quantities. The picker uses the current servings the next time it opens.
- Pressing Add ingredients twice and confirming twice will double the quantities. This is why already-added ingredients default to unticked.

### 6.4 Completing a plan and carrying over — `src/server/actions/plans.ts`

When a plan is marked complete, in a single transaction:

1. Set `meal_plans.status = 'complete'`, `ends_on = current_date`, `completed_at = now()`.
2. Set the current `shopping_lists.status = 'archived'`.
3. Create a new `meal_plans` row with `status = 'active'`, `starts_on = current_date`.
4. Create a new `shopping_lists` row with `status = 'active'`, linked to the new plan.
5. Copy the **unchecked** items the household chose to the new list, along with their supermarket assignments. A straight copy: quantity, unit, name. *(Amended 2026-09-22: originally every unchecked item. Completing now asks which ones, all ticked by default, because a list accumulates things you thought better of and the only way to drop one was to go back and delete it first. The selection is a parameter on `complete_meal_plan`, not a delete before calling it, so the swap stays atomic. Unticked items are **not deleted** — they stay on the old list as it moves to history.)*
6. Checked items stay on the archived list, which is kept read-only for history.

Implement steps 1 to 6 as a single Postgres function called via RPC, so a dropped connection cannot leave a kitchen with two active plans or none.

**Implemented in full as `complete_meal_plan()` in Phase 7.** Phase 6 built
steps 1 and 3, the only ones whose tables existed then. Two ordering rules hold
it together, both because a partial unique index is checked *per statement*
rather than deferred to commit: the old plan is marked complete before the new
one is inserted, and the old list is archived before the new one is created.
Reverse either pair and it throws every time.

Step 5 copies row by row rather than with one `insert ... select`, because each
new item's id is needed to copy its supermarket assignments and `returning`
cannot say which source row produced it. A household's list is tens of rows.

A kitchen may have no active list at all — nothing forces one to exist until
something is added — so steps 2 and 5 are conditional.

---

## 7. Screens

| Route | Purpose |
|---|---|
| `/login` | Supabase Auth, email and password. Signup captures a display name. Google OAuth deferred to the Polish future build. |
| `/kitchens` | List your kitchens, create one, join one by code. Shown after login if you have zero or many. |
| `/join/[code]` | Invite landing page. Redeems and redirects. |
| `/` | Dashboard: current plan summary, shopping list count, quick actions. |
| `/recipes` | Card grid. Search by name, filter by tag / meal type / rating / unreviewed, sort by name / average rating / recently added / least recently cooked. |
| `/recipes/new`, `/recipes/[id]`, `/recipes/[id]/edit` | Recipe detail with servings stepper, photo gallery, ingredient list, numbered method steps (title, optional photo, optional markdown description), tag pills, meal-type pill, rating control per member, "Add to plan" button, "Mark reviewed" button. |
| `/plan` | The active plan. Add recipes, adjust servings, reorder, mark cooked, **Add ingredients** per recipe, complete plan. |
| `/plan/history`, `/plan/[id]` | Past plans, read-only, with a "copy to current plan" action. |
| `/shopping` | Supermarket selector, item list, tick, add manual item, edit quantity, copy to clipboard, clear list. |
| `/settings/kitchen` | Members, invite codes, rename, supermarkets, tags, ingredients. |
| `/settings/profile` | Display name, avatar. |

### Plan screen detail

- Each planned recipe is a row with its cover thumbnail, name, meal-type pill, a servings stepper, and an **Add ingredients** button.
- Once some ingredients have been added, the button becomes secondary and gains a subtitle: "6 of 8 added".
- A **Add ingredients for all recipes** action at the top opens the same picker with every not-yet-added ingredient across the whole plan, grouped under recipe headings, all ticked by default.

### Shopping screen detail

- Top-level control is a horizontal row of supermarket chips plus an "All" chip. Selecting one filters to items assigned to that supermarket. Each chip carries its shop's colour (§5.5): full strength when selected, a light wash of the same hue when not. The label colour is computed from the shop's luminance, because the household picks these hex codes by hand and dark text on a dark chip is unreadable.
- Unchecked items first. Checked items collapse into a "Got it (N)" section at the bottom, struck through, showing who ticked them and when.
- Tap anywhere on the row to toggle. Large tap target, roughly 56px tall.
- Long-press or a trailing menu for edit quantity, change supermarkets, delete.
- **Copy to clipboard**: copies the currently visible unchecked items as **names only, one per line** — no quantities, no supermarket headings, duplicates removed. *(Amended 2026-09-22. It previously wrote `2kg potatoes` and grouped under supermarket headings to mirror the Google Keep note this replaced.)* The clipboard's job turned out to be pasting into an online shop's bulk-add box, where a quantity makes it search for a product called "2kg potatoes" and a heading makes it search for one called "Aldi". Select a shop's chip first and the copy is that shop's list. The on-screen list is what gets read in a physical shop, and it still shows quantities and groups.
- **The add box files the item under whichever chip is showing.** Typing "birthday candles" while looking at Aldi means you intend to buy it in Aldi; landing it under "Unassigned" would mean going and filing it by hand. Under "All" and "Unassigned" no shop is implied and none is set. The placeholder names the shop so this is visible before you type.
- **Enter adds the item and the cursor stays put**, so a run of items is one continuous piece of typing rather than reaching for the box again between each.
- **Clear list**: destructive, confirmation dialog, deletes every item on the active list.

### Ingredients screen detail

Added 2026-09-20, replacing the per-supermarket grouped lists.

- A **grid**: ingredients alphabetically down the y-axis, one row each however many shops sell them; supermarkets across the x-axis, in the household's own order.
- Each cell holds a **checkbox** for "sold here", saved on the tap — this is ingredient-level shared state, so it changes where that ingredient is bought for every recipe using it.
- Each supermarket column is **tinted with that shop's colour** (§5.5): 80% where the ingredient is assigned, 50% where it is not. A shop with no colour falls back to a neutral fill, so the column still reads.
- The tint is a second signal, never the only one. The tick is what states assignment, because two strengths of the same hue are not a distinction everyone can make.
- The **ingredient name column is sticky** and the grid scrolls horizontally inside its own container, so a kitchen with many shops does not make the page scroll sideways on a phone.
- Tapping a name opens a dialog for **rename, default unit and merge** — the three controls that used to sit on each row, which a grid has no width for.
- Free-text add box pinned at the bottom of the screen above the keyboard. Free-text items have no quantity or unit.

---

## 8. Phases

Each phase should end with the app running and deployable. Do not start a phase until the previous one has been reviewed.

### Phase 0 — Scaffold *(you are doing this)*

Next.js + TypeScript + Tailwind + shadcn, a Supabase project, `.env.example`, `output: "standalone"`.

---

### Phase 1 — Auth, kitchens, tenancy

**Scope:** `profiles`, `kitchens`, `kitchen_members`, `kitchen_invites`. The `is_kitchen_member` helper and RLS policies. Supabase auth with email and password only. Signup form captures a display name and passes it as user metadata. Email confirmation is disabled until real SMTP is configured. A trigger creating a `profiles` row on signup. Middleware-based session refresh and route protection. Kitchen switcher in the app shell, with the active kitchen stored in a cookie. Create kitchen, generate invite code, redeem invite, leave kitchen, view members.

**Acceptance:**
- A new user signs up with an email, password and display name, is prompted to create their first kitchen, and lands on an empty dashboard.
- Their `profiles` row carries the display name they typed, not their email prefix.
- A second user redeems an invite code and sees the same kitchen.
- With two kitchens, the switcher changes context and persists across a refresh.
- Querying another kitchen's ID directly returns zero rows, verified by a manual check against the API.

---

### Phase 2 — Recipes, tags, ratings

**Scope:** `recipes`, `tags`, `recipe_tags`, `ratings`. Full CRUD. Tag input with autocomplete over existing kitchen tags plus create-on-the-fly. Case-insensitive dedupe on tag names. Markdown method with a preview toggle. Meal-type pill. Per-member rating control with decimals, updating instantly. Recipe grid with search, filters and sorts. Soft delete via `archived_at`, with an archive view and restore.

**Acceptance:**
- A recipe can be created with a name only, everything else optional.
- Typing "Healthy" when "healthy" exists offers the existing tag rather than creating a duplicate.
- Both members can set a rating; both scores and the average are visible.
- The grid can be sorted by average rating descending and filtered to a tag.
- **This is the point at which the app replaces Notion for browsing. Start using it.**

---

### Phase 3 — Photos

**Scope:** `recipe_photos`. Private Supabase Storage bucket with a kitchen-scoped path policy. Upload with client-side resize before upload (max 1600px, JPEG). Multiple photos per recipe, reorderable, first is the cover. Signed URLs with a sensible cache. Cover image on recipe cards, gallery on the detail page.

**Acceptance:** upload from a phone camera roll works, the cover appears on the card, a signed URL cannot be guessed by a member of another kitchen.

**Decided during Phase 3:**

- **Signed URLs are memoised, not regenerated per render.** One hour expiry, batched with `createSignedUrls`, cached server-side for 50 minutes keyed on storage path. A signed URL carries a fresh token every time it is minted, so regenerating per render means a new URL, which means a guaranteed browser cache miss and a full re-download of every visible photo on every navigation. The 10 minute gap between cache TTL and expiry guarantees a URL handed out at the end of its cache window still has life left in it.
- **Bytes go browser → Storage directly**, never through a server action. See CLAUDE.md.
- **Reordering is buttons, not drag-and-drop** — move earlier / later plus an explicit "Make cover". Fewer dependencies and more reliable on a touch screen with two to five photos. Revisit if Phase 4 brings in a drag library for ingredients.
- **Resizing uses `browser-image-compression`** specifically because it honours EXIF orientation; a hand-rolled canvas resize discards it and turns portrait phone photos on their side. A file it cannot decode (typically HEIC) is rejected with a message rather than uploaded broken.

---

### Phase 4 — Ingredients, units, servings

**Scope:** `ingredients`, `ingredient_aliases`, `recipe_ingredients`. `src/lib/units.ts` and `src/lib/servings.ts` per §6.1 and §6.2. Ingredient editor on the recipe form: quantity, unit picker, ingredient combobox over existing kitchen ingredients with create-on-the-fly, note, drag to reorder. Servings stepper on the recipe detail page that rescales all quantities live. An ingredient management screen under settings for renaming and merging duplicates.

**Tests required:** `units.ts` and `servings.ts`. Cover: conversion to base on input for every input unit, display formatting either side of the 1000 threshold, plural handling, `piece` omission, null quantities, count rounding in both the recipe view and the shopping context.

**Acceptance:**
- Entering `1kg` stores `1000` and `g`, and displays as `1kg`.
- Entering `2 tbsp` stores `30` and `ml`, and displays as `2 tbsp` if `display_unit` is kept, or `30ml` if not.
- A recipe for 2 servings showing `200g chicken` shows `300g chicken` at 3 servings.
- `1 clove garlic` at 4 servings from a base of 2 shows `2 cloves garlic`.
- Renaming an ingredient updates it everywhere it is used.

---

### Phase 5 — Supermarkets

**Scope:** `supermarkets`, `ingredient_supermarkets`. Manage supermarkets in settings with reordering. Assign one or more supermarkets to an ingredient, both from the ingredient manager and inline while editing a recipe. A default-supermarket prompt when a new ingredient is created.

**Acceptance:** an ingredient can be assigned to two supermarkets and appears under both; a new ingredient with no assignment is still usable and lands in the "Unassigned" group.

**Decided during Phase 5:**

- **"Unassigned" is observable in the ingredient manager.** The spec's wording describes the shopping list, which is Phase 7 — without somewhere to appear now, neither acceptance criterion could be checked for two more phases. Originally one list per shop plus an "Unassigned" group at the end; **replaced on 2026-09-20 by the assignment grid** (§7), where an ingredient assigned to two shops is ticked in both columns and one assigned nowhere has an empty row. Both criteria are still observable, and an ingredient now appears exactly once however many shops sell it.
- **A supermarket can be deleted**, behind a confirmation naming how many ingredients lose the assignment. The cascade takes only the join rows; no ingredient is harmed. This is unlike ingredients, which cannot be deleted at all while a recipe uses them.
- **Assignment is ingredient-level shared state**, edited from three places and saved immediately in all of them. Changing it inside one recipe changes it for every recipe using that ingredient, so the control says so.

---

### Phase 6 — Meal plans

**Scope:** `meal_plans`, `meal_plan_recipes`. Active plan screen. Add recipes from a searchable picker or from a recipe's detail page. Per-recipe servings stepper. Reorder. Mark individual recipes cooked. Complete plan, which creates the next one. Plan history with read-only detail and "copy to current plan".

**Note:** a plan is a period of arbitrary length. The UI should show "Started 4 days ago" rather than "Week of 12 Jan", and completion is the only thing that ends it.

**Acceptance:**
- Adding six recipes at varying servings and completing the plan produces a new empty active plan and a read-only archived one.
- There is never more than one active plan, enforced by the partial unique index.

**Decided during Phase 6:**

- **§6.4 spans two phases.** Four of its six steps touch `shopping_lists`, which
  is Phase 7, so `complete_meal_plan()` today does steps 1 and 3 — the whole of
  the plan half — and grows to cover the rest in Phase 7. It is an RPC from the
  start, as §6.4 asks, because a dropped connection between the update and the
  insert is exactly what would leave a kitchen with no active plan.
- **The completion RPC is `security invoker`**, like `merge_ingredients`. RLS
  still applies to every statement inside it, so it cannot be used to reach
  another kitchen's plan, and there is no policy-recursion reason to escalate.
- **A kitchen starts its first plan with a button.** Completing a plan creates
  the next one, so this only ever happens once; it is not created on first visit
  because a Server Component cannot write during render.
- **A recipe may appear on a plan twice.** No unique constraint. The Add button
  shows an "on the plan" state so the second add is deliberate rather than
  accidental.
- **Servings persist here, unlike the recipe page's stepper**, which is display
  only (§6.2). The write is debounced so holding `+` is one round trip.
- **Removing a recipe from a plan is a plain delete with no undo** until Phase 7.
  §9 decision 8 asks for a toast and an undo, but the thing it needs to explain —
  ingredients left behind on the shopping list — does not exist yet.
- **"Copy to current plan" copies recipes and servings, resets `cooked_at`, and
  does not deduplicate** against what is already on the target plan.
- **Navigation was added to the app shell.** §7 lists `/plan` in the routes table
  but the shell had no nav; with more than one destination the dashboard cards
  stopped being enough.

---

### Phase 7 — Shopping list

**Scope:** `shopping_lists`, `shopping_list_items`, `shopping_list_item_supermarkets`, `meal_plan_recipe_added_ingredients`. `src/lib/shopping-merge.ts` per §6.3. The ingredient picker sheet, per-recipe and plan-wide. The carry-over RPC per §6.4. The shopping screen per §7. Manual free-text items, quantity editing, copy to clipboard, clear list.

**Tests required:** `shopping-merge.ts`. Cover: merging into an existing unchecked item of the same unit, refusing to merge into a checked item, refusing to merge different units of the same ingredient, count round-up on add, null quantity handling, and supermarket assignment copying.

**Acceptance:**
- A recipe with 2 onions and another with 3 onions, both added, produce a single line reading `5 onions`.
- Unticking two ingredients in the picker means they never appear on the list.
- Reopening the picker for the same recipe shows the previously added ingredients greyed out and unticked.
- Ticking an item on the list removes it from every supermarket view at once.
- Completing a plan carries three unticked items onto the new list and discards the ticked ones.
- **This is the point at which the app replaces Google Keep, apart from live sync. Start using it.**

**Decided during Phase 7:**

- **The two count roundings do not compose**, and composing them under-buys. A
  separate `scaleQuantityForShopping` scales raw and rounds up once. See §6.2 —
  this was a live bug the moment any scaled count reached the list.
- **`shopping-merge.ts` decides, the server action executes.** See §6.3.
- **`merge_ingredients()` had to be extended**, or merging an ingredient that sat
  on a shopping list would abort: deleting the source fires
  `on delete set null (ingredient_id)`, and a row with no ingredient and no
  manual name violates §5.7's own check constraint. It now repoints
  `shopping_list_items` and `meal_plan_recipe_added_ingredients` first, exactly
  as it already repointed `recipe_ingredients`. Two list lines that become the
  same ingredient are deliberately **not** summed into one: that would be
  quantity arithmetic in SQL, and §6.3's merge rule governs adding to the list
  rather than renaming what is on it.
- **Ticking is optimistic but not live.** `useOptimistic` makes a tap land
  instantly on a patchy connection; Realtime and the offline queue are Phase 8,
  so the other person's ticks appear on the next refresh. TanStack Query is
  deliberately deferred to Phase 8, where there is a cache for Realtime to
  update.
- **The trailing menu is the only per-item control.** §7 offers a long-press as
  an alternative; it fights the scroll gesture on a list being thumbed through,
  and nothing advertises it.
- **Free-text items never merge into anything.** §6.3 keys the match on
  `ingredient_id`, and two lines both reading "birthday candles" are not
  obviously the same thing.
- **The plan-wide picker excludes already-added ingredients; the per-recipe one
  greys them.** That is §7 and §6.3 respectively, and the difference is kept:
  plan-wide is a bulk action where rows you cannot act on are noise.
- **A shopping list needs no "start" step.** Unlike a plan, the first list is
  created silently on the first add, so the empty screen is still usable.
- **Empty supermarket groups are hidden** on the shopping screen, unlike the
  ingredient manager where an empty shop is a prompt to fill it.

---

### Phase 8 — Realtime and offline

**Scope:** Supabase Realtime subscription on `shopping_list_items` for the active list, with TanStack Query cache updates. Optimistic local toggles. Dexie-backed mutation queue that survives a page reload. Replay on reconnect, last-write-wins by `updated_at`. A clear connection indicator: online, offline with N pending, syncing. PWA via Serwist, installable, with the shopping route and the active list cached.

**Acceptance:**
- Two phones on the same list see a tick appear within a second or so.
- Airplane mode: ticking five items, killing the app, reopening, and reconnecting results in all five ticks landing on the server.
- The app can be installed to the home screen and opened cold with the list visible while offline.
- **The app is now fully replacing both tools.**

**Decided during Phase 8:**

- **Ticking goes browser → Supabase directly, not through a server action.** A
  server action is a request to the Next server, so it cannot work with no
  connection, and a queued one cannot be replayed after a deploy because its
  action id changes. RLS is the security boundary, exactly as it is for photo
  uploads (§8 Phase 3). This is the **only** mutation with that shape: adding
  items, editing quantities, the picker and everything on the plan still go
  through server actions and still need a connection, per §10.
- **Conflict resolution is compare-and-swap, not clock comparison.** §8 asks for
  "last-write-wins by `updated_at`", but `updated_at` is set by a database
  trigger and the queue only knows when the *tap* happened — two different
  clocks. A queued tick instead records the `updated_at` it saw, and replays only
  if the server still holds that value. Clock skew therefore cannot affect the
  outcome, and the later real write still wins.
- **`shopping_list_items` had to be added to the `supabase_realtime`
  publication.** The publication existed but contained no tables, so Postgres
  Changes emitted nothing at all.
- **`replica identity` is `full` on `shopping_list_items`.** *(Corrected
  2026-09-22. It was left at the default on the reasoning that only the new row
  is read and that with RLS on, `old` carries just primary keys anyway.)* That
  missed what a **filtered** subscription needs. The screen subscribes with
  `filter: shopping_list_id=eq.<id>`, and under the default identity a DELETE
  writes only the primary key, so its payload has no `shopping_list_id` and the
  filter can never match it — deletes reached nobody. Ticks and quantity edits
  were fine throughout, because an UPDATE carries the whole new row, which is
  why the symptom looked like "only deleting needs a refresh". The cost of
  `full` is the old row in the WAL on every update, which is nothing on a
  household list of tens of narrow rows.
- **Realtime invalidates the cache rather than patching it.** A Postgres Changes
  payload is the raw row with none of its embedded relations, so a tick would
  arrive without the ingredient's name or the ticker's display name. Refetching a
  household-sized list is one small round trip and is always right.
- **A channel reports `SUBSCRIBED` before its replication binding is live.** A
  write in that window is never sent to that subscriber — not delayed, never
  generated. It cost an hour of false failures in the verification, and it means
  the first moment after a page loads can miss an event; the stale-time refetch
  is the safety net.
- **The service worker caches pages network-first and clears on sign-out.** These
  pages are server-rendered and personal, so a cached copy is somebody's shopping
  list; it is a fallback only, and `clearOfflineData()` wipes both the caches and
  the Dexie queue when the session ends.
- **`/sw.js` and `/manifest.webmanifest` are excluded from the auth proxy**, and
  `/offline` is a public route. A service worker served as a redirect to `/login`
  fails registration silently.
- **The connection indicator lives only on `/shopping`.** It is the only screen
  that works offline; anywhere else it would be promising something untrue.

---

**Phase 8 is the last scheduled phase.** From here the app is in everyday use,
and the builds below are ideas kept on file rather than a plan. None is started
without an explicit request, and each still gets the usual scope-and-questions
pass first. Decided on 2026-09-13.

---

### Added after Phase 8 — Import a recipe from a file *(2026-09-20)*

**Scope:** A drop zone on `/recipes/new`. A markdown or text file — in practice a
recipe exported from Notion — is read by the Anthropic API into the shape
`RecipeFormInput` already has, and fills the normal recipe form. Nothing is
written until the user saves.

Built because entering the Notion recipes by hand (the reason the Notion import
in §8 was scrapped) is the thing that stalls, and a draft to correct is a
different job from typing one from scratch.

**How it divides the work.** `src/lib/import-parse.ts` is pure and tested and
owns everything mechanical: fractions (`½`, `1 1/2`, `~1/4`), unit synonyms
(`tablespoons` → `tbsp`, `tin` → `can`), markdown links, and telling a bracket
that restates a quantity (`225 g (1/2 lb)`) from one that says something else
(`(optional)`, `(dried)`). The model gets only the ambiguous half: where an
ingredient's name ends and its preparation begins, and what to call a step in a
file that numbers them `## 1`. Its answer is normalised back through the same
module, so a unit it invented cannot reach `toBase()`.

**Checked twice**, because a single pass drops an ingredient now and then and
nothing downstream can tell. The second call gets the file and the first answer
and is asked only what is missing — a question with a checkable answer. A
mechanical sweep for file lines nothing in the draft accounts for runs
afterwards and is shown to the user, because a model asked whether it missed
anything is not a disinterested witness.

**Ingredients are matched, never assumed.** Exact names and recorded aliases are
taken as certain; anything close is offered as a suggestion the user confirms.
Confirming records the file's wording in `ingredient_aliases` — created in Phase
4 and unused until now — so the next file saying "red lentils (dried)" matches
silently.

**Defaults:** 4 servings when the file does not say (the manual editor starts at
2); meal type inferred; `Eating this week`, `<year> Reviewed`, `Rating (out of
10)` and `Added to Recipe-db` dropped; every URL discarded except `Link:`, which
becomes `source_url`.

**Deviations from the URL importer described below:** a server action rather than
a route handler (the file is a few KB of text the browser has already read, so
the 1MB body limit is irrelevant and it inherits the session), and a file rather
than a URL. The two share `importedRecipeSchema` and the prompt rules, so the URL
importer becomes a second entry point rather than a second implementation.

**Acceptance:** both sample exports import with every ingredient, quantity and
step present after review; a file with no tags, link or servings imports rather
than failing; nothing is written if the user discards the draft.

---

## Future builds (unscheduled)

Each keeps its former phase number in brackets, so older references in code
comments and migrations ("until Phase 12", "the Phase 10 importer") still lead
somewhere. They are listed in no particular order.

### Scrapped: Notion import (formerly Phase 11)

**Scrapped on 2026-09-13.** The Notion recipes are being entered by hand
instead, deliberately: re-entering each one is the chance to clean it up, which a
bulk import would have carried across untouched. The original scope was a
one-off local Node script importing names, links, tags, ratings and reviewed
status from a Notion CSV export, optionally seeded through the AI importer.
Nothing was built.

---

### Future build: Review mode and suggestions (formerly Phase 9)

**Scope:** `last_reviewed_at`. A dedicated review flow: a queue of recipes not reviewed since a chosen date, defaulting to 1 January of the current year, presented one at a time with adjust rating, edit tags, archive, and mark reviewed. Progress indicator. A "not cooked in a while" list derived from `meal_plan_recipes.cooked_at` across historical plans. A random picker with filters for meal type, tag and minimum rating.

**Acceptance:** the review queue shrinks as you go, archiving from within it works, and reviewing every recipe empties the queue.

---

### Future build: AI import from URL (formerly Phase 10)

**Partly built.** The file importer above (added 2026-09-20) already does the
extraction, the validation, the ingredient matching and the review step. What is
left of this is the front half only: fetching a URL server-side, preferring the
page's JSON-LD `Recipe` when it has one, and reducing the page to readable text
to feed the existing prompt.

**Original scope:** A route handler taking a URL, fetching the page server-side, extracting the readable content, and calling the Anthropic API to return structured JSON: name, source URL, servings, meal type, suggested tags, method steps as an array of `{title, description}` (not a single method string — see `recipe_steps` in §5.4), and an ingredient array of `{quantity, unit, name, note}`. Quantities are converted to base units by the same `toBase` used everywhere else, so the model's output goes through one validated path. A review-and-confirm screen: nothing is written until the user accepts. Ingredient names are matched against existing kitchen ingredients and aliases, with unmatched ones flagged for create-or-link. Prefer JSON-LD `Recipe` schema when the page provides it, falling back to the model on raw text.

**Acceptance:** three real recipe URLs from different sites import with correct ingredients and quantities after review; a URL that is not a recipe fails gracefully.

---

### Future build: Polish (formerly Phase 12)

Google OAuth as a second sign-in method, plus real SMTP so email confirmation and password reset can be turned on. Plan templates: save a completed plan as a reusable template, per your idea about predefined weeks. Ingredient categories and aisle-order sorting within a supermarket. A staples list for one-tap common items. Stats: most cooked, highest rated, never cooked. Live presence on the shopping screen. Empty states, loading skeletons, keyboard shortcuts.

---

## 9. Open decisions

Confirm or override before Phase 1 starts.

1. ~~**"Kitchen"** as the name for a shared workspace.~~ **Confirmed before Phase 1.**
2. ~~**Invite by shareable code**, valid 7 days.~~ **Confirmed before Phase 1.** Implemented as 8 characters of Crockford base32 (no I, L, O or U), matched case-insensitively, reusable until it expires or is revoked, with only the newest live code shown per kitchen.
3. **`display_unit` is kept**, so a recipe entered as `2 tbsp` still reads as `2 tbsp` rather than `30ml`. Dropping the column is one line of migration and slightly less code, at the cost of tablespoon recipes reading in millilitres.
4. ~~**Method is a single markdown field**, not a structured list of steps.~~ **Reversed on 2026-09-12.** The method is now ordered steps, each with a required title, an optional photo and an optional markdown description, stored in `recipe_steps` (§5.4). The fiddlier editor was accepted: a step list reads better while cooking and is what a step-by-step cook mode would need. Steps save with the recipe form; step photos upload immediately, like the gallery. Existing methods were migrated into a single step each, and `recipes.method` is retained unread as the undo.
5. **Photos: many per recipe**, first is the cover.
6. **Ratings are visible to all kitchen members**, and the grid sorts by the average.
7. **"Reviewed" is an explicit button** setting `last_reviewed_at`, with the review filter defaulting to "not reviewed since 1 January this year".
8. **Removing a recipe from the plan leaves its ingredients on the shopping list**, with a toast explaining that.
9. ~~**Phase order.** Phase 10 could be pulled forward to right after Phase 5 if backfilling ingredients manually turns out to be the thing that stalls adoption.~~ **Resolved on 2026-09-13.** Phases 0–8 were built in order. Phase 11 (Notion import) was scrapped in favour of entering recipes by hand to clean them up, and Phases 9, 10 and 12 became unscheduled future builds (§8). If manual entry turns out to stall, the AI import future build is the fallback.

**Resolved in 0.2:** quantities are stored in base units with all conversion client-side; the shopping list is populated by an explicit button and checkbox picker.

**Raised and resolved in Phase 2:**

11. **Any kitchen member can edit any member's rating.** `ratings` uses the uniform
    "members full access" policy from §5.8 rather than splitting read from write. The
    alternative — read for all members, write only where `user_id = auth.uid()` — was
    proposed and **deliberately rejected** in favour of keeping one policy shape across
    every table. With two people who trust each other the realistic risk is a mis-tap,
    not malice, and the UI attributes every score by name so an accidental edit is
    visible. This is a decision, not an oversight: do not "fix" it without asking.
    Worth revisiting if a kitchen ever has more than two members.

**Raised and resolved in Phase 1:**

10. ~~**`created_by` blocks account deletion.**~~ **Resolved.** §5.2 originally gave
    `kitchens.created_by` and `kitchen_invites.created_by` as `not null references
    profiles(id)` with no delete rule, which defaults to `no action`. Because `profiles`
    cascades from `auth.users`, any user who had ever created a kitchen or an invite
    became permanently undeletable: the cascade reached the foreign key and the whole
    delete failed. Both columns are now nullable with `on delete set null`. `created_by`
    is provenance only — nothing reads it and no policy depends on it — and a kitchen
    belongs to all its members equally (§2), so it should outlive whoever created it.
    `cascade` was rejected because it would destroy a shared kitchen when one person
    closed their account. Verified end to end: deleting the creator now succeeds and
    leaves the kitchen intact with `created_by` null.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Entering the Notion library by hand is tedious and stalls adoption. | Chosen deliberately, as a clean-up pass (§8, scrapped Notion import). Recipes are useful with just a name, so the library can fill gradually; the AI import future build is the fallback if it stalls. |
| Base-unit storage makes recipes read oddly (`30ml` instead of `2 tbsp`). | `display_unit`, decision 3 above. |
| Adding ingredients twice silently doubles a quantity. | Already-added ingredients default to unticked and grey in the picker, and the plan row shows an added count. |
| Offline sync is the classic source of subtle bugs. | Keep the offline surface to one table and one operation, toggling checked. Everything else requires a connection. |
| RLS recursion or gaps as tables multiply. | One helper function, one policy shape, `kitchen_id` on every table, and a manual cross-kitchen check at the end of each phase. |
| Scope creep from the deliberately flexible non-goals list. | Anything in §2 requires an explicit decision to move it into a future build. |
