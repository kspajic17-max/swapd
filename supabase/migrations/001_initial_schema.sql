-- =============================================================
-- swapd: Clothing Swap Marketplace — Initial Schema
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- =============================================================

-- -----------------------------------------------
-- 1. PROFILES (extends auth.users)
-- -----------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  username      text unique not null,
  display_name  text,
  bio           text,
  avatar_url    text,
  location      text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- -----------------------------------------------
-- 2. LISTINGS
-- -----------------------------------------------
create table public.listings (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles on delete cascade,
  title                 text not null,
  description           text,
  brand                 text,
  category              text not null
    check (category in ('tops','bottoms','dresses','shoes','accessories','outerwear','other')),
  size                  text not null,
  condition             text not null
    check (condition in ('new_with_tags','like_new','good','fair')),
  color                 text,
  estimated_value       numeric,
  looking_for           text,
  open_to_brands        text,
  not_interested_in     text,
  open_to_swap_plus_cash boolean default false,
  shipping_from         text,
  status                text default 'active'
    check (status in ('active','swapped','removed')),
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- -----------------------------------------------
-- 3. LISTING IMAGES
-- -----------------------------------------------
create table public.listing_images (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null references public.listings on delete cascade,
  image_url      text not null,
  display_order  integer default 0,
  created_at     timestamptz default now()
);

-- -----------------------------------------------
-- 4. SWAP INTERESTS
-- -----------------------------------------------
create table public.swap_interests (
  id                 uuid primary key default gen_random_uuid(),
  interested_user_id uuid not null references public.profiles on delete cascade,
  listing_id         uuid not null references public.listings on delete cascade,
  message            text,
  status             text default 'pending'
    check (status in ('pending','viewed','declined')),
  created_at         timestamptz default now()
);

-- -----------------------------------------------
-- 5. SWAP OFFERS
-- -----------------------------------------------
create table public.swap_offers (
  id                  uuid primary key default gen_random_uuid(),
  interest_id         uuid not null references public.swap_interests on delete cascade,
  offered_listing_ids uuid[],
  cash_addition       numeric default 0,
  status              text default 'pending'
    check (status in ('pending','accepted','countered','declined')),
  message             text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- -----------------------------------------------
-- INDEXES
-- -----------------------------------------------
create index idx_listings_user_id   on public.listings (user_id);
create index idx_listings_category  on public.listings (category);
create index idx_listings_size      on public.listings (size);
create index idx_listing_images_lid on public.listing_images (listing_id);

-- -----------------------------------------------
-- UPDATED_AT TRIGGER FUNCTION
-- -----------------------------------------------
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger set_listings_updated_at
  before update on public.listings
  for each row execute function public.handle_updated_at();

create trigger set_swap_offers_updated_at
  before update on public.swap_offers
  for each row execute function public.handle_updated_at();

-- -----------------------------------------------
-- AUTO-CREATE PROFILE ON SIGNUP
-- -----------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', 'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===============================================================
-- ROW LEVEL SECURITY
-- ===============================================================

-- ----- profiles -----
alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ----- listings -----
alter table public.listings enable row level security;

create policy "Active listings are viewable by everyone"
  on public.listings for select
  using (status = 'active' or auth.uid() = user_id);

create policy "Users can create their own listings"
  on public.listings for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own listings"
  on public.listings for update
  using (auth.uid() = user_id);

create policy "Users can delete their own listings"
  on public.listings for delete
  using (auth.uid() = user_id);

-- ----- listing_images -----
alter table public.listing_images enable row level security;

create policy "Listing images are viewable by everyone"
  on public.listing_images for select
  using (true);

create policy "Users can manage images for their own listings"
  on public.listing_images for insert
  with check (
    exists (
      select 1 from public.listings
      where id = listing_id and user_id = auth.uid()
    )
  );

create policy "Users can delete images for their own listings"
  on public.listing_images for delete
  using (
    exists (
      select 1 from public.listings
      where id = listing_id and user_id = auth.uid()
    )
  );

-- ----- swap_interests -----
alter table public.swap_interests enable row level security;

create policy "Users can see interests they sent or received"
  on public.swap_interests for select
  using (
    auth.uid() = interested_user_id
    or auth.uid() in (
      select user_id from public.listings where id = listing_id
    )
  );

create policy "Authenticated users can create interests"
  on public.swap_interests for insert
  with check (auth.uid() = interested_user_id);

create policy "Users can update interests on their own listings"
  on public.swap_interests for update
  using (
    auth.uid() in (
      select user_id from public.listings where id = listing_id
    )
  );

-- ----- swap_offers -----
alter table public.swap_offers enable row level security;

create policy "Users can see offers they are involved in"
  on public.swap_offers for select
  using (
    exists (
      select 1 from public.swap_interests si
      join public.listings l on l.id = si.listing_id
      where si.id = interest_id
        and (si.interested_user_id = auth.uid() or l.user_id = auth.uid())
    )
  );

create policy "Users can create offers on their own interests"
  on public.swap_offers for insert
  with check (
    exists (
      select 1 from public.swap_interests
      where id = interest_id and interested_user_id = auth.uid()
    )
  );

create policy "Involved users can update offers"
  on public.swap_offers for update
  using (
    exists (
      select 1 from public.swap_interests si
      join public.listings l on l.id = si.listing_id
      where si.id = interest_id
        and (si.interested_user_id = auth.uid() or l.user_id = auth.uid())
    )
  );

-- ===============================================================
-- STORAGE: listing-images bucket with public read
-- ===============================================================
insert into storage.buckets (id, name, public)
values ('listing-images', 'listing-images', true);

create policy "Anyone can view listing images"
  on storage.objects for select
  using (bucket_id = 'listing-images');

create policy "Authenticated users can upload listing images"
  on storage.objects for insert
  with check (bucket_id = 'listing-images' and auth.role() = 'authenticated');

create policy "Users can delete their own listing images"
  on storage.objects for delete
  using (bucket_id = 'listing-images' and auth.uid()::text = (storage.foldername(name))[1]);
