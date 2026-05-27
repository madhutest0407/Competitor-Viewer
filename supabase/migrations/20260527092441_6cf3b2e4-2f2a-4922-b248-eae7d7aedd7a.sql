DROP POLICY IF EXISTS "sync_runs readable by all" ON public.sync_runs;
CREATE POLICY "sync_runs readable by authenticated"
  ON public.sync_runs FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.sync_runs FROM anon;