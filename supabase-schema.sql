create type community_type as enum ('private', 'public');
create type market_status as enum ('pending_approval', 'live', 'closed', 'resolved', 'disputed');
create type resolver_mode as enum ('community_vote', 'creator', 'third_party', 'app_approved');
create type contract_side as enum ('yes', 'no');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null,
  display_name text not null,
  credits integer not null default 1000,
  login_streak integer not null default 0,
  win_count integer not null default 0,
  loss_count integer not null default 0,
  pnl integer not null default 0,
  created_at timestamptz not null default now()
);

create table communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type community_type not null,
  creator_id uuid not null references profiles(id),
  creation_cost integer not null,
  season_pot integer not null default 0,
  requires_market_approval boolean not null default false,
  created_at timestamptz not null default now()
);

create table community_members (
  community_id uuid references communities(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (community_id, profile_id)
);

create table markets (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  creator_id uuid not null references profiles(id),
  title text not null,
  description text not null,
  status market_status not null default 'live',
  resolver_mode resolver_mode not null,
  third_party_resolver_id uuid references profiles(id),
  close_at timestamptz not null,
  yes_price integer not null default 50 check (yes_price between 1 and 99),
  no_price integer generated always as (100 - yes_price) stored,
  volume integer not null default 0,
  created_at timestamptz not null default now()
);

create table positions (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  side contract_side not null,
  shares numeric not null default 0,
  average_price integer not null,
  unique (market_id, profile_id, side)
);

create table trades (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  side contract_side not null,
  credits integer not null,
  price integer not null,
  created_at timestamptz not null default now()
);

create table resolutions (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets(id) on delete cascade,
  resolver_id uuid references profiles(id),
  outcome contract_side not null,
  vote_yes integer not null default 0,
  vote_no integer not null default 0,
  finalized_at timestamptz
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references markets(id) on delete cascade,
  reporter_id uuid not null references profiles(id),
  accused_id uuid references profiles(id),
  reason text not null,
  confirmed boolean,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id),
  recipient_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table cosmetics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price integer not null,
  kind text not null
);

create table profile_cosmetics (
  profile_id uuid references profiles(id) on delete cascade,
  cosmetic_id uuid references cosmetics(id) on delete cascade,
  equipped boolean not null default false,
  purchased_at timestamptz not null default now(),
  primary key (profile_id, cosmetic_id)
);
