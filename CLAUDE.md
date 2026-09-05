# CLAUDE.md

Working notes for Claude Code. Read this before touching anything.

`SPEC.md` in this directory is the source of truth for **what** we are building and in what order. This file is the source of truth for **how**. When they disagree, ask rather than guessing.

---

## The app in one paragraph

A shared recipe library, meal planner and real-time shopping list for a household, replacing a Notion database and a Google Keep note. Recipes have structured ingredients, photos, tags and a rating per person. Recipes go onto a meal plan with a chosen number of servings. Their ingredients are pushed onto a shopping list by an explicit button, grouped by supermarket, and both people tick items off in real time while shopping.

---

## Stack

- Next.js, App Router, TypeScript strict
- Tailwind + shadcn/ui
- Supabase for database, auth, storage and realtime
- `@supabase/supabase-js` and `@supabase/ssr`, no ORM
- `react-hook-form` + `zod`
- TanStack Query on the client where optimistic updates are needed
- Vitest, minimal

---

## Rules

### Architecture

- **Server Components by default.** Add `"use client"` only when the component needs state, effects or event handlers. Push it as far down the tree as possible.
- **Mutations go through server actions** in `src/server/actions/`, one file per feature. Route handlers only for webhooks and streaming.
- **Exception: file uploads.** Image bytes go from the browser straight to Supabase Storage, never through a server action. A server action caps its request body at 1MB by default, and routing a file through the Next server doubles the bandwidth for no benefit. The server action records only the metadata row, and the RLS policy on `storage.objects` is the security boundary for the upload itself. Established in Phase 3; see "Gotchas".
- **Every server action validates its input with a zod schema first.** Schemas live in `src/schemas/` and are shared with the client form.
- **Never use the service role key to work around RLS.** If a query cannot be expressed under RLS, the answer is a `security definer` Postgres function with a narrow signature, not a privileged client. The service role key must not appear in application code at all.

### Multi-tenancy

This is the rule that breaks everything if it slips.

- **Every kitchen-scoped table has a `kitchen_id` column**, including child tables like `recipe_ingredients` and `recipe_tags`. This is deliberate denormalisation so every RLS policy is a single indexed check.
- **Every table has an index on `kitchen_id`.**
- **Every insert sets `kitchen_id` explicitly.** Never rely on it being inferable from a parent row.
- **Every query filters by the active kitchen**, even where RLS would already do it. RLS is the safety net, not the filter.
- The active kitchen id is read from a cookie by a helper in `src/lib/kitchen.ts`. Never take a kitchen id from a form field or URL parameter without checking membership.

### Units and quantities

- **The database stores base units only**: grams for weight, millilitres for volume, the count unit itself for countable things. `1kg` is stored as `1000` / `g`.
- **No conversion, rounding or formatting in SQL, ever.** All of it lives in `src/lib/units.ts` and runs on the client.
- Two quantities merge if and only if their `unit` strings are identical. Use `canMerge()` rather than writing `===` inline, so the intent is visible.
- See SPEC.md §5.3 and §6.1 before changing anything in this area.

### Database workflow

- Schema changes are **numbered SQL migration files** in `supabase/migrations/`, named `YYYYMMDDHHMMSS_name.sql`. Never change an applied migration, always add a new one.
- **The CLI is not linked.** Migrations are applied through the Supabase MCP `apply_migration`, named identically to the file so the remote history and the files stay legible side by side. The file on disk is the durable record. If the CLI is ever linked (`supabase login` then `supabase link`), run `npx supabase migration list` to check for drift before any `db push`.
- There is no local Supabase instance. The remote project is the only one.
- **Never run a destructive command against the remote project.** No `supabase db reset`, no `drop table`, no `truncate`, no `delete` without a `where`. If a migration conflicts or has to be undone, write a new migration that reverses it and say what you are doing first.
- After any schema change, regenerate types with the MCP `generate_typescript_types` and write the result to `src/lib/database.types.ts`. (`npx supabase gen types --linked` will not work while the CLI is unlinked.)
- **`src/lib/database.types.ts` is generated. Never hand-edit it.**
- Enable RLS on every new table in the same migration that creates it. A table without RLS is a bug.

