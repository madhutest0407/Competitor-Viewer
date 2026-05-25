
CREATE TABLE public.products (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  feed_kind text NOT NULL,
  feed_url text,
  default_enabled boolean NOT NULL DEFAULT false,
  color text NOT NULL DEFAULT 'var(--vendor-default)',
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products readable by all" ON public.products FOR SELECT USING (true);

INSERT INTO public.products (id, name, description, feed_kind, feed_url, default_enabled, color, sort_order) VALUES
  ('google',     'Google Workspace',  'Gmail & Google Calendar release notes', 'google-blog', 'https://workspaceupdates.googleblog.com', true,  'var(--vendor-google)',     10),
  ('microsoft',  'Microsoft 365',     'Outlook / Exchange / Bookings roadmap', 'ms-roadmap',  'https://www.microsoft.com/microsoft-365/roadmap', true, 'var(--vendor-microsoft)', 20),
  ('notion',     'Notion',            'Notion Calendar & workspace releases', 'rss', 'https://www.notion.so/releases/rss.xml', false, 'var(--vendor-notion)', 30),
  ('proton',     'Proton',            'Proton Mail / Calendar product updates', 'rss', 'https://proton.me/blog/feed', false, 'var(--vendor-proton)', 40),
  ('fastmail',   'Fastmail',          'Fastmail blog — features & releases', 'rss', 'https://www.fastmail.com/blog/feed.xml', false, 'var(--vendor-fastmail)', 50),
  ('superhuman', 'Superhuman',        'Superhuman blog — feature updates', 'rss', 'https://blog.superhuman.com/rss/', false, 'var(--vendor-superhuman)', 60);

CREATE TABLE public.user_product_prefs (
  user_id uuid NOT NULL,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

ALTER TABLE public.user_product_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "upp select own" ON public.user_product_prefs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "upp insert own" ON public.user_product_prefs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "upp update own" ON public.user_product_prefs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "upp delete own" ON public.user_product_prefs FOR DELETE USING (auth.uid() = user_id);
