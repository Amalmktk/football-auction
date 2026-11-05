-- Football auction: tables, Row Level Security, and Realtime publication.
-- Matches section 6 of the project plan. Writes happen only through
-- security-definer functions (next migration); there are no write policies.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- tables

create table settings (
  id int primary key default 1 check (id = 1),                 -- single row
  tournament_name text not null default 'Company Football Auction',
  starting_purse int not null default 1000,
  min_squad int not null default 8,
  max_squad int not null default 10,
  bid_timer_seconds int not null default 20,
  mode text not null default 'auctioneer' check (mode in ('auctioneer', 'captain')),
  increments jsonb not null default '[{"upto": 200, "step": 10}, {"upto": null, "step": 20}]'
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text not null,
  color text not null default '#1f6feb',
  logo_url text,
  captain_name text,
  purse_remaining int not null check (purse_remaining >= 0)
);

create table team_codes (
  team_id uuid primary key references teams(id) on delete cascade,
  code_hash text not null
);

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'captain')),
  team_id uuid references teams(id)
);

create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department text,
  position text check (position in ('GK', 'DEF', 'MID', 'FWD')),
  rating int check (rating between 1 and 10),
  category text,                                               -- e.g. 'A', 'B', 'C'
  base_price int not null check (base_price > 0),
  photo_url text,
  is_captain boolean not null default false,
  status text not null default 'available'
    check (status in ('available', 'on_block', 'sold', 'unsold')),
  team_id uuid references teams(id),
  sold_price int,
  auction_order int
);

create table auction_state (
  id int primary key default 1 check (id = 1),                 -- single row
  status text not null default 'idle'
    check (status in ('idle', 'bidding', 'sold', 'unsold', 'paused', 'finished')),
  round text not null default 'main' check (round in ('main', 'reauction')),
  current_player_id uuid references players(id),
  current_bid int,
  leading_team_id uuid references teams(id),
  timer_ends_at timestamptz,
  updated_at timestamptz not null default now()
);

create table bids (
  id bigint generated always as identity primary key,
  player_id uuid not null references players(id),
  team_id uuid not null references teams(id),
  amount int not null,
  placed_by uuid references auth.users(id),
  undone boolean not null default false,
  created_at timestamptz not null default now()
);

create table action_log (
  id bigint generated always as identity primary key,
  action text not null,                    -- 'start', 'bid', 'sold', 'unsold', 'undo', 'pause'
  details jsonb not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index players_team_id_idx on players (team_id);
create index bids_player_id_idx on bids (player_id);

insert into settings default values;
insert into auction_state default values;

-- ---------------------------------------------------------------- row level security

alter table settings      enable row level security;
alter table teams         enable row level security;
alter table team_codes    enable row level security;
alter table profiles      enable row level security;
alter table players       enable row level security;
alter table auction_state enable row level security;
alter table bids          enable row level security;
alter table action_log    enable row level security;

-- public, read-only access to auction data
create policy "read settings" on settings      for select using (true);
create policy "read teams"    on teams         for select using (true);
create policy "read players"  on players       for select using (true);
create policy "read state"    on auction_state for select using (true);
create policy "read bids"     on bids          for select using (true);

-- users can read only their own profile
create policy "read own profile" on profiles for select using (auth.uid() = user_id);

-- No insert/update/delete policies: writes happen only inside security-definer
-- functions that check the caller's role. team_codes and action_log have no
-- select policy, so they are private.

-- ---------------------------------------------------------------- realtime

alter publication supabase_realtime add table auction_state, bids, players, teams, settings;
