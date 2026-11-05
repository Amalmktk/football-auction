-- Admin management: an existing admin can promote another account (which has
-- signed up at /admin/signup) to admin, list admins, and remove admins.
-- No service-role key needed: these security-definer functions read auth.users.

create or replace function list_admins()
returns table (admin_id uuid, admin_email text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform assert_admin();
  return query
    select p.user_id, u.email::text
      from profiles p
      join auth.users u on u.id = p.user_id
     where p.role = 'admin'
     order by u.email;
end;
$$;

create or replace function add_admin(p_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
begin
  perform assert_admin();

  select u.id into v_user
    from auth.users u
   where lower(u.email) = lower(trim(p_email))
     and not coalesce(u.is_anonymous, false)
   limit 1;
  if v_user is null then
    raise exception 'No account with that email. Ask them to sign up at /admin/signup first.';
  end if;

  insert into profiles (user_id, role, team_id)
  values (v_user, 'admin', null)
  on conflict (user_id) do update set role = 'admin', team_id = null;

  perform log_action('add_admin', jsonb_build_object('user_id', v_user, 'email', lower(trim(p_email))));
  return v_user;
end;
$$;

create or replace function remove_admin(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_admin();
  if p_user_id = auth.uid() then
    raise exception 'You can''t remove yourself. Ask another admin.';
  end if;
  delete from profiles where user_id = p_user_id and role = 'admin';
  perform log_action('remove_admin', jsonb_build_object('user_id', p_user_id));
end;
$$;

revoke execute on function list_admins()        from public, anon;
revoke execute on function add_admin(text)      from public, anon;
revoke execute on function remove_admin(uuid)   from public, anon;
grant execute on function list_admins()         to authenticated;
grant execute on function add_admin(text)       to authenticated;
grant execute on function remove_admin(uuid)    to authenticated;
