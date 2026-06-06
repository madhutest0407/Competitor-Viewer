-- Fix RLS policies to allow public/unauthenticated access for read-only operations
-- This is needed since we removed authentication from the app

-- Fix sync_runs table - allow anon users to read
DROP POLICY IF EXISTS "sync_runs readable by authenticated" ON public.sync_runs;
DROP POLICY IF EXISTS "sync_runs readable by all" ON public.sync_runs;

REVOKE SELECT ON public.sync_runs FROM anon;
GRANT SELECT ON public.sync_runs TO anon;

CREATE POLICY "sync_runs readable by all"
  ON public.sync_runs
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Fix releases table - ensure anon users can read
DROP POLICY IF EXISTS "releases readable by authenticated" ON public.releases;
DROP POLICY IF EXISTS "releases readable by all" ON public.releases;

REVOKE SELECT ON public.releases FROM anon;
GRANT SELECT ON public.releases TO anon;

CREATE POLICY "releases readable by all"
  ON public.releases
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Fix products table - ensure anon users can read
DROP POLICY IF EXISTS "products readable by authenticated" ON public.products;
DROP POLICY IF EXISTS "products readable by all" ON public.products;

REVOKE SELECT ON public.products FROM anon;
GRANT SELECT ON public.products TO anon;

CREATE POLICY "products readable by all"
  ON public.products
  FOR SELECT
  TO anon, authenticated
  USING (true);
