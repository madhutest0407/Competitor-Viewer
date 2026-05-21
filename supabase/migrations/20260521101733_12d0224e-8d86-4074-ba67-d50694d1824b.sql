
-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles readable by all" on public.profiles for select using (true);
create policy "users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "users insert own profile" on public.profiles for insert with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- releases (shared, public read)
create table public.releases (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('google','microsoft')),
  source_id text not null,
  title text not null,
  description text,
  summary text,
  status text,
  category text,
  release_date date,
  announced_date date,
  source_url text,
  platforms text[] default '{}',
  audience text[] default '{}',
  raw jsonb,
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);
create index releases_source_idx on public.releases (source);
create index releases_status_idx on public.releases (status);
create index releases_release_date_idx on public.releases (release_date);
alter table public.releases enable row level security;
create policy "releases readable by all" on public.releases for select using (true);

-- sync_runs (public read)
create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_upserted int default 0,
  error text,
  triggered_by text not null default 'manual'
);
create index sync_runs_source_started_idx on public.sync_runs (source, started_at desc);
alter table public.sync_runs enable row level security;
create policy "sync_runs readable by all" on public.sync_runs for select using (true);

-- notes per user per category
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  body text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, category)
);
alter table public.notes enable row level security;
create policy "notes select own" on public.notes for select using (auth.uid() = user_id);
create policy "notes insert own" on public.notes for insert with check (auth.uid() = user_id);
create policy "notes update own" on public.notes for update using (auth.uid() = user_id);
create policy "notes delete own" on public.notes for delete using (auth.uid() = user_id);

-- my product items per user
create table public.my_product_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  title text not null,
  status text not null default 'planned',
  target_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.my_product_items enable row level security;
create policy "mpi select own" on public.my_product_items for select using (auth.uid() = user_id);
create policy "mpi insert own" on public.my_product_items for insert with check (auth.uid() = user_id);
create policy "mpi update own" on public.my_product_items for update using (auth.uid() = user_id);
create policy "mpi delete own" on public.my_product_items for delete using (auth.uid() = user_id);

-- timestamp trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger releases_touch before update on public.releases for each row execute function public.touch_updated_at();
create trigger notes_touch before update on public.notes for each row execute function public.touch_updated_at();
create trigger mpi_touch before update on public.my_product_items for each row execute function public.touch_updated_at();
