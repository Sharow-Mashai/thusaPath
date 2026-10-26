-- Allow existing Supabase Auth accounts to be granted staff access regardless
-- of email domain. Only an active staff member can call this function.
create or replace function public.add_staff_member(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  staff_email text := lower(trim(coalesce(p_email, '')));
  target_id uuid;
begin
  if actor_id is null or not exists (
    select 1 from public.admin_users a where a.user_id = actor_id and a.active
  ) then
    raise exception 'Only active ThusaPath staff can add team members';
  end if;

  if staff_email = '' then
    raise exception 'Enter the email used for the existing ThusaPath account';
  end if;

  select u.id into target_id
    from auth.users u
    where lower(u.email) = staff_email
    limit 1;
  if target_id is null then
    raise exception 'No account exists for that email. Use an email that has already signed up to ThusaPath';
  end if;

  insert into public.admin_users (user_id, active)
    values (target_id, true)
    on conflict (user_id) do update set active = true;
end;
$$;
revoke all on function public.add_staff_member(text) from public;
grant execute on function public.add_staff_member(text) to authenticated;
