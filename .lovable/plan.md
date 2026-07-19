# Plan: Enhance sync_runs for auto-schedule visibility

## Current state
- `public.sync_runs` already logs every sync run with `started_at`, `finished_at`, `items_upserted`, `error`, and `triggered_by` (`manual` or `cron`).
- A pg_cron job named `calradar-daily-sync` already exists and calls `/api/public/sync/all` daily at 3:30 UTC (9:00 AM IST).
- The sync code updates `finished_at` and `error` on completion, but there is no explicit `status` column, so the UI and cron logs cannot quickly distinguish pending / success / failed runs.

## Proposed changes

### 1. Database migration — add `status` to `sync_runs`
Add a `status` column to `public.sync_runs` with a check constraint allowing only `pending`, `success`, and `failed`. Backfill existing rows: rows with `error` become `failed`, rows with `finished_at` and no error become `success`, everything else becomes `pending`.

### 2. Update sync logic to set `status`
Modify `src/lib/sync.server.ts` so every sync run insert defaults to `pending` and every completion update sets `success` or `failed` alongside the existing `finished_at`/`error` fields. This covers the generic `syncProductChangelog`, `syncProductRss`, and the legacy `syncMicrosoft`/`syncGoogle` paths.

### 3. Regenerate Supabase types
After the migration runs, regenerate `src/integrations/supabase/types.ts` so TypeScript knows about the new `status` column.

### 4. (Optional) UI improvement — show last auto-sync status
If you want, I can add a small indicator on the Sources / Sync settings page showing the latest cron run status and timestamp. This is not strictly required for the migration but makes the auto-schedule feature observable.

## Migration scope
- Table affected: `public.sync_runs`
- New column: `status` (text, not null, default `pending`, check constraint)
- No changes to RLS or policies needed; the existing policy remains intact.

## Notes
- The cron job itself does not need to be recreated unless you want to change its schedule or endpoint.
- This migration is purely additive and backfills existing data safely.

Would you like me to proceed with this plan?