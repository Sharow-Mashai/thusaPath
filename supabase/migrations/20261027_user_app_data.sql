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
