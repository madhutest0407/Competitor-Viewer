## Goal

A Linear-style web app that aggregates Google Workspace and Microsoft 365 calendar release announcements (past + upcoming) and shows them as a quarter timeline, status kanban, vendor comparison, and gap analysis. Backend is **shared and multi-user** so any PM can sign up and use it.

## Stack

- **Frontend:** React 19 + Vite 7, TypeScript, Tailwind v4, shadcn/ui, React Router, TanStack Query.
- **Backend:** Lovable Cloud (Postgres + Edge Functions + Auth).
- **External:** Firecrawl (Google blog scrape), Lovable AI Gateway `google/gemini-2.5-flash` (extraction + categorization).

> Replaces the TanStack Start template: strip `src/routes/` file routing, `src/server.ts`, `src/start.ts`. Bootstrap a plain Vite SPA (`index.html` + `src/main.tsx` + `<BrowserRouter>`).

## Shared backend model

**Releases are global** — one shared dataset of Google + Microsoft calendar releases, visible to everyone (signed in or not). **Notes and own-product tracking are per user.**

| Data | Visibility | Who can write |
|---|---|---|
| Google + Microsoft releases | Public read | Edge functions only (service role) |
| Sync runs / status | Public read | Edge functions only |
| Gap-analysis notes | Owner-only | Signed-in user (own rows) |
| Own product roadmap items | Owner-only | Signed-in user (own rows) |

**Auth:** email/password + Google sign-in (Lovable Cloud managed). Anonymous visitors get the full timeline / kanban / compare views read-only. Sign-in unlocks the Notes column on Gap analysis and the "My product" tracker.

## Data ingestion

- **Microsoft** — `sync-microsoft` edge function fetches the M365 Roadmap JSON feed, filters to Outlook / Teams Calendar / Bookings / Places / Calendar tags, upserts into `releases` by `source_id`.
- **Google** — `sync-google` edge function uses Firecrawl on `workspaceupdates.googleblog.com` (calendar label) and `workspace.google.com/whatsnew`, then AI-extracts title, summary, status, dates, audience.
- **Categorization** — second AI pass tags each release with a normalized category (Scheduling, AI/Assist, Rooms & Resources, Mobile, Admin/Security, Integrations, Notifications, Sharing/Permissions, Other) so vendors are comparable.

## Sync trigger

- **Daily cron** (`pg_cron` → `net.http_post` to a public edge endpoint with `x-sync-secret`). Runs once a day automatically.
- **"Sync now" button** in the UI, available to any visitor. Protected by per-IP rate limit (e.g. 1 manual sync per 10 min globally) recorded in `sync_runs` so casual clicks are fine but the endpoint can't be hammered. The cron path uses the shared secret and bypasses the rate limit.

## Views

1. **Timeline** (`/`) — horizontal swimlanes per vendor, x-axis = quarters (-4Q to +4Q), cards by release date, colored by status.
2. **Board** (`/board`) — kanban: Planned · In development · Preview/Rolling out · Generally available · Cancelled.
3. **Compare** (`/compare`) — table grouped by normalized category, columns Google / Microsoft / Gap.
4. **Gaps** (`/gaps`) — categories ranked by Microsoft-only / Google-only / Both. Right column = "My take" notes (per signed-in user).
5. **My product** (`/me`, signed-in only) — lightweight tracker for your own roadmap items per category, used to compute personal gap vs each vendor.
6. **Sources** (`/sources`) — last sync status, source URLs, manual sync button.

Global filters: vendor, status, category, date range, search.

## Schema (Lovable Cloud / Postgres)

- `releases` — id, source_id unique, vendor, title, description, summary, status, category, release_date, announced_date, source_url, platforms[], audience[], raw jsonb, updated_at. **Public SELECT; writes via service role only.**
- `sync_runs` — id, source, started_at, finished_at, items_upserted, error, triggered_by ('cron' | 'manual'). **Public SELECT.**
- `notes` — id, user_id (FK auth.users), category, body, updated_at. **RLS: user_id = auth.uid().**
- `my_product_items` — id, user_id, category, title, status, target_date, notes. **RLS: user_id = auth.uid().**
- `profiles` — id (FK auth.users), display_name, created_at. Auto-created via trigger on signup.

## Edge functions

- `sync-microsoft` — public, accepts `x-sync-secret` (cron) or rate-limited anonymous (manual).
- `sync-google` — same.
- `categorize` — backfill missing categories.

## Frontend modules

- `src/lib/supabase.ts` — browser client
- `src/lib/auth.tsx` — `<AuthProvider>` + `useAuth()` (session listener)
- `src/lib/api.ts` — TanStack Query hooks
- `src/components/layout/AppShell.tsx` — sidebar + top bar (shows Sign in / avatar)
- `src/components/auth/AuthDialog.tsx` — email + Google
- `src/views/Timeline.tsx`, `Board.tsx`, `Compare.tsx`, `Gaps.tsx`, `MyProduct.tsx`, `Sources.tsx`
- `src/components/ReleaseDrawer.tsx`

## Design (Linear-like)

Dark-first, dense, monospaced numerals, 13–14px base, sidebar nav, top-bar vendor pills + filters, vendor accents (Google blue / Microsoft teal), all colors as `oklch` tokens in `src/styles.css`. Subtle 200ms motion on drawer/hover only.

## Build order

1. Reset template to React + Vite SPA shell (router, query client, Tailwind tokens, shadcn).
2. Enable Lovable Cloud, configure email + Google auth, create schema + RLS + profile trigger.
3. `sync-microsoft` edge function + Sources page to verify upserts.
4. `sync-google` edge function (Firecrawl + AI extraction).
5. Layout shell, filters, auth dialog.
6. Timeline + detail drawer.
7. Board.
8. Compare + Gaps (with per-user notes).
9. My product tracker.
10. Daily cron via `pg_cron` calling sync endpoints with shared secret.

## Out of scope (v1)

Team workspaces, sharing notes between users, email/Slack alerts, exports.
