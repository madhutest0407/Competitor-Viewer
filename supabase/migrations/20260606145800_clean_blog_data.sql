-- Remove irrelevant blog posts from Proton, Superhuman, and Falstmail
-- Keep only feature releases, enhancements, and product announcements

DELETE FROM public.releases
WHERE source IN ('proton', 'superhuman', 'falstmail')
AND (
  -- Remove blog/news/marketing content
  title ILIKE '%blog%' OR
  title ILIKE '%news%' OR
  title ILIKE '%press release%' OR
  title ILIKE '%interview%' OR
  title ILIKE '%tip%' OR
  title ILIKE '%tips%' OR
  title ILIKE '%guide%' OR
  title ILIKE '%how to%' OR
  title ILIKE '%tutorial%' OR
  title ILIKE '%case study%' OR
  title ILIKE '%customer story%' OR
  title ILIKE '%webinar%' OR
  title ILIKE '%event%' OR
  title ILIKE '%conference%' OR
  title ILIKE '%summit%' OR
  title ILIKE '%security fix%' OR
  title ILIKE '%bug fix%' OR
  title ILIKE '%patch%' OR
  title ILIKE '%hotfix%' OR
  title ILIKE '%thought leadership%' OR
  title ILIKE '%company update%' OR
  title ILIKE '%company news%' OR
  -- Also check description/summary
  description ILIKE '%security fix%' OR
  description ILIKE '%bug fix%' OR
  description ILIKE '%how to%' OR
  description ILIKE '%tips and tricks%'
);
