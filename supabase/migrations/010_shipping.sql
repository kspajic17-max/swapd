create table public.swap_shipping (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.swap_offers on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  full_name text,
  street text,
  city text,
  state text,
  zip text,
  tracking_number text,
  shipped boolean default false,
  shipped_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(offer_id, user_id)
);

alter table public.swap_shipping enable row level security;

create policy "Users can see shipping for their swaps"
  on public.swap_shipping for select
  using (
    exists (
      select 1 from public.swap_offers so
      join public.swap_interests si on si.id = so.interest_id
      join public.listings l on l.id = si.listing_id
      where so.id = offer_id
        and (si.interested_user_id = auth.uid() or l.user_id = auth.uid())
    )
  );

create policy "Users can insert their own shipping"
  on public.swap_shipping for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own shipping"
  on public.swap_shipping for update
  using (auth.uid() = user_id);
