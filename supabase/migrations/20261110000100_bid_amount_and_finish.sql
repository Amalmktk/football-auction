-- 1. place_bid: a NULL p_amount slipped past `p_amount <> v_next` (NULL comparison is not
--    true), which would accept a "whatever the next bid is" blind bid. Use IS DISTINCT FROM.
--    Also a clearer message when a bid is above the team's maximum.
-- 2. finish_auction(): lets the admin end the auction while unsold players remain
--    (e.g. 7/7/7 with one leftover nobody can or wants to buy). Without it, "Next player"
--    re-serves the leftover forever and the TV/phones never show "Auction complete".
--    "Put a specific player up" still works afterwards if they change their minds.

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
  v_check record;
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
  if cfg.max_squad is not null and v_squad >= cfg.max_squad then
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
  if p_amount is distinct from v_next then
    raise exception 'Outbid: the current bid has changed';
  end if;

  -- every team must still be able to complete its minimum squad
  select * into v_check from bid_check(p_team_id);
  if v_check.others_short then
    raise exception 'Other teams still need players to reach the minimum squad';
  end if;
  if v_next > v_check.max_bid then
    raise exception 'Above your maximum bid of %: you must keep enough purse for the rest of your squad', v_check.max_bid;
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

create or replace function finish_auction() returns void
language plpgsql security definer set search_path = public as $$
declare
  s auction_state%rowtype;
begin
  perform assert_admin();
  select * into s from auction_state where id = 1 for update;
  if s.status in ('bidding', 'paused') then
    raise exception 'Finish the current player first (SOLD or UNSOLD)';
  end if;

  update auction_state
     set status = 'finished', current_player_id = null, current_bid = null,
         leading_team_id = null, timer_ends_at = null, paused_status = null,
         paused_remaining_ms = null, updated_at = now()
   where id = 1;

  perform log_action('finished', jsonb_build_object('manual', true,
    'left_in_pool', (select count(*) from players where status in ('available', 'unsold'))));
end;
$$;

revoke execute on function finish_auction() from public, anon;
grant execute on function finish_auction() to authenticated;
