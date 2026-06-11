# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

**Shojin (精進)** is a personal, mobile-first workout tracker. It was rebranded IronLog → REPPA → Shojin; the local folder, GitHub repo (`t-reyn/shojin`), and Vercel project (`shojin-app`) are all `shojin` now, but a few internal identifiers still read `ironlog` on purpose (see "Naming legacy" below). **Trust the code over any older prose.**

## Critical — Next.js 16 + React 19 + Tailwind v4

APIs differ from older versions — check `node_modules/next/dist/docs/` before writing framework code. Two React 19 lint rules are active and strict (eslint will fail the build/CI):

- `react-hooks/set-state-in-effect` — calling `setState` synchronously in a `useEffect` body is an error. Set state inside an async callback / event handler / `setTimeout`, or use a lazy `useState` initialiser. (`InstallPrompt.tsx` sets visibility inside a timeout/event handler for this reason.)
- `react-hooks/purity` — impure calls in render (`Date.now()`, `new Date()`, `Math.random()`) are an error. Use `useState(() => …)` or compute inside a `useMemo`. (`Dashboard` builds all date/greeting/streak values in one `useMemo`.)
- `react-hooks/immutability` — don't reassign a captured variable after render (e.g. `total += …` inside `.map`). Use `reduce` (see `History.tsx`).

## Commands

```bash
npm run dev -- --port 3200   # dev server — port 3200 is the convention (preview tooling + launch.json)
npm run build                 # production build + type check (also runs in CI/Vercel)
npm run lint                  # eslint (flat config: eslint.config.mjs)
```

No test suite — verify changes against the running dev server on port 3200.

## Deploy

Auto-deploys to Vercel on every push to `master` (repo `t-reyn/shojin`, project `shojin-app`). Production: `https://shojin-app.vercel.app`. Branch pushes get preview URLs **but** `NEXT_PUBLIC_SUPABASE_*` env vars are set for the Production environment only — preview deployments without them render `SetupNotice` ("needs Supabase"). Add the vars per-branch or at all-Preview scope to test a PR.

Supabase schema/auth changes are applied via the Management API (project ref `drcxxxunbrqlbqwcolay`) using `SUPABASE_ACCESS_TOKEN` in `.env.local` (never committed):

```bash
curl -X POST "https://api.supabase.com/v1/projects/drcxxxunbrqlbqwcolay/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"SELECT ..."}'
```

## Architecture

### Data flow

All server data lives in a single **Zustand store** (`lib/store.ts`, plain `create` — no persist/immer). On mount `AppShell` calls `hydrate()`, which fetches profile, exercises, workouts, templates, and bodyweight in parallel. Components read store selectors; mutations call `lib/db.ts` (typed Supabase helpers) then `refreshX()` the relevant slice.

```
Supabase (Postgres + Auth)
  ↕ lib/db.ts        typed async query helpers
  ↕ lib/store.ts     Zustand — single source of truth
  ↕ components/*     read selectors, call actions
```

The active **workout draft** (`store.draft`) and the **rest timer** (`store.rest`) live in the store so they survive tab switches.

### Auth gate

`app/page.tsx` (server) → `AppGate` (client) checks the `hasSupabase` flag → renders `SetupNotice`, `Login`, or `AppShell`. Auth is **email + password** (`supabase.auth.signInWithPassword` / `signUp`). `hasSupabase` is false when `NEXT_PUBLIC_SUPABASE_URL` is absent or contains `"YOUR-PROJECT"`, so the app builds/prerenders without env vars.

### Navigation & overlays

`AppShell` owns four tabs — **Home / History / Progress / Profile** — rendered by `Dashboard.tsx` / `History.tsx` / `Progress.tsx` / `Tools.tsx` respectively (the component names predate the tab rename). The bottom bar (`TabBar.tsx`) splits the four tabs around a **center amber `+` FAB** that starts a new workout, or continues the in-progress `draft` (opens the logger directly). Tab icons are **outline when inactive, solid when active** via `TabDef.iconActive` (the four icon SVGs are defined inline in `AppShell.tsx`).

Overlays are sibling `fixed` elements with a strict **z-index ladder** (keep distinct): bottom nav / `InstallPrompt` `z-30` → `StartModal` / `TemplateBuilder` / `TemplateEditor` `z-40` → `WorkoutLogger` `z-50` → `ExercisePicker` `z-[55]` → `RestTimer` `z-[60]` → `UpdateBanner` `z-[65]` → `Toaster` `z-[70]` → `DialogHost` `z-[80]`. `RestTimer` is mounted once in `AppShell` (not inside the logger) with a `bottomOffset` that shrinks when the logger is open.

### Workout logging & the draft model

`WorkoutLogger` (full-screen `z-50`) edits `store.draft`. Shapes:

```ts
DraftSetEntry  { weight; reps; done; isWarmup; rpe: number | null }
DraftExercise  { exerciseId; unit; notes: string; sets: DraftSetEntry[] }
Draft          { name; startedAt; exercises; workoutId? }  // workoutId set only when editing a saved workout
```

- **RPE** (0–10, `SetRow.tsx` dropdown) persists to `workout_sets.rpe`.
- **Per-exercise notes** persist by **denormalising** the note onto every saved set of that exercise (`workout_sets.notes`); on edit/repeat the note is read back from the first set of the group. There is no `workout_exercises` table — sets grouped by `exercise_id` *are* the exercise.
- `finishWorkout()` flattens only `done` sets → `workout_sets`. New (non-edit) drafts are persisted to `localStorage["ironlog-draft"]`; edit drafts (`workoutId` present) are never persisted.

### Theming (light + dark)

