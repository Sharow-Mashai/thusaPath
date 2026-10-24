-- ThusaPath opportunity catalogue. Enable RLS before adding any user-linked data.
create extension if not exists pgcrypto;

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

-- No public reads of organisation registration documents or private details.
create policy "Organisation details are not public"
  on public.organisations for select to anon, authenticated using (false);

create index if not exists opportunities_status_closing_idx on public.opportunities(status, closing);
create index if not exists opportunities_location_idx on public.opportunities(latitude, longitude);
