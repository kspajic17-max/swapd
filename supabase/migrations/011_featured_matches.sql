create table public.featured_matches (
  id uuid primary key default gen_random_uuid(),
  listing_a_id uuid references public.listings on delete cascade,
  listing_b_id uuid references public.listings on delete cascade,
  admin_note text,
  status text default 'active',
  created_at timestamptz default now()
);

alter table public.featured_matches enable row level security;

create policy "Anyone can see featured matches"
  on public.featured_matches for select
  using (true);

create policy "Admin can manage featured matches"
  on public.featured_matches for all
  using (auth.role() = 'authenticated');
