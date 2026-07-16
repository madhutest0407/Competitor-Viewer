
-- 1. Add category column to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'collaboration';

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_category_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_category_check
  CHECK (category IN ('collaboration','transactional_email'));

-- 2. Backfill existing rows (defensive; new column already defaulted)
UPDATE public.products SET category = 'collaboration' WHERE category IS NULL;

-- 3. Seed transactional email products
INSERT INTO public.products (id, name, description, feed_kind, feed_url, default_enabled, color, sort_order, category)
VALUES
  ('sendgrid',  'SendGrid',  'Twilio SendGrid product & engineering blog',   'rss', 'https://sendgrid.com/en-us/blog/rss.xml',       false, '#1A82E2', 100, 'transactional_email'),
  ('postmark',  'Postmark',  'Postmark product updates and blog',            'rss', 'https://postmarkapp.com/blog.rss',              false, '#FFDE59', 101, 'transactional_email'),
  ('mailgun',   'Mailgun',   'Mailgun engineering & product blog',           'rss', 'https://www.mailgun.com/blog/rss/',             false, '#F0645A', 102, 'transactional_email'),
  ('mailjet',   'Mailjet',   'Mailjet product updates and blog',             'rss', 'https://www.mailjet.com/feed/',                 false, '#FBB03B', 103, 'transactional_email'),
  ('brevo',     'Brevo',     'Brevo (formerly Sendinblue) product blog',     'rss', 'https://www.brevo.com/blog/feed/',              false, '#0B996E', 104, 'transactional_email'),
  ('resend',    'Resend',    'Resend changelog',                             'rss', 'https://resend.com/blog/rss.xml',               false, '#000000', 105, 'transactional_email')
ON CONFLICT (id) DO UPDATE
SET category = EXCLUDED.category,
    feed_url = EXCLUDED.feed_url,
    feed_kind = EXCLUDED.feed_kind,
    color = EXCLUDED.color,
    sort_order = EXCLUDED.sort_order,
    description = EXCLUDED.description;

-- 4. Enable extensions for cron auto-sync
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
