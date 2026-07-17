## Problem

The RSS feeds we wired for SendGrid, Postmark, Mailgun, Mailjet, Brevo, and Resend either 404, return marketing blog posts, or don't publish an Atom/RSS feed at all. Users want **release-note / changelog** items (features, APIs, enhancements), not generic blog content.

The URLs you gave are HTML changelog pages, not feeds — so the current `syncProductRss` adapter can't consume them.

## Approach

Add a second adapter — `syncProductChangelog` — that fetches an HTML changelog page and uses the Lovable AI Gateway (Gemini Flash, same key we already use) to extract a structured list of release entries. No Firecrawl, no new secrets.

Flow per product:
1. `fetch(url)` the changelog page (server-side, so no CORS).
2. Strip scripts/styles, take the main text (first ~120 KB to stay within token budget).
3. Send to Lovable AI with a strict JSON schema prompt:
   ```
   [{ title, description, date (ISO), href, category_hint }]
   ```
   System prompt narrows extraction to **feature / API / enhancement / fix** entries and rejects marketing/blog posts, webinars, case studies, and pricing announcements.
4. Upsert into `releases` using the existing pipeline (Phase 1 bulk insert with placeholder category, Phase 2 AI categorization — same as Google/Microsoft).
5. Skip items whose date can't be parsed or that look like marketing (title contains "webinar", "guide", "case study", etc. — belt-and-braces filter after the AI pass).

## Data model changes

Add two columns to `products` so we can drive both adapters from the table:
```sql
ALTER TABLE public.products
  ADD COLUMN feed_kind text NOT NULL DEFAULT 'rss'
    -- already exists; extend the CHECK to include 'changelog_html'
  ...
```
(If a CHECK constraint blocks it, drop and recreate.)

Update the 6 transactional-email rows to `feed_kind = 'changelog_html'` with the URLs you supplied:

| id | url |
|---|---|
| mailgun | https://www.mailgun.com/releases/ |
| resend | https://resend.com/changelog |
| brevo | https://www.brevo.com/releases/ |
| mailjet | https://www.mailjet.com/releases/ |
| postmark | https://postmarkapp.com/updates |
| **twilio_sendgrid** | https://www.twilio.com/en-us/changelog?products=email&page=1 |

Replace the existing `sendgrid` seed with `twilio_sendgrid` (Twilio's changelog is the canonical source now that SendGrid's blog is marketing). Delete stale `sendgrid` rows + releases.

## Files touched

- **DB migration**: extend `feed_kind` CHECK, update 6 rows, rename `sendgrid`→`twilio_sendgrid`, purge stale releases.
- **`src/lib/sync.server.ts`**: add `syncProductChangelog(id, trigger)`; router picks adapter by `product.feed_kind`. Reuse existing `safeHttpUrl`, upsert helpers, and Phase-2 categorizer.
- **`src/routes/api/public/sync.product.ts`** and **`sync.all.ts`**: route to `syncProductChangelog` when `feed_kind = 'changelog_html'`.
- No UI changes.

## AI extraction prompt (sketch)

```
You are extracting release notes from a product changelog page.
Return ONLY a JSON array (no prose). Each entry:
- title: short, imperative (e.g. "Add webhook retry policy")
- description: 1–2 sentences summarising the change
- date: ISO date (YYYY-MM-DD); omit entry if unknown
- href: absolute URL to the entry if the page links to it, else the page URL
- kind: one of "feature" | "api" | "enhancement" | "fix"

Reject and DO NOT include: marketing posts, webinars, case studies,
customer stories, hiring/company news, pricing/plan announcements,
generic blog articles.

Max 40 entries per page.
```

Second pass reuses the existing category classifier so items still land in Delivery / Auth / Templates / etc.

## Risks & mitigations

- **Page structure changes** — because we extract with an LLM rather than fixed selectors, layout tweaks won't break sync.
- **AI token cost** — one call per product per sync (max ~6 calls/day from cron). Cheap on Gemini Flash.
- **Twilio SendGrid pagination** — v1 fetches only page 1 (most recent). If you want historical backfill later, we can loop `page=1..N` until the AI returns an empty array.
- **Brevo/Mailjet page may be JS-rendered** — if the raw HTML has no content, we'll fall back to their sitemap or mark the product as needing Firecrawl. I'll verify each URL returns usable HTML during implementation and flag any that don't.

## Open question

Should I also **backfill** existing transactional-email releases by clearing the current junk rows (from the broken RSS feeds) before the first changelog sync runs? Recommended: yes, so the Timeline immediately shows clean data.