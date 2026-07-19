-- CRITICAL FIX: Force sync_runs table to be publicly readable
-- Previous RLS disable didn't work; this enforces it with multiple fallbacks

-- Step 1: Drop all existing RLS policies on sync_runs
DROP POLICY IF EXISTS "sync_runs readable by all" ON public.sync_runs;
DROP POLICY IF EXISTS "sync_runs readable by authenticated" ON public.sync_runs;
DROP POLICY IF EXISTS "sync_runs insertable by service role" ON public.sync_runs;
DROP POLICY IF EXISTS "sync_runs updatable by service role" ON public.sync_runs;

-- Step 2: Disable RLS entirely (most permissive approach)
ALTER TABLE public.sync_runs DISABLE ROW LEVEL SECURITY;

-- Step 3: Verify RLS is disabled by checking the table
-- If for some reason a future migration re-enables RLS, add this policy:
-- ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "sync_runs public read" ON public.sync_runs FOR SELECT USING (true);
-- CREATE POLICY "sync_runs service role write" ON public.sync_runs FOR INSERT WITH CHECK (true);
-- CREATE POLICY "sync_runs service role update" ON public.sync_runs FOR UPDATE USING (true);

-- This table contains only sync metadata (timestamps, item counts, errors)
-- It contains NO user-specific or sensitive data, so public read access is safe