### Deployment

Self-hosted on Coolify.

- `next.config.ts` sets `output: "standalone"`.
- **No Vercel-specific packages or APIs.** No `@vercel/*`, no edge runtime assumptions.
- All configuration via environment variables, every one documented in `.env.example`.

### Code style

- Simple and readable beats clever and short. This codebase is read by humans who are not full-time developers.
- Reach for a well-known library rather than writing it from scratch.
- **No abstraction until the pattern appears three times.** Duplication is cheaper than the wrong abstraction here.
- Every exported function gets a JSDoc block saying what it does and why it exists.
- Business rules get an inline comment citing the spec section, e.g. `// Checked items are never merged into, see SPEC.md §6.3`.
- Prefer explicit names over short ones. `scaledQuantityInBaseUnits` beats `q`.

### Testing

Deliberately minimal. Only these three modules are tested, and they are pure functions with no database access:

- `src/lib/units.ts`
- `src/lib/servings.ts`
- `src/lib/shopping-merge.ts`

Do not add tests elsewhere without being asked. Do not add a test framework beyond Vitest.

---

## Working process

We build in the phases set out in SPEC.md §8. Each phase ends with a working, deployable app.

- **Work on one phase at a time.** Do not start the next phase without being asked.
- **Do not build things from later phases** because they seem convenient now. If a later phase would be easier with a change now, say so and wait.
- At the start of a phase, restate the scope and the acceptance criteria from the spec, and flag anything ambiguous **before** writing code.
- At the end of a phase, list what was built, what was skipped, and anything discovered that should change the spec.

### Definition of done for a phase

1. Every acceptance criterion in the spec for that phase is met.
2. `npm run build` passes with no type errors.
3. RLS is enabled on every new table, and a manual check confirms another kitchen's data returns zero rows.
4. Types have been regenerated.
5. Any new environment variable is in `.env.example`.

---

## Gotchas already known

