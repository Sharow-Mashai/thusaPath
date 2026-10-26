-- Trust and moderation workflow for pilot use.
alter table public.organisations
  add column if not exists verification_method text,
  add column if not exists verification_notes text,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references auth.users(id) on delete set null;

create table if not exists public.organisation_verification_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  status text not null check (status in ('verified','rejected')),
  method text,
  notes text not null check (length(trim(notes)) >= 15),
  reviewed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.opportunity_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null,
  listing_title text not null,
  organisation_name text not null,
  source_name text,
  application_host text,
  reason text not null check (reason in ('They asked me to pay money','They asked for private details too soon','The message or interview place seems wrong','Something else')),
  note text not null default '' check (length(note) <= 400),
  status text not null default 'open' check (status in ('open','in_review','resolved','dismissed')),
  reporter_id uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists opportunity_reports_status_created_idx
  on public.opportunity_reports(status, created_at desc);
create index if not exists organisation_verification_events_org_created_idx
  on public.organisation_verification_events(organisation_id, created_at desc);

alter table public.organisation_verification_events enable row level security;
alter table public.opportunity_reports enable row level security;

drop policy if exists "Organisation details are not public" on public.organisations;
drop policy if exists "Visitors can read currently verified organisation details" on public.organisations;
create policy "Visitors can read currently verified organisation details"
  on public.organisations for select to anon, authenticated
  using (status = 'verified' and verified_until >= current_date);
drop policy if exists "Staff can read organisation verification records" on public.organisations;
create policy "Staff can read organisation verification records"
  on public.organisations for select to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.active));
drop policy if exists "Staff can create organisation verification records" on public.organisations;
create policy "Staff can create organisation verification records"
  on public.organisations for insert to authenticated
  with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.active));

drop policy if exists "Staff can read verification review history" on public.organisation_verification_events;
create policy "Staff can read verification review history"
  on public.organisation_verification_events for select to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.active));

drop policy if exists "Signed-in users can report an opportunity" on public.opportunity_reports;
create policy "Signed-in users can report an opportunity"
  on public.opportunity_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
drop policy if exists "Staff can review opportunity reports" on public.opportunity_reports;
create policy "Staff can review opportunity reports"
  on public.opportunity_reports for select to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.active));
drop policy if exists "Staff can update opportunity report status" on public.opportunity_reports;
create policy "Staff can update opportunity report status"
  on public.opportunity_reports for update to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.active))
  with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.active));

revoke all on public.organisation_verification_events from anon, public;
grant select on public.organisation_verification_events to authenticated;
revoke all on public.opportunity_reports from anon, public;
grant insert on public.opportunity_reports to authenticated;
grant select, update (status, reviewed_by, reviewed_at) on public.opportunity_reports to authenticated;
revoke all on public.organisations from anon, public, authenticated;
grant select (id, name, status, verified_until, verification_method, verified_at) on public.organisations to anon, authenticated;
grant insert (name, registration_number) on public.organisations to authenticated;

create or replace function public.staff_organisation_queue()
returns table (
  id uuid, name text, registration_number text, status text,
  verified_until date, verification_method text, verification_notes text, verified_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.active) then
    raise exception 'Staff access is required to view this queue';
  end if;
  return query select o.id, o.name, o.registration_number, o.status, o.verified_until,
    o.verification_method, o.verification_notes, o.verified_at
    from public.organisations o order by o.created_at desc;
end;
$$;
revoke all on function public.staff_organisation_queue() from public;
grant execute on function public.staff_organisation_queue() to authenticated;

create or replace function public.review_organisation(
  p_organisation_id uuid,
  p_status text,
  p_method text,
  p_notes text,
  p_verified_until date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null or not exists (
    select 1 from public.admin_users a where a.user_id = actor_id and a.active
  ) then
    raise exception 'Staff access is required to review an organisation';
  end if;
  if p_status not in ('verified','rejected') then
    raise exception 'Choose verified or rejected';
  end if;
  if p_notes is null or length(trim(p_notes)) < 15 then
    raise exception 'Add a short note describing the checks completed';
  end if;
  if p_status = 'verified' and (p_method is null or length(trim(p_method)) < 3 or p_verified_until is null or p_verified_until < current_date) then
    raise exception 'A verification method and current expiry date are required';
  end if;

  update public.organisations
    set status = p_status,
        verification_method = case when p_status = 'verified' then trim(p_method) else null end,
        verification_notes = trim(p_notes),
        verified_until = case when p_status = 'verified' then p_verified_until else null end,
        verified_at = now(),
        verified_by = actor_id
    where id = p_organisation_id;
  if not found then raise exception 'Organisation was not found'; end if;

  insert into public.organisation_verification_events (organisation_id,status,method,notes,reviewed_by)
    values (p_organisation_id,p_status,nullif(trim(coalesce(p_method,'')),''),trim(p_notes),actor_id);
end;
$$;
revoke all on function public.review_organisation(uuid,text,text,text,date) from public;
grant execute on function public.review_organisation(uuid,text,text,text,date) to authenticated;
