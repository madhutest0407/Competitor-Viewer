-- Aggressive cleanup: Remove all non-feature blog posts from Proton, Superhuman, Fastmail
-- Keep only posts that are clearly about feature releases or enhancements

DELETE FROM public.releases
WHERE source IN ('proton', 'superhuman', 'falstmail')
AND (
  -- Exclude non-feature content patterns
  title ~* 'blog|news|press release|interview|tip|tips|tricks|guide|how.?to|tutorial|walkthrough|case.study|customer.story|webinar|podcast|video|event|conference|summit|trade.show|speaking|security|bug|patch|hotfix|vulnerability|job|hiring|careers|report|study|benchmark|survey|research|partnership|acquisition|funding|investment'
  OR
  description ~* 'blog|news|press release|interview|tip|tips|tricks|guide|how.?to|tutorial|walkthrough|case.study|customer.story|webinar|podcast|video|event|conference|summit|trade.show|speaking|security|bug|patch|hotfix|vulnerability|job|hiring|careers|report|study|benchmark|survey|research|partnership|acquisition|funding|investment'
)
AND NOT (
  -- But keep posts that are clearly about features
  title ~* '^(new|introducing|announcing|available|launching?|released?|feature)'
  OR title ~* '(new|feature|update|release|launch|announcement)$'
  OR title ~* 'feature|product.release|product.update'
);

-- Also remove posts that don't contain clear feature/update keywords in title
DELETE FROM public.releases
WHERE source IN ('proton', 'superhuman', 'falstmail')
AND title NOT ~* 'feature|product|release|launch|new|available|update|announcement|introducing|announced|coming.soon|enhancement|improved|capability|now.available';
