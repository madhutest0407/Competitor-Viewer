UPDATE public.products SET feed_kind = 'changelog_html', feed_url = 'https://proton.me/blog/proton-updates' WHERE id = 'proton';
UPDATE public.products SET feed_kind = 'changelog_html', feed_url = 'https://new.superhuman.com/' WHERE id = 'superhuman';
UPDATE public.products SET feed_kind = 'changelog_html', feed_url = 'https://www.notion.com/releases' WHERE id = 'notion';
DELETE FROM public.releases WHERE source IN ('proton','superhuman','notion');