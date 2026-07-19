DROP POLICY IF EXISTS "sync_runs readable by all" ON public.sync_runs;
DROP POLICY IF EXISTS "sync_runs readable by authenticated" ON public.sync_runs;
DROP POLICY IF EXISTS "sync_runs insertable by service role" ON public.sync_runs;
DROP POLICY IF EXISTS "sync_runs updatable by service role" ON public.sync_runs;
ALTER TABLE public.sync_runs DISABLE ROW LEVEL SECURITY;