- **Creating a kitchen and joining one both go through `security definer` RPCs** (`create_kitchen`, `redeem_invite`). They exist because the RLS policy on `kitchen_members` would otherwise prevent the first member being added and prevent a non-member reading an invite code. Do not replace them with direct inserts.
- **`is_kitchen_member()` is `security definer`** so that policies on `kitchen_members` do not recurse. Every kitchen-scoped policy should call it rather than writing its own subquery.
- **Checked shopping list items are never merged into.** If you have already bought the onions and another recipe needs onions, that is a new line. See SPEC.md §6.3.
- **Counts round up on the shopping list** and to the nearest half in the recipe view. You cannot buy 1.5 onions.
- **Auth is email and password only for now.** Google OAuth is deferred to Phase 12. Do not add OAuth providers, social buttons or provider-specific branching.
- **The signup form must pass a display name** as `options.data.display_name`. Email signup supplies no metadata otherwise, and the profile trigger would fall back to the email local part.
- **Email confirmation is disabled** in the Supabase dashboard, because the built-in sender is rate limited and there is no SMTP configured yet. Do not build a "check your inbox" screen or a password reset flow until Phase 12. Invites are shareable codes, not emails, so nothing else in the app needs to send mail. (Verified in Phase 1: signup returns a live session immediately.)
- **`created_by` is nullable everywhere, with `on delete set null`.** It records who made a kitchen or an invite and nothing else: no query reads it and no policy depends on it. It is deliberately not `not null`, because `profiles` cascades from `auth.users` and a `no action` foreign key made anyone who had created a kitchen permanently undeletable. Do not "tidy this up" by restoring `not null`, and do not use `cascade` — that would destroy a shared kitchen when one member closed their account. Apply the same shape to any future `created_by`. See SPEC.md §9 decision 10.
- **The last-member guard on leaving a kitchen is enforced in the server action, not the database.** A direct API call can still orphan a kitchen. It is a UX guard, not a security boundary.
- **Any kitchen member can edit any member's rating.** `ratings` deliberately uses the uniform "members full access" policy rather than restricting writes to `user_id = auth.uid()`. This was proposed and consciously rejected in Phase 2 to keep one policy shape across every table; with two trusting people the realistic risk is a mis-tap, not malice. The server action always writes the caller's own row, and the UI attributes each score by name so an accidental edit is visible. Do not "fix" this without asking. See SPEC.md §9 decision 11.
- **"Not rated" is a real state, distinct from a score of 0.** No `ratings` row means nobody has judged the recipe; the average ignores it rather than counting zero, and clearing a rating deletes the row. Never default a rating to 0 to avoid an empty state.
- **Leaked password protection is permanently off**, because it is a Supabase Pro-plan feature and this project is not on Pro. `get_advisors` flags it on every run: that warning is expected noise, not an action item. Do not raise it again.
- **Markdown is rendered with `rehype-raw` deliberately absent**, so raw HTML in a recipe method is inert. That is the whole XSS defence for member-authored content, and it matters more from Phase 10 when the AI importer writes methods from arbitrary web pages. Do not add raw-HTML support.
- **shadcn's `form` component exists in the `radix-nova` registry but ships zero files**, so `npx shadcn add form` silently does nothing. Forms use `react-hook-form` directly with `Label`/`Input` and an error paragraph. This is the established pattern, not an omission.
- **A photo's storage path is a security boundary, not a naming convention.** Objects are keyed `{kitchen_id}/{recipe_id}/{uuid}.jpg`, and the RLS policies on `storage.objects` authorise purely on `storage.foldername(name)[1]` — the kitchen id. Change the path shape and you silently break the isolation between kitchens. Build paths with `photoStoragePath()` in `src/lib/photos.ts`, never by hand.
- **The `::uuid` cast in the storage policies would throw on a malformed path**, so the insert policy is what keeps the read policy safe: it is the only thing stopping an object whose first path segment is not a uuid from ever existing. Verified in Phase 3 — a malformed upload is rejected before any row is written. Do not weaken the insert policy on the assumption it is merely tidiness.
- **`src/lib/photos.ts` is client-safe; `src/lib/photo-urls.ts` is server-only.** The split exists because importing the signing helper from a Client Component drags `next/headers` into the browser bundle and fails the build. Constants and the path helper live in the former, `signedUrlsFor()` in the latter.
- **Never call `cookies()` inside `unstable_cache()`.** Creating a Supabase client reads cookies, so the client must be built *outside* the cached function and closed over — `signedUrlsFor()` in `src/lib/photo-urls.ts` shows the shape. Getting this wrong throws at **render** time, not build time, and only on a page that actually has data to cache, so it passes every build and then fails in front of the user.
- **A Server Component may render a component from a `"use client"` module, but must never call a plain function exported from one.** It fails at render time with "Attempted to call X from the server but X is on the client" — invisible to `npm run build` and to `tsc`. Pure helpers shared across the boundary belong in `src/lib/` (see `src/lib/ratings.ts`), never beside the client component that happens to use them.
- **The build does not prove the app renders.** `npm run build`, `tsc` and `eslint` all pass on code that throws the moment a Server Component actually runs — both bugs above shipped through green builds. Anything touching Server Component data loading needs the page fetched with a real session before it counts as verified.
- **Storage objects do not cascade.** `recipe_photos` cascades from `recipes`, but Postgres cannot reach into Storage, so hard-deleting a recipe or a kitchen would strand its files. Latent today because archiving is the only removal — but anything that introduces a hard delete must remove the objects first.
- **`next/image` is off for recipe photos**, disabled for `src/components/recipes/**` in `eslint.config.mjs` with the reasoning. Signed URLs rotate their token, so the optimiser would re-fetch and re-encode the same photo on every new signature; the files are already resized to 1600px JPEG client-side.
- **Migrations can create policies on `storage.objects`.** `postgres` is not a member of the owning `supabase_storage_admin` role, which suggests `create policy` should fail — but Supabase grants it specifically, and it works. Verified in Phase 3. No dashboard step is needed for storage policies.

---

## Open questions

Listed in SPEC.md §9. If you hit one while working, stop and ask rather than picking a side.
