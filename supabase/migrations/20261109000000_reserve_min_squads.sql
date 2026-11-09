-- Reserve rule: a team may only bid if, after winning the player on the block, the
-- players still in the pool are enough for every team to reach min_squad.
-- Example (3 teams, 22 players incl. captains, min 7, max 8): only one team can reach 8,
-- because two teams of 8 would leave the third with 6.

-- place_bid: same as 20261105000500_optional_max_squad.sql, plus the reserve check.
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
  v_pool int;
  v_need int;
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

  -- reserve: players left after this one (the one on the block is not in the pool)
  -- must cover every team's shortfall to min_squad, counting this player for p_team_id
  select count(*) into v_pool from players where status in ('available', 'unsold');
  select coalesce(sum(greatest(
           cfg.min_squad
           - (select count(*) from players p where p.team_id = t.id)::int
           - case when t.id = p_team_id then 1 else 0 end,
           0)), 0)
    into v_need
    from teams t;
  if v_need > v_pool then
    raise exception 'Other teams still need players to reach the minimum squad';
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
