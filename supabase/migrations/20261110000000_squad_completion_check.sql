-- Squad-completion guarantee for any mix of base prices.
--
-- Before: max_bid = purse - (slots still needed x lowest base price), plus a player-count
-- check (20261109000000). With mixed base prices a team could keep back enough for the
-- cheap players, watch other teams buy them, and be left unable to afford its minimum squad.
--
-- Now, for a bid by team T, imagine T wins the player on the block:
--   need_i   = slots team i still needs to reach min_squad (T's counts this player)
--   N        = sum of need_i;  fillers = the N cheapest players left in the pool
--   worst_i  = sum of the need_i MOST expensive fillers (team i's worst case)
-- The bid is allowed only if
--   * the pool has at least N players,
--   * every other team still has purse >= worst_i, and
--   * the bid <= T's purse - worst_T   (= T's max bid).
-- Because every team can afford any share of the fillers, whoever buys what, every team
-- can always complete its squad, and a team still short of the minimum can always buy
-- any filler at base price. With equal base prices this is the same as the old rule.

create or replace function bid_check(p_team_id uuid, out max_bid int, out others_short boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_min int;
  v_prices int[];
  v_fillers int[];
  v_total int;
  v_worst int;
  r record;
begin
  select min_squad into v_min from settings where id = 1;
  select coalesce(array_agg(base_price order by base_price), '{}') into v_prices
    from players where status in ('available', 'unsold');   -- the player on the block is excluded

  max_bid := 0;
  others_short := false;

  select coalesce(sum(greatest(v_min - coalesce(c.n, 0) - case when t.id = p_team_id then 1 else 0 end, 0)), 0)
    into v_total
    from teams t
    left join (select team_id, count(*)::int as n from players where team_id is not null group by team_id) c
      on c.team_id = t.id;

  if v_total > cardinality(v_prices) then
    others_short := true;
    return;
  end if;
  v_fillers := v_prices[1:v_total];

  for r in
    select t.id, t.purse_remaining,
           greatest(v_min - coalesce(c.n, 0) - case when t.id = p_team_id then 1 else 0 end, 0) as need
      from teams t
      left join (select team_id, count(*)::int as n from players where team_id is not null group by team_id) c
        on c.team_id = t.id
  loop
    select coalesce(sum(x), 0) into v_worst
      from (select x from unnest(v_fillers) as x order by x desc limit r.need) worst;
    if r.id = p_team_id then
      max_bid := r.purse_remaining - v_worst;
    elsif r.purse_remaining < v_worst then
      others_short := true;
    end if;
  end loop;
end;
$$;

-- kept for anything that still calls it
create or replace function team_max_bid(p_team_id uuid) returns int
language sql stable security definer set search_path = public as $$
  select max_bid from bid_check(p_team_id);
$$;

-- place_bid: same as 20261109000000_reserve_min_squads.sql, with the two reserve checks
-- replaced by bid_check().
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
  if p_amount <> v_next then
    raise exception 'Outbid: the current bid has changed';
  end if;

  -- every team must still be able to complete its minimum squad
  select * into v_check from bid_check(p_team_id);
  if v_check.others_short then
    raise exception 'Other teams still need players to reach the minimum squad';
  end if;
  if v_next > v_check.max_bid then
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

revoke execute on function bid_check(uuid) from public, anon;
grant execute on function bid_check(uuid) to authenticated;
