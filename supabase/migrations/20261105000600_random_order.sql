-- "Next player" always picks randomly. Rating, category and department are no
-- longer used by the app (columns kept, simply left empty).

alter table settings alter column player_order set default 'random';
update settings set player_order = 'random' where id = 1;
