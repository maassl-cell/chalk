-- Chalk app persistence migration.
-- Run this after the original supabase-schema.sql.

alter table profiles alter column credits set default 0;
alter table profiles add column if not exists email text unique;
alter table profiles add column if not exists last_credit_claim_at timestamptz;

alter table communities add column if not exists logo_kind text not null default 'emoji';
alter table communities add column if not exists logo_value text not null default '🏠';

alter table markets alter column community_id drop not null;
alter table markets add column if not exists yes_pool integer not null default 50;
alter table markets add column if not exists no_pool integer not null default 50;
alter table markets add column if not exists seed_pool integer not null default 100;
alter table markets add column if not exists traders integer not null default 0;
alter table markets add column if not exists outcome contract_side;
alter table markets add column if not exists history integer[] not null default '{}';
alter table markets add column if not exists creator_name text not null default 'Chalk user';
alter table markets add column if not exists community_name text not null default 'No community';
alter table markets add column if not exists third_party_resolver_name text;
alter table markets alter column description set default 'Created from Chalk.';

alter table positions add column if not exists amount integer not null default 0;
alter table positions add column if not exists payout integer not null default 0;
alter table positions add column if not exists final_payout integer;
alter table positions add column if not exists profit integer;
alter table positions add column if not exists status market_status not null default 'live';
alter table positions add column if not exists outcome contract_side;
alter table positions add column if not exists title_snapshot text not null default '';
alter table positions add column if not exists community_snapshot text not null default 'No community';
alter table positions add column if not exists created_at timestamptz not null default now();
alter table positions drop constraint if exists positions_market_id_profile_id_side_key;

create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  friend_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owner_id, friend_id)
);

create table if not exists market_sends (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (market_id, sender_id, recipient_id)
);

create table if not exists community_messages (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  market_id uuid references markets(id) on delete set null,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists market_votes (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets(id) on delete cascade,
  voter_id uuid not null references profiles(id) on delete cascade,
  vote contract_side not null,
  created_at timestamptz not null default now(),
  unique (market_id, voter_id)
);

alter table profiles enable row level security;
alter table communities enable row level security;
alter table community_members enable row level security;
alter table markets enable row level security;
alter table positions enable row level security;
alter table trades enable row level security;
alter table resolutions enable row level security;
alter table reports enable row level security;
alter table messages enable row level security;
alter table cosmetics enable row level security;
alter table profile_cosmetics enable row level security;
alter table friendships enable row level security;
alter table market_sends enable row level security;
alter table community_messages enable row level security;
alter table market_votes enable row level security;

drop policy if exists "Users can read profiles" on profiles;
create policy "Users can read profiles" on profiles for select to authenticated using (true);
drop policy if exists "Users can create own profile" on profiles;
create policy "Users can create own profile" on profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile" on profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Users can read own friendships" on friendships;
create policy "Users can read own friendships" on friendships for select to authenticated using (auth.uid() = owner_id);
drop policy if exists "Users can create own friendships" on friendships;
create policy "Users can create own friendships" on friendships for insert to authenticated with check (auth.uid() = owner_id);
drop policy if exists "Users can delete own friendships" on friendships;
create policy "Users can delete own friendships" on friendships for delete to authenticated using (auth.uid() = owner_id);

drop policy if exists "Users can read market sends" on market_sends;
create policy "Users can read market sends" on market_sends for select to authenticated using (auth.uid() = sender_id or auth.uid() = recipient_id);
drop policy if exists "Users can send markets" on market_sends;
create policy "Users can send markets" on market_sends for insert to authenticated with check (auth.uid() = sender_id);

drop policy if exists "Authenticated users can read communities" on communities;
create policy "Authenticated users can read communities" on communities for select to authenticated using (true);
drop policy if exists "Authenticated users can create communities" on communities;
create policy "Authenticated users can create communities" on communities for insert to authenticated with check (auth.uid() = creator_id);
drop policy if exists "Authenticated users can read community members" on community_members;
create policy "Authenticated users can read community members" on community_members for select to authenticated using (true);
drop policy if exists "Authenticated users can join communities" on community_members;
create policy "Authenticated users can join communities" on community_members for insert to authenticated with check (
  auth.uid() = profile_id
  or exists (
    select 1
    from communities
    where communities.id = community_members.community_id
      and communities.creator_id = auth.uid()
  )
);

drop policy if exists "Authenticated users can read community messages" on community_messages;
create policy "Authenticated users can read community messages" on community_messages for select to authenticated using (true);
drop policy if exists "Authenticated users can create community messages" on community_messages;
create policy "Authenticated users can create community messages" on community_messages for insert to authenticated with check (auth.uid() = sender_id);

drop policy if exists "Authenticated users can read market votes" on market_votes;
create policy "Authenticated users can read market votes" on market_votes for select to authenticated using (true);
drop policy if exists "Authenticated users can create market votes" on market_votes;
create policy "Authenticated users can create market votes" on market_votes for insert to authenticated with check (auth.uid() = voter_id);
drop policy if exists "Authenticated users can update own market votes" on market_votes;
create policy "Authenticated users can update own market votes" on market_votes for update to authenticated using (auth.uid() = voter_id) with check (auth.uid() = voter_id);

drop policy if exists "Authenticated users can read markets" on markets;
create policy "Authenticated users can read markets" on markets for select to authenticated using (true);
drop policy if exists "Authenticated users can create markets" on markets;
create policy "Authenticated users can create markets" on markets for insert to authenticated with check (auth.uid() = creator_id);
drop policy if exists "Creators can update markets" on markets;
create policy "Creators can update markets" on markets for update to authenticated using (true) with check (true);

drop policy if exists "Users can read positions" on positions;
create policy "Users can read positions" on positions for select to authenticated using (true);
drop policy if exists "Users can create own positions" on positions;
create policy "Users can create own positions" on positions for insert to authenticated with check (auth.uid() = profile_id);
drop policy if exists "Users can update positions" on positions;
create policy "Users can update positions" on positions for update to authenticated using (true) with check (true);
