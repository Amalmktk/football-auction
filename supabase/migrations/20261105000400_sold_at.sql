-- Record when each player was sold, for the "recently sold" ticker on the TV.
-- A trigger keeps it in sync with status, so sell / undo / reset need no changes.

alter table players add column sold_at timestamptz;

create or replace function players_set_sold_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'sold' and (tg_op = 'INSERT' or old.status is distinct from 'sold') then
    new.sold_at := now();
  elsif new.status <> 'sold' then
    new.sold_at := null;
  end if;
  return new;
end;
$$;

create trigger players_sold_at
  before insert or update of status on players
  for each row execute function players_set_sold_at();

update players set sold_at = now() where status = 'sold' and sold_at is null;
