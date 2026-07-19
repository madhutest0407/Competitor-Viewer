-- Actually schedule the daily auto-sync job.
-- Previous migration (20260716072540) only enabled pg_cron/pg_net extensions
-- but never created the cron.schedule() job, so /api/public/sync/all was
-- never being called automatically. This fixes that gap.

-- Remove any prior job with the same name so this migration is re-runnable.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'pm-radar-daily-auto-sync';

-- Daily at 03:30 UTC = 09:00 IST
SELECT cron.schedule(
  'pm-radar-daily-auto-sync',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://competitorradar.lovable.app/api/public/sync/all',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
