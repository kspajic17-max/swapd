create table public.messages (
  id uuid primary key default gen_random_uuid(),
  interest_id uuid not null references public.swap_interests on delete cascade,
  sender_id uuid not null references public.profiles on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

create index idx_messages_interest on public.messages (interest_id);

alter table public.messages enable row level security;

create policy "Users can see messages for their swaps"
  on public.messages for select
  using (
    exists (
      select 1 from public.swap_interests si
      join public.listings l on l.id = si.listing_id
      where si.id = interest_id
        and (si.interested_user_id = auth.uid() or l.user_id = auth.uid())
    )
  );

create policy "Users can send messages in their swaps"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.swap_interests si
      join public.listings l on l.id = si.listing_id
      where si.id = interest_id
        and (si.interested_user_id = auth.uid() or l.user_id = auth.uid())
    )
  );
