-- Founder decision 2026-07-23: remove Google Calendar sync entirely, and add
-- optional ("bonus") day tasks.
--
-- Calendar carried real cost — an OAuth round-trip, a service-role-only token
-- table, and a push/pull deadlock guard — for a capability the core loop never
-- needed. Dropping it also removes the web app's last need for the Supabase
-- secret key at runtime.

drop table if exists public.calendar_connections;
drop table if exists public.calendar_events;

-- The mirror of a pushed Google event; meaningless without the sync.
alter table public.tasks drop column if exists google_event_id;

-- Optional tasks: nice-to-have for one particular day. Never scheduled onto the
-- timeline, never rolled forward, never overdue — leaving one undone just means
-- the day moved on (CLAUDE.md §7, no guilt).
alter table public.tasks
  add column if not exists is_optional boolean not null default false;

-- The day view reads optional tasks by (user, day); partial index keeps it cheap.
create index if not exists tasks_optional_day_idx
  on public.tasks (user_id, planned_date)
  where is_optional;
