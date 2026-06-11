-- Fix RLS policy to ensure sync_runs is readable by all users (public access)
-- This migration removes restrictive policies and ensures public access is allowed

-- Drop all existing policies on sync_runs
DROP POLICY IF EXISTS "sync_runs readable by all" ON public.sync_runs;
DROP POLICY IF EXISTS "sync_runs readable by authenticated" ON public.sync_runs;

-- Disable RLS entirely for sync_runs since it's public data
ALTER TABLE public.sync_runs DISABLE ROW LEVEL SECURITY;

-- Alternatively, if RLS must stay enabled, use this policy:
-- ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "sync_runs readable by all"
--   ON public.sync_runs
--   FOR SELECT
--   TO public
--   USING (true);
