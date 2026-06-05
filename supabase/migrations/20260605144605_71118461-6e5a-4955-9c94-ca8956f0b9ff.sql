DROP POLICY IF EXISTS "sync_runs readable by all" ON public.sync_runs;
REVOKE SELECT ON public.sync_runs FROM anon;
GRANT SELECT ON public.sync_runs TO authenticated;
CREATE POLICY "sync_runs readable by authenticated"
  ON public.sync_runs
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);