`app/globals.css` defines the **"shoji" skin** as raw `--rp-*` CSS vars: light under `:root`, dark under `:root[data-theme="dark"]` and `@media (prefers-color-scheme: dark) :root:not([data-theme])`. `@theme inline` maps Tailwind `--color-*` tokens to those vars so **every utility class is theme-reactive at runtime**. To retheme, change the `--rp-*` values, not the component classes.

`lib/theme.ts` exposes `useThemePref()` / `setThemePref()` over `localStorage["shojin-theme"]` (`system` | `light` | `dark`) and toggles `data-theme` on `<html>`. A no-flash inline script in `app/layout.tsx` applies the saved theme before paint. The toggle UI lives in Profile (`Tools.tsx`).

**Palette token semantics** (names are reused from earlier brands — mind the mapping):
- `green*` → **charcoal** (the primary/brand role: hero card, Finish, avatar, active-tab `green-ink`).
- `ember` / `ember-soft` and `amber*` → **brick red** (the action accent: FAB, CTAs). `ember` and `amber` are the same colour.
- `on-accent` → text colour on amber/danger buttons (was `night`); `bg-night` → page / recessed background.
- `danger*` destructive only; `mint` → `green-ink`; `mg-*` muscle-group chart colours; `heat-0..4` heatmap ramp (both ramps are theme-aware).
- Fonts: **Hanken Grotesk** (sans) + **JetBrains Mono** (numbers/eyebrows) via `next/font` in `layout.tsx`. The `.rp-eyebrow` helper class is the mono uppercase section label.

### Brand & PWA

- Logo marks in `components/ShojinLogo.tsx` (`ShojinMark` stacked-rect "steps", `ShojinIcon` charcoal squircle, `ShojinWordmark` "shōjin."). PWA icons are generated routes: `app/icon.tsx`, `app/apple-icon.tsx`, `app/icon-maskable/route.tsx` (referenced from `app/manifest.ts`).
- Service worker at `app/sw.js/route.ts`; `UpdateBanner` prompts to apply a new version.
- `InstallPrompt.tsx` — dismissable "add to home screen" guide. Never shows in the installed PWA (`isStandalone()`), never on the first launch, and only after a short in-session delay; native install on Chromium, Share-sheet instructions on iOS. Re-openable from Profile via the `OPEN_INSTALL_EVENT` window event.

### UI primitives — never use native `window.*` dialogs

Two standalone Zustand stores back app-wide UI, each with a host mounted once in `AppShell`:

- `lib/toast.ts` → `<Toaster />`. `toast.success/error/show`; `toast.show(msg, { action: { label: "Undo", onClick } })` is the forgiveness pattern for reversible destructive actions.
- `lib/dialog.ts` → `<DialogHost />`. `await confirmDialog({ title, message, danger })` → boolean; `await promptDialog({...})` → `string | null`.

Destructive flows (discard / replace / delete) use `confirmDialog({ danger: true })`; reversible removals (a set or exercise) remove immediately and surface a `toast` Undo backed by `insertDraftSet` / `insertDraftExercise`.

Shared visual primitives live in `components/ShojinUI.tsx` (`Icon`, `Eyebrow`, `Pill`, `Delta`, `WeekStrip`). The template-creation modal is the shared `<TemplateBuilder />` (used by both `StartModal` and `Tools`) — don't re-inline it.

### Database (Supabase)

Schema in `supabase/schema.sql`. Built-in exercises have `user_id = null` (RLS lets all authenticated users read them); every other table is owner-only (`user_id = auth.uid()`). A trigger auto-creates a `profiles` row on signup. `workout_sets` and `template_sets` cascade-delete with their parent. To add a field: `lib/types.ts` → column in `supabase/schema.sql` → `lib/db.ts` query → store (if needed) → components.

### Data safety — never delete user data

Workouts, templates, custom exercises, and bodyweight are the irreplaceable asset; they live only in Supabase, so code deploys never touch them — but schema work can.

- **Migrations are additive only.** New field → `alter table … add column if not exists …`. Never `DROP TABLE/COLUMN`, `TRUNCATE`, unscoped `DELETE`, or rename-as-cleanup.
- **`supabase/schema.sql` stays idempotent and re-runnable** (`create table if not exists`, guarded enums, `on conflict … do update` seeds) — re-running must never drop/recreate a populated table.
- **Never run destructive SQL via the Management API without (1) explicit user confirmation and (2) a fresh backup.** Backups: Supabase Dashboard → Database → Backups (enable PITR); per-user CSV export is in Profile → Data.
- RLS stays enabled on every user table.

## Key libraries

- **recharts@3** — line/area charts in `Progress.tsx` & `BodyweightChart.tsx`, radar in `MuscleRadar.tsx`. All chart components are `"use client"` in a `ResponsiveContainer`.
- **zustand@5** — plain `create`. **papaparse** — CSV export only (`lib/csv.ts`).

## Conventions

- `"use client"` on every component using state, effects, or browser APIs. Path alias `@/*` → project root.
- No comments inside functions unless capturing non-obvious behaviour. Icon-only buttons need an `aria-label`.
- Always select the raw array from the store (`useStore(s => s.workouts)`) and filter/sort with `useMemo` in the component — never filter inside the selector (a new array reference every render trips React 19's snapshot check).
- TS closure narrowing doesn't apply inside nested function bodies — add an explicit `if (!draft) return` inside any function that uses `draft`, even when the outer scope already narrowed it.

## Naming legacy (intentional, do not "fix")

- `localStorage["ironlog-draft"]` — kept so in-progress drafts aren't orphaned for existing users.
- Token class names `ember` / `green` / `night` map to the Shojin palette (see Theming) — they are reused, not stale.
- Component file/tab-name mismatches: `Dashboard.tsx` = Home, `Tools.tsx` = Profile.
