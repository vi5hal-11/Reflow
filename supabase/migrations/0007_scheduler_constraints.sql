-- Founder feedback 2026-07-28: "Plan my day should consider all the constraints
-- the user has." Three kinds, all optional and all off by default.

-- 1. Blocked windows — recurring times the scheduler must never place into
--    (lunch, school run, gym). The web resolves these against the plan's local
--    day and sends them to the engine as ordinary fixed blocks, so the engine
--    needs no concept of recurrence.
create table if not exists public.blocked_windows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  start_time time not null,
  end_time time not null,
  -- 0 = Sunday .. 6 = Saturday, matching JS Date#getDay().
  days_of_week smallint[] not null default '{0,1,2,3,4,5,6}',
  created_at timestamptz not null default now(),
  constraint blocked_window_ordered check (end_time > start_time)
);

create index if not exists blocked_windows_user_id_idx
  on public.blocked_windows (user_id);

alter table public.blocked_windows enable row level security;

create policy "own blocked windows" on public.blocked_windows
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 2. Per-task timing rules. Times of day, resolved against the plan's local day
--    by the web (same contract as energy windows). HARD limits: unlike energy
--    preferences, a task is never placed outside them.
alter table public.tasks
  add column if not exists earliest_start time,
  add column if not exists latest_end time;

-- 3. Daily caps. NULL = no cap, which stays the default for every existing user.
--    The Daily Big 3 are deliberately exempt (CLAUDE.md §5 guarantees they are
--    placed first) — a cap protects the rest of the day from over-commitment.
alter table public.profiles
  add column if not exists max_deep_minutes int
    check (max_deep_minutes is null or max_deep_minutes between 0 and 1440),
  add column if not exists max_scheduled_minutes int
    check (max_scheduled_minutes is null or max_scheduled_minutes between 0 and 1440);
