ALTER TABLE public.sync_runs
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.sync_runs
DROP CONSTRAINT IF EXISTS sync_runs_status_check;

ALTER TABLE public.sync_runs
ADD CONSTRAINT sync_runs_status_check
CHECK (status IN ('pending', 'success', 'failed'));

UPDATE public.sync_runs
SET status = CASE
  WHEN error IS NOT NULL THEN 'failed'
  WHEN finished_at IS NOT NULL THEN 'success'
  ELSE 'pending'
END;

-- Ensure existing grants remain intact for the altered table
GRANT SELECT, INSERT, UPDATE ON public.sync_runs TO authenticated;
GRANT ALL ON public.sync_runs TO service_role;