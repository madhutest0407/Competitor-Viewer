## Goal

Linear-style web app that aggregates Google Workspace and Microsoft 365 calendar release announcements (past + upcoming) and presents them as a quarter timeline, status kanban, vendor comparison, and gap analysis. Shared backend so any PM can sign up and use it.

## Stack

- **Frontend:** React 19 + Vite 7 (foundation already in template), TypeScript, Tailwind v4, shadcn/ui, TanStack file-based routing, TanStack Query.
- **Backend:** Lovable Cloud (Postgres + Auth + TanStack server functions/routes).
- **AI:** Lovable AI Gateway, `google/gemini-2.5-flash` (no key required).
- **No external connectors required.**

## Data sources (no API keys, no Firecrawl)

- **Microsoft 365 Roadmap** — public JSON feed `https://www.microsoft.com/releasecommunications/api/v2/m365`. Fetch, filter to Outlook / Teams Calendar / Bookings / Places / Calendar tags, normalize.
- **Google Workspace Updates blog** — public Blogger JSON feed `https://workspaceupdates.googleblog.com/feeds/posts/default/-/Calendar?alt=json&max-results=50` (label-filtered to Calendar). Returns title, content HTML, published date, labels — no auth.
- **AI extraction** — for each Google post, send HTML → Gemini Flash to extract structured `{ status, rolloutStart, rolloutEnd, audience, summary }`.
- **Categorization** — second AI pass on every release (both vendors) to assign a normalized category (Scheduling, AI/Assist, Rooms & Resources, Mobile, Admin/Security, Integrations, Notifications, Sharing/Permissions, Other).

All ingestion runs inside TanStack server routes — never from the browser.

## Shared backend model

| Data | Visibility | Writers |
|---|---|---|
| Google + Microsoft releases | Public read | Server (admin client) |
| Sync runs / status | Public read | Server (admin client) |
| Gap-analysis notes | Owner-only | Signed-in user |
| Own product roadmap items | Owner-only | Signed-in user |

**Auth:** email/password + Google sign-in (Lovable Cloud managed, no setup). Anonymous visitors can browse all release views read-only. Sign-in unlocks Notes column on Gaps and the My-Product tracker.

## Sync trigger

- **Daily cron** via `pg_cron` → `pg_net.http_post` to a public route under `/api/public/sync/*`. Authenticated with the project anon key in the `apikey` header (standard Lovable Cloud cron pattern).
- **"Sync now" button** in the UI, callable by any visitor. Same endpoint, with a global rate limit recorded in `sync_runs` (e.g. 1 manual sync per source per 10 min) so it can't be hammered.

## Views

1. **Timeline** (`/`) — horizontal swimlanes per vendor, x-axis = quarters (-4Q to +4Q), cards positioned by release date, colored by status.
2. **Board** (`/board`) — kanban: Planned · In development · Preview/Rolling out · Generally available · Cancelled.
3. **Compare** (`/compare`) — table grouped by normalized category, columns Google / Microsoft / Gap.
4. **Gaps** (`/gaps`) — categories ranked by Microsoft-only / Google-only / Both, with per-user "My take" notes column (signed-in only).
5. **My product** (`/me`, signed-in only) — lightweight tracker for your own roadmap items per category, used for personal gap-vs-vendor view.
6. **Sources** (`/sources`) — last sync status per source, "Sync now" buttons, source URLs.

Global filters: vendor, status, category, date range, full-text search.

## Schema (Postgres / Lovable Cloud)

- `releases` — id, source_id (unique), vendor, title, description, summary, status, category, release_date, announced_date, source_url, platforms[], audience[], raw jsonb, updated_at. **Public SELECT; writes via service role only.**
- `sync_runs` — id, source, started_at, finished_at, items_upserted, error, triggered_by ('cron' | 'manual'). **Public SELECT.**
- `notes` — id, user_id (FK auth.users), category, body, updated_at. **RLS: user_id = auth.uid().**
- `my_product_items` — id, user_id, category, title, status, target_date, notes. **RLS: user_id = auth.uid().**
- `profiles` — id (FK auth.users), display_name, created_at. Auto-created via signup trigger.

## Server routes / functions

- `POST /api/public/sync/microsoft` — fetches the M365 Roadmap JSON, normalizes, upserts via admin client, logs to `sync_runs`. Rate-limited for manual callers.
- `POST /api/public/sync/google` — fetches the Blogger JSON feed (label=Calendar), AI-extracts structured fields, upserts, logs.
- `POST /api/public/sync/categorize` — backfills missing categories via Gemini Flash.
- `listReleases`, `getRelease`, `saveNote`, `listMyProductItems`, `saveMyProductItem` — TanStack server functions for app reads/writes (auth-aware via `requireSupabaseAuth` where user-scoped).

## Frontend modules

- `src/lib/auth.tsx` — `<AuthProvider>` + `useAuth()` session listener
- `src/lib/api.ts` — TanStack Query hooks
- `src/components/layout/AppShell.tsx` — sidebar + top bar (Sign in / avatar)
- `src/components/auth/AuthDialog.tsx` — email + Google
- `src/routes/index.tsx` (Timeline), `board.tsx`, `compare.tsx`, `gaps.tsx`, `me.tsx`, `sources.tsx`
- `src/components/ReleaseDrawer.tsx`

## Design (Linear-like)

Dark-first, dense, monospaced numerals, 13–14px base; sidebar nav; top bar with vendor pills + filters; vendor accents (Google blue / Microsoft teal); all colors as `oklch` tokens in `src/styles.css`; subtle 200ms motion on drawer/hover only.

## Build order

1. Configure Cloud auth: email + Google. Add schema + RLS + profile-on-signup trigger.
2. `/api/public/sync/microsoft` server route + Sources page to verify upserts.
3. `/api/public/sync/google` server route (Blogger feed + Gemini extraction).
4. Categorize server route + integrate into both syncs.
5. App shell, filters, auth dialog.
6. Timeline + detail drawer.
7. Board.
8. Compare + Gaps (with per-user notes).
9. My product tracker.
10. Daily cron via `pg_cron` calling both sync endpoints with anon-key `apikey` header.

## Out of scope (v1)

Team workspaces, shared notes, email/Slack alerts, exports.

## Risks / notes

- The Blogger JSON feed is unofficial-but-stable; if Google ever changes it, fallback is the same blog's Atom feed at `/feeds/posts/default`. Both are public.
- The M365 Roadmap endpoint is unauthenticated but rate-limited; daily sync stays well within limits.
