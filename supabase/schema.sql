-- ThusaPath opportunity catalogue. Enable RLS before adding any user-linked data.
create extension if not exists pgcrypto;

-- Staff access is provisioned by a project owner after creating a staff Auth user.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, public;
grant select on public.admin_users to authenticated;
drop policy if exists "Staff can check their own admin access" on public.admin_users;
create policy "Staff can check their own admin access"
  on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()) and active = true);

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  registration_number text not null unique,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  verified_until date,
  created_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  title text not null,
  organisation text not null,
  initials text not null,
  category text not null check (category in ('Job','Learnership','Internship','Training','Volunteering','Bursary')),
  place text not null,
  distance_km numeric(6,1) not null default 0,
  transport_estimate numeric(8,2) not null default 0,
  pay text not null,
  closing date not null,
  description text not null,
  requirements jsonb not null default '[]'::jsonb,
  skills jsonb not null default '[]'::jsonb,
  colour text not null default 'mint',
  verified_until date not null,
  latitude double precision not null,
  longitude double precision not null,
  screened boolean not null default false,
  reports integer not null default 0 check (reports >= 0),
  source_name text not null default 'ThusaPath',
  source_url text,
  application_url text,
  source_checked_at timestamptz,
  status text not null default 'draft' check (status in ('draft','pending_review','published','paused','closed')),
  created_at timestamptz not null default now()
);

-- Keep source provenance when applying this schema to an existing project.
alter table public.opportunities add column if not exists source_name text not null default 'ThusaPath';
alter table public.opportunities add column if not exists source_url text;
alter table public.opportunities add column if not exists application_url text;
alter table public.opportunities add column if not exists source_checked_at timestamptz;

alter table public.organisations enable row level security;
alter table public.opportunities enable row level security;

create or replace function public.is_currently_verified_org(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organisations o
    where o.id = org_id and o.status = 'verified' and o.verified_until >= current_date
  );
$$;
revoke all on function public.is_currently_verified_org(uuid) from public;
grant execute on function public.is_currently_verified_org(uuid) to anon, authenticated;

-- Visitors can see only live listings from organisations whose checks are current.
create policy "Visitors can read active verified opportunities"
  on public.opportunities for select to anon, authenticated
  using (status = 'published' and public.is_currently_verified_org(organisation_id));
grant select on public.opportunities to anon, authenticated;

-- No public reads of organisation registration documents or private details.
create policy "Organisation details are not public"
  on public.organisations for select to anon, authenticated using (false);

create index if not exists opportunities_status_closing_idx on public.opportunities(status, closing);
create index if not exists opportunities_location_idx on public.opportunities(latitude, longitude);

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

-- Active staff can grant access only to an existing Supabase Auth account.
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
  select u.id into target_id from auth.users u where lower(u.email) = staff_email limit 1;
  if target_id is null then
    raise exception 'No account exists for that email. Use an email that has already signed up to ThusaPath';
  end if;
  insert into public.admin_users (user_id, active) values (target_id, true)
    on conflict (user_id) do update set active = true;
end;
$$;
revoke all on function public.add_staff_member(text) from public;
grant execute on function public.add_staff_member(text) to authenticated;

create or replace function public.staff_member_directory()
returns table (email text, active boolean, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.active
  ) then
    raise exception 'Only active ThusaPath staff can view the team list';
  end if;
  return query select u.email::text, a.active, a.created_at
    from public.admin_users a join auth.users u on u.id = a.user_id
    order by a.created_at asc;
end;
$$;
revoke all on function public.staff_member_directory() from public;
grant execute on function public.staff_member_directory() to authenticated;


-- Private per-account app state: profile, saved opportunities, application
-- statuses, goals, CVs and interview practice history.
create table if not exists public.user_app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.user_app_data enable row level security;
revoke all on public.user_app_data from anon, public;
grant select, insert, update on public.user_app_data to authenticated;

drop policy if exists "Users can read their own app data" on public.user_app_data;
create policy "Users can read their own app data"
  on public.user_app_data for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can create their own app data" on public.user_app_data;
create policy "Users can create their own app data"
  on public.user_app_data for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their own app data" on public.user_app_data;
create policy "Users can update their own app data"
  on public.user_app_data for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
