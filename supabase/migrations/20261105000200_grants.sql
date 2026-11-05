-- Newer Supabase projects don't auto-grant table access to the API roles.
-- Grant only what the app needs; Row Level Security still decides which rows
-- each caller can read or change (public read, admin-only writes).
-- team_codes and action_log get no grants: they stay private.

grant usage on schema public to anon, authenticated;

grant select on settings, teams, players, auction_state, bids to anon, authenticated;
grant select on profiles to authenticated;

-- admin setup screens (RLS limits these to admins)
grant update on settings to authenticated;
grant insert, update, delete on teams, players to authenticated;
