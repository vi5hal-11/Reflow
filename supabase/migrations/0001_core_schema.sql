-- Reflow core schema (CLAUDE.md §4)
-- RLS on every table; every row scoped to user_id = auth.uid().
-- Policy style: (select auth.uid()) initPlan caching + TO authenticated,
-- per https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv

create type task_status as enum ('inbox', 'todo', 'scheduled', 'done', 'rolled');
create type energy_tag as enum ('deep', 'shallow', 'admin');
create type task_source as enum ('text', 'voice', 'share', 'manual');
create type plan_status as enum ('active', 'archived');

-- updated_at maintenance
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'UTC',
  working_hours_start time not null default '09:00',
  working_hours_end time not null default '18:00',
  energy_profile jsonb not null default '{"deep":["09:00-12:00"],"admin":["14:00-16:00"]}',
  default_buffer_minutes int not null default 10 check (default_buffer_minutes between 0 and 120),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  color text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  title text not null,
  notes text,
  status task_status not null default 'inbox',
  estimated_minutes int check (estimated_minutes > 0),
  actual_minutes int check (actual_minutes > 0),
  energy_tag energy_tag,
  priority int not null default 2 check (priority between 1 and 3),
  deadline timestamptz,
  is_fixed boolean not null default false,
  fixed_start timestamptz,
  is_big3 boolean not null default false,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  source task_source not null default 'text',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fixed_needs_start check (not is_fixed or fixed_start is not null)
);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_date date not null,
  generated_at timestamptz not null default now(),
  big3_task_ids jsonb not null default '[]',
  status plan_status not null default 'active',
  unique (user_id, plan_date)
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  google_event_id text,
  title text,
  "start" timestamptz not null,
  "end" timestamptz not null,
  is_busy boolean not null default true,
  synced_at timestamptz not null default now(),
  unique (user_id, google_event_id)
);

create table public.estimate_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  energy_tag energy_tag,
  estimated_minutes int not null check (estimated_minutes > 0),
  actual_minutes int not null check (actual_minutes > 0),
  created_at timestamptz not null default now()
);

create table public.momentum (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  metric_date date not null,
  active boolean not null default false,
  unique (user_id, metric_date)
);

-- Indexes: every column referenced in RLS policies + hot query paths
create index projects_user_id_idx on public.projects (user_id);
create index tasks_user_id_idx on public.tasks (user_id);
create index tasks_user_status_idx on public.tasks (user_id, status);
create index tasks_project_id_idx on public.tasks (project_id);
create index daily_plans_user_id_idx on public.daily_plans (user_id);
create index calendar_events_user_id_idx on public.calendar_events (user_id);
create index calendar_events_user_start_idx on public.calendar_events (user_id, "start");
create index estimate_history_user_id_idx on public.estimate_history (user_id);
create index estimate_history_user_tag_idx on public.estimate_history (user_id, energy_tag);
create index momentum_user_id_idx on public.momentum (user_id);

-- RLS
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.daily_plans enable row level security;
alter table public.calendar_events enable row level security;
alter table public.estimate_history enable row level security;
alter table public.momentum enable row level security;

create policy "own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "own projects" on public.projects
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own tasks" on public.tasks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own daily plans" on public.daily_plans
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own calendar events" on public.calendar_events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own estimate history" on public.estimate_history
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own momentum" on public.momentum
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Auto-create a profile row on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
