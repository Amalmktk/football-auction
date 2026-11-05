-- Football auction: database functions (section 7 of the plan).
-- Every auction change goes through these security-definer functions, which
-- check the caller's role, lock the single auction_state row, validate the
-- rules, and log the action, all in one transaction.

-- ---------------------------------------------------------------- schema additions

alter table settings
  add column player_order text not null default 'manual'
    check (player_order in ('manual', 'category', 'random'));

alter table auction_state
  add column paused_status text,          -- status to return to on resume
  add column paused_remaining_ms int;     -- timer left when paused

alter table action_log
  add column undone boolean not null default false;

-- ---------------------------------------------------------------- helpers

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where user_id = auth.uid() and role = 'admin');
$$;

create or replace function assert_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Not allowed: admin only';
  end if;
end;
$$;

-- Increment for the next bid, from settings.increments, e.g.
-- [{"upto": 200, "step": 10}, {"upto": null, "step": 20}] => +10 below 200, +20 from 200.
create or replace function next_increment(p_bid int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((
    select (e.inc->>'step')::int
      from settings s, jsonb_array_elements(s.increments) with ordinality as e(inc, ord)
     where s.id = 1
       and (e.inc->>'upto' is null or p_bid < (e.inc->>'upto')::int)
     order by e.ord
     limit 1
  ), 10);
$$;

-- max_bid = purse_remaining - (min_squad - current_squad - 1) * lowest_base_price
create or replace function team_max_bid(p_team_id uuid) returns int
language sql stable security definer set search_path = public as $$
  select t.purse_remaining
         - greatest(cfg.min_squad - (select count(*) from players p where p.team_id = t.id)::int - 1, 0)
           * coalesce((select min(base_price) from players where status in ('available', 'unsold')), 0)
    from teams t, settings cfg
   where t.id = p_team_id and cfg.id = 1;
$$;

-- Server clock, so screens can correct for device clock differences.
create or replace function server_time() returns timestamptz
language sql stable as $$
  select now();
$$;

create or replace function log_action(p_action text, p_details jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  insert into action_log (action, details, created_by)
  values (p_action, p_details, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Put auction_state back to a snapshot taken by to_jsonb(auction_state row).
-- A restored 'bidding' state gets a fresh timer.
create or replace function restore_state(p_snapshot jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  r auction_state%rowtype;
  cfg settings%rowtype;
begin
  r := jsonb_populate_record(null::auction_state, p_snapshot);
  select * into cfg from settings where id = 1;
  update auction_state
     set status = r.status,
         round = r.round,
         current_player_id = r.current_player_id,
         current_bid = r.current_bid,
         leading_team_id = r.leading_team_id,
         timer_ends_at = case when r.status = 'bidding'
                              then now() + make_interval(secs => cfg.bid_timer_seconds) end,
         paused_status = null,
         paused_remaining_ms = null,
         updated_at = now()
   where id = 1;
end;
$$;

-- ---------------------------------------------------------------- captains

-- Captain enters a team code on their phone (anonymous session). Links the
-- session to that team.
create or replace function join_team(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;

  select tc.team_id into v_team
    from team_codes tc
   where tc.code_hash = extensions.crypt(upper(trim(p_code)), tc.code_hash)
   limit 1;
  if v_team is null then
    raise exception 'Invalid team code';
  end if;

  select role into v_role from profiles where user_id = auth.uid();
  if v_role = 'admin' then
    raise exception 'Admins do not need a team code';
  end if;

  insert into profiles (user_id, role, team_id)
  values (auth.uid(), 'captain', v_team)
  on conflict (user_id) do update set role = 'captain', team_id = excluded.team_id;

  return v_team;
end;
$$;

-- Admin generates (or resets) a team's join code, e.g. TIGER-4F7K.
-- Returns the plain code once; only its hash is stored. Phones that joined
-- with the old code lose access.
create or replace function set_team_code(p_team_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_prefix text;
  v_suffix text := '';
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- no 0/O, 1/I/L
  v_bytes bytea := extensions.gen_random_bytes(4);
  v_code text;
  i int;
begin
  perform assert_admin();

  select upper(regexp_replace(short_name, '[^A-Za-z0-9]', '', 'g')) into v_prefix
    from teams where id = p_team_id;
  if not found then
    raise exception 'Team not found';
  end if;
  if v_prefix is null or v_prefix = '' then
    v_prefix := 'TEAM';
  end if;

  for i in 0..3 loop
    v_suffix := v_suffix || substr(v_alphabet, 1 + get_byte(v_bytes, i) % length(v_alphabet), 1);
  end loop;
  v_code := v_prefix || '-' || v_suffix;

  insert into team_codes (team_id, code_hash)
  values (p_team_id, extensions.crypt(v_code, extensions.gen_salt('bf')))
  on conflict (team_id) do update set code_hash = excluded.code_hash;

  delete from profiles where role = 'captain' and team_id = p_team_id;

  return v_code;
end;
$$;

-- ---------------------------------------------------------------- auction flow

-- Put a player up for bidding.
create or replace function start_player(p_player_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  s auction_state%rowtype;
  cfg settings%rowtype;
  p players%rowtype;
begin
  perform assert_admin();
  select * into s from auction_state where id = 1 for update;
  select * into cfg from settings where id = 1;

  if s.status = 'paused' then
    raise exception 'Auction is paused';
  end if;
  if s.status = 'bidding' then
    raise exception 'Finish the current player first (SOLD or UNSOLD)';
  end if;

  select * into p from players where id = p_player_id for update;
  if not found then
    raise exception 'Player not found';
  end if;
  if p.status not in ('available', 'unsold') then
    raise exception 'Player is not available';
  end if;

  update players set status = 'on_block' where id = p.id;

  perform log_action('start', jsonb_build_object(
    'player_id', p.id, 'player_prev_status', p.status, 'prev_state', to_jsonb(s)));

  update auction_state
     set status = 'bidding',
         round = case when p.status = 'unsold' then 'reauction' else 'main' end,
         current_player_id = p.id,
         current_bid = null,
         leading_team_id = null,
         timer_ends_at = now() + make_interval(secs => cfg.bid_timer_seconds),
         paused_status = null,
         paused_remaining_ms = null,
         updated_at = now()
   where id = 1;
end;
$$;

-- Pick the next player by settings.player_order and start them.
-- Available players first; then unsold ones (re-auction round).
-- Returns the player id, or null when nobody is left (auction finished).
create or replace function next_player() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s auction_state%rowtype;
  cfg settings%rowtype;
  v_status text;
  v_id uuid;
begin
  perform assert_admin();
  select * into s from auction_state where id = 1 for update;
  select * into cfg from settings where id = 1;

  if s.status in ('bidding', 'paused') then
    raise exception 'Finish the current player first (SOLD or UNSOLD)';
  end if;

  foreach v_status in array array['available', 'unsold'] loop
    select id into v_id
      from players
     where status = v_status and not is_captain
     order by
       case when cfg.player_order = 'category' then category end nulls last,
       case when cfg.player_order = 'category' then rating end desc nulls last,
       case when cfg.player_order = 'random' then random() end,
       auction_order nulls last,
       name
     limit 1;
    exit when v_id is not null;
  end loop;

  if v_id is null then
    update auction_state
       set status = 'finished', current_player_id = null, current_bid = null,
           leading_team_id = null, timer_ends_at = null, updated_at = now()
     where id = 1;
    perform log_action('finished', '{}');
    return null;
  end if;

  perform start_player(v_id);
  return v_id;
end;
$$;

-- Place a bid. Admin: any team (auctioneer mode, or any mode). Captain: own team, captain mode only.
create or replace function place_bid(p_team_id uuid, p_amount int) returns int
language plpgsql security definer set search_path = public as $$
declare
  s auction_state%rowtype;
  cfg settings%rowtype;
  v_role text;
  v_my_team uuid;
  v_squad int;
  v_next int;
  v_bid_id bigint;
begin
  -- lock the auction state so bids are processed one at a time
  select * into s from auction_state where id = 1 for update;
  select * into cfg from settings where id = 1;

  if s.status <> 'bidding' or s.timer_ends_at is null or now() > s.timer_ends_at then
    raise exception 'Bidding is closed';
  end if;

  select role, team_id into v_role, v_my_team from profiles where user_id = auth.uid();
  if v_role is null then
    raise exception 'Not allowed';
  end if;
  if v_role = 'captain' and cfg.mode <> 'captain' then
    raise exception 'Captain bidding is turned off';
  end if;
  if v_role = 'captain' and v_my_team is distinct from p_team_id then
    raise exception 'You can only bid for your own team';
  end if;

  if not exists (select 1 from teams where id = p_team_id) then
    raise exception 'Team not found';
  end if;
  if s.leading_team_id = p_team_id then
    raise exception 'Your team is already the highest bidder';
  end if;

  select count(*) into v_squad from players where team_id = p_team_id;
  if v_squad >= cfg.max_squad then
    raise exception 'Squad is full';
  end if;

  -- the only valid amount right now
  if s.current_bid is null then
    select base_price into v_next from players where id = s.current_player_id;
  else
    v_next := s.current_bid + next_increment(s.current_bid);
  end if;
  if v_next is null then
    raise exception 'No player on the block';
  end if;
  if p_amount <> v_next then
    raise exception 'Outbid: the current bid has changed';
  end if;

  -- keep enough purse to complete the minimum squad
  if v_next > team_max_bid(p_team_id) then
    raise exception 'Not enough purse for this bid';
  end if;

  insert into bids (player_id, team_id, amount, placed_by)
  values (s.current_player_id, p_team_id, v_next, auth.uid())
  returning id into v_bid_id;

  perform log_action('bid', jsonb_build_object(
    'bid_id', v_bid_id, 'player_id', s.current_player_id, 'team_id', p_team_id,
    'amount', v_next, 'prev_state', to_jsonb(s)));

  update auction_state
     set current_bid = v_next,
         leading_team_id = p_team_id,
         timer_ends_at = now() + make_interval(secs => cfg.bid_timer_seconds),
         updated_at = now()
   where id = 1;

  return v_next;
end;
$$;

-- SOLD: assign the player to the leading team and deduct the purse.
create or replace function sell_current() returns void
language plpgsql security definer set search_path = public as $$
declare
  s auction_state%rowtype;
begin
  perform assert_admin();
  select * into s from auction_state where id = 1 for update;

  if s.status <> 'bidding' then
    raise exception 'No player is up for bidding';
  end if;
  if s.current_bid is null or s.leading_team_id is null then
    raise exception 'No bids yet: mark UNSOLD instead';
  end if;

  update players
     set status = 'sold', team_id = s.leading_team_id, sold_price = s.current_bid
   where id = s.current_player_id;

  update teams set purse_remaining = purse_remaining - s.current_bid
   where id = s.leading_team_id;

  perform log_action('sold', jsonb_build_object(
    'player_id', s.current_player_id, 'team_id', s.leading_team_id,
    'amount', s.current_bid, 'prev_state', to_jsonb(s)));

  update auction_state
     set status = 'sold', timer_ends_at = null, updated_at = now()
   where id = 1;
end;
$$;

-- UNSOLD: player goes to the unsold pool for the re-auction round.
create or replace function mark_unsold() returns void
language plpgsql security definer set search_path = public as $$
declare
  s auction_state%rowtype;
begin
  perform assert_admin();
  select * into s from auction_state where id = 1 for update;

  if s.status <> 'bidding' then
    raise exception 'No player is up for bidding';
  end if;

  update players set status = 'unsold' where id = s.current_player_id;

  perform log_action('unsold', jsonb_build_object(
    'player_id', s.current_player_id, 'prev_state', to_jsonb(s)));

  update auction_state
     set status = 'unsold', current_bid = null, leading_team_id = null,
         timer_ends_at = null, updated_at = now()
   where id = 1;
end;
$$;

-- Undo the most recent start / bid / sold / unsold, one step at a time.
-- Returns the action that was undone.
create or replace function undo_last() returns text
language plpgsql security definer set search_path = public as $$
declare
  s auction_state%rowtype;
  l action_log%rowtype;
  v_player uuid;
begin
  perform assert_admin();
  select * into s from auction_state where id = 1 for update;

  if s.status = 'paused' then
    raise exception 'Resume the auction before undoing';
  end if;

  select * into l from action_log
   where not undone and action in ('start', 'bid', 'sold', 'unsold')
   order by id desc
   limit 1
   for update;
  if not found then
    raise exception 'Nothing to undo';
  end if;

  v_player := (l.details->>'player_id')::uuid;

  case l.action
    when 'bid' then
      update bids set undone = true where id = (l.details->>'bid_id')::bigint;
    when 'sold' then
      update players set status = 'on_block', team_id = null, sold_price = null where id = v_player;
      update teams set purse_remaining = purse_remaining + (l.details->>'amount')::int
       where id = (l.details->>'team_id')::uuid;
    when 'unsold' then
      update players set status = 'on_block' where id = v_player;
    when 'start' then
      update players set status = l.details->>'player_prev_status' where id = v_player;
  end case;

  perform restore_state(l.details->'prev_state');

  update action_log set undone = true where id = l.id;
  perform log_action('undo', jsonb_build_object('undone_id', l.id, 'undone_action', l.action));

  return l.action;
end;
$$;

-- ---------------------------------------------------------------- pause, timer, reset

create or replace function pause() returns void
language plpgsql security definer set search_path = public as $$
declare
  s auction_state%rowtype;
begin
  perform assert_admin();
  select * into s from auction_state where id = 1 for update;
  if s.status = 'paused' then
    raise exception 'Already paused';
  end if;

  update auction_state
     set paused_status = s.status,
         paused_remaining_ms = case when s.status = 'bidding' and s.timer_ends_at is not null
           then greatest(0, (extract(epoch from (s.timer_ends_at - now())) * 1000)::int) end,
         status = 'paused',
         timer_ends_at = null,
         updated_at = now()
   where id = 1;

  perform log_action('pause', '{}');
end;
$$;

create or replace function resume() returns void
language plpgsql security definer set search_path = public as $$
declare
  s auction_state%rowtype;
begin
  perform assert_admin();
  select * into s from auction_state where id = 1 for update;
  if s.status <> 'paused' then
    raise exception 'Auction is not paused';
  end if;

  update auction_state
     set status = coalesce(s.paused_status, 'idle'),
         timer_ends_at = case when s.paused_status = 'bidding'
           then now() + make_interval(secs => coalesce(s.paused_remaining_ms, 0) / 1000.0) end,
         paused_status = null,
         paused_remaining_ms = null,
         updated_at = now()
   where id = 1;

  perform log_action('resume', '{}');
end;
$$;

-- Restart the countdown for the current player (e.g. timer ran out but the room wants more time).
create or replace function reset_timer() returns void
language plpgsql security definer set search_path = public as $$
declare
  s auction_state%rowtype;
  cfg settings%rowtype;
begin
  perform assert_admin();
  select * into s from auction_state where id = 1 for update;
  select * into cfg from settings where id = 1;
  if s.status <> 'bidding' then
    raise exception 'No player is up for bidding';
  end if;

  update auction_state
     set timer_ends_at = now() + make_interval(secs => cfg.bid_timer_seconds), updated_at = now()
   where id = 1;

  perform log_action('timer_reset', '{}');
end;
$$;

-- Clear all bids and history, return non-captain players to the pool,
-- restore purses, and reset the auction state. Teams, players, and codes stay.
create or replace function reset_auction() returns void
language plpgsql security definer set search_path = public as $$
declare
  cfg settings%rowtype;
begin
  perform assert_admin();
  perform 1 from auction_state where id = 1 for update;
  select * into cfg from settings where id = 1;

  update auction_state
     set status = 'idle', round = 'main', current_player_id = null, current_bid = null,
         leading_team_id = null, timer_ends_at = null, paused_status = null,
         paused_remaining_ms = null, updated_at = now()
   where id = 1;

  delete from bids where true;
  delete from action_log where true;

  update players set status = 'available', team_id = null, sold_price = null
   where not is_captain;

  update teams t
     set purse_remaining = cfg.starting_purse - coalesce(
       (select sum(p.sold_price) from players p where p.team_id = t.id and p.is_captain), 0)
   where true;

  perform log_action('reset', '{}');
end;
$$;

-- ---------------------------------------------------------------- permissions

-- Internal helpers: not callable from the API at all.
revoke execute on function log_action(text, jsonb) from public, anon, authenticated;
revoke execute on function restore_state(jsonb)    from public, anon, authenticated;
revoke execute on function assert_admin()          from public, anon;

-- Read-only helpers: anyone (TV, results, captains) may call.
grant execute on function is_admin()           to anon, authenticated;
grant execute on function next_increment(int)  to anon, authenticated;
grant execute on function team_max_bid(uuid)   to anon, authenticated;
grant execute on function server_time()        to anon, authenticated;

-- Write functions: signed-in users only; each checks the role itself.
-- (Anonymous captain sessions use the authenticated role.)
revoke execute on function join_team(text)        from public, anon;
revoke execute on function set_team_code(uuid)    from public, anon;
revoke execute on function start_player(uuid)     from public, anon;
revoke execute on function next_player()          from public, anon;
revoke execute on function place_bid(uuid, int)   from public, anon;
revoke execute on function sell_current()         from public, anon;
revoke execute on function mark_unsold()          from public, anon;
revoke execute on function undo_last()            from public, anon;
revoke execute on function pause()                from public, anon;
revoke execute on function resume()               from public, anon;
revoke execute on function reset_timer()          from public, anon;
revoke execute on function reset_auction()        from public, anon;

grant execute on function join_team(text)         to authenticated;
grant execute on function set_team_code(uuid)     to authenticated;
grant execute on function start_player(uuid)      to authenticated;
grant execute on function next_player()           to authenticated;
grant execute on function place_bid(uuid, int)    to authenticated;
grant execute on function sell_current()          to authenticated;
grant execute on function mark_unsold()           to authenticated;
grant execute on function undo_last()             to authenticated;
grant execute on function pause()                 to authenticated;
grant execute on function resume()                to authenticated;
grant execute on function reset_timer()           to authenticated;
grant execute on function reset_auction()         to authenticated;

-- ---------------------------------------------------------------- admin setup screens

-- Admins edit settings, teams, and players directly from the setup screens.
-- Everyone else stays read-only. Auction changes still go through the functions above.
create policy "admin update settings" on settings
  for update to authenticated using (is_admin()) with check (is_admin());
create policy "admin write teams" on teams
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin write players" on players
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------- storage (player photos, team logos)

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy "admin upload photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos' and public.is_admin());
create policy "admin update photos" on storage.objects
  for update to authenticated using (bucket_id = 'photos' and public.is_admin());
create policy "admin delete photos" on storage.objects
  for delete to authenticated using (bucket_id = 'photos' and public.is_admin());
