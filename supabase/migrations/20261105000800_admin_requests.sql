-- Admin access requests: accounts that signed up at /admin/signup but aren't
-- admins yet. Admins can approve (make admin) or decline (delete the account).
-- Anonymous captain sessions are never listed.

create or replace function list_admin_requests()
returns table (request_id uuid, request_email text, requested_at timestamptz, email_confirmed boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform assert_admin();
  return query
    select u.id, u.email::text, u.created_at, u.email_confirmed_at is not null
      from auth.users u
     where not coalesce(u.is_anonymous, false)
       and u.email is not null
       and not exists (select 1 from profiles p where p.user_id = u.id and p.role = 'admin')
     order by u.created_at desc;
end;
$$;

create or replace function approve_admin_request(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_admin();
  if not exists (select 1 from auth.users u where u.id = p_user_id and not coalesce(u.is_anonymous, false)) then
    raise exception 'Account not found';
  end if;
  insert into profiles (user_id, role, team_id)
  values (p_user_id, 'admin', null)
  on conflict (user_id) do update set role = 'admin', team_id = null;
  perform log_action('add_admin', jsonb_build_object('user_id', p_user_id));
end;
$$;

-- Declining deletes the account, so the email can sign up again later if needed.
create or replace function decline_admin_request(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_admin();
  if exists (select 1 from profiles where user_id = p_user_id and role = 'admin') then
    raise exception 'That account is already an admin. Remove it from the admin list instead.';
  end if;
  delete from auth.users u where u.id = p_user_id and not coalesce(u.is_anonymous, false);
  perform log_action('decline_admin', jsonb_build_object('user_id', p_user_id));
end;
$$;

revoke execute on function list_admin_requests()          from public, anon;
revoke execute on function approve_admin_request(uuid)    from public, anon;
revoke execute on function decline_admin_request(uuid)    from public, anon;
grant execute on function list_admin_requests()           to authenticated;
grant execute on function approve_admin_request(uuid)     to authenticated;
grant execute on function decline_admin_request(uuid)     to authenticated;
