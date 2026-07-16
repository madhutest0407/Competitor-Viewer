## Overview

Restructure CalRadar around two product **categories**:
1. **Collaboration Products** — Google, Microsoft, Notion, Proton, Fastmail, Superhuman (existing)
2. **Transactional Email** — SendGrid, Postmark, Mailgun, Mailjet, Brevo, Resend (new)

Users pick a section, and their choice + active products are persisted per-section. Also: remove the 4-product cap, and add a daily 9am auto-sync.

## 1. Data model changes

Add a `category` column to the `products` table:

```sql
ALTER TABLE public.products
  ADD COLUMN category text NOT NULL DEFAULT 'collaboration'
  CHECK (category IN ('collaboration','transactional_email'));
```

Backfill existing rows to `collaboration`, then insert 6 new products (all RSS feeds, reusing the existing `syncProductRss` pipeline):

| id | name | feed |
|---|---|---|
| sendgrid | SendGrid | https://sendgrid.com/blog/feed |
| postmark | Postmark | https://postmarkapp.com/blog/feed |
| mailgun | Mailgun | https://www.mailgun.com/blog/rss.xml |
| mailjet | Mailjet | https://www.mailjet.com/feed/ |
| brevo | Brevo | https://www.brevo.com/blog/feed/ |
| resend | Resend | https://resend.com/blog/rss.xml |

Each seeded with `default_enabled = false`, unique color, and `category = 'transactional_email'`. (Feed URLs verified during implementation; swap to sitemap fallback if any 404s.)

## 2. Section state (persistent)

- New localStorage key `calradar.activeSection` → `'collaboration' | 'transactional_email'` (default: `collaboration`).
- Change `calradar.activeProducts` from a flat array to `{ collaboration: string[], transactional_email: string[] }` with a one-time migration in the reader (treat old array as `collaboration`).
- Update `useActiveProductIds` in `src/lib/products.ts` to be section-scoped: reading and toggling always operates on the current section.
- Add `useActiveSection()` hook backed by the same shared-store pattern (`useSyncExternalStore`) so the sidebar/tab switcher, Timeline, Compare, Gaps, and Sources stay in sync.

## 3. UI: section tabs

Add a `SectionTabs` component (rendered above `ActiveProductsBar`) on **Timeline**, **Compare**, **Gaps**, and **Sources**:

```
[ Collaboration ] [ Transactional Email ]
```

- Switching a tab flips `activeSection`, which re-filters the products bar and page content.
- The chosen tab is remembered across reloads (localStorage).
- `ActiveProductsBar` only shows products where `product.category === activeSection`.

## 4. Remove the 4-product cap

- Delete the `MAX_ACTIVE = 4` guard in `src/lib/products.ts` and the "max" toast in `ActiveProductsBar.tsx`.
- Timeline grid: change `gridTemplateColumns: repeat(min(n, 4), ...)` to a responsive rule — up to 4 columns on wide screens, wrap onto new rows beyond that (e.g. `repeat(auto-fit, minmax(240px, 1fr))` capped visually).
- Compare/Gaps tables: allow horizontal scroll when many products are active.

## 5. Sources page: two sections

Split `src/routes/sources.tsx` into two subsections (Collaboration / Transactional Email), driven by the same `activeSection` state, so the sync toggles the user sees match the tab they picked. Each product row still has its individual "Sync now" button.

## 6. Daily 9am auto-sync

Add a new public cron endpoint `src/routes/api/public/sync.all.ts` that iterates all products (both categories) and calls the existing `syncGoogle` / `syncMicrosoft` / `syncProductRss` functions with `trigger = 'cron'`. Guard with the existing `authorizeApiRequest` (`CRON_SECRET` or JWT).

Register a pg_cron job (via `supabase--insert`, not migration) using the stable published URL:

```sql
SELECT cron.schedule(
  'calradar-daily-sync',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pmradars.lovable.app/api/public/sync/all',
    headers := '{"Content-Type":"application/json","apikey":"<anon-key>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

Note: pg_cron runs in UTC. "9am system time" is ambiguous for a multi-user app; I'll schedule it for **9:00 in the app's primary timezone** — please confirm which timezone to use (e.g. UTC, IST, or your local), and I'll set the cron expression accordingly. Manual "Sync now" buttons remain unchanged.

Also surface "Last auto-sync" timestamp on the Sources page (read from `sync_runs` where `trigger = 'cron'`).

## 7. Files touched

- **DB migration**: add `category` column + backfill + seed 6 new products.
- **`src/lib/products.ts`**: add `useActiveSection`, section-scoped `useActiveProductIds`, remove `MAX_ACTIVE`.
- **`src/components/SectionTabs.tsx`** (new).
- **`src/components/ActiveProductsBar.tsx`**: filter by section, drop cap toast.
- **`src/routes/index.tsx`, `compare.tsx`, `gaps.tsx`, `sources.tsx`**: render `SectionTabs`, adjust grid.
- **`src/lib/sync.server.ts`**: no changes — the generic RSS adapter already handles new products.
- **`src/routes/api/public/sync.all.ts`** (new): cron entry point.
- **pg_cron insert** via `supabase--insert`.

## Open questions

1. **Timezone** for the 9am auto-sync — UTC, IST, or another?
2. If any of the 6 email vendors' RSS feeds don't work (some use custom paths), OK to fall back to their sitemap or skip that vendor with a note?
