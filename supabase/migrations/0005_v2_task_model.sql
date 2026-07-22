-- v2 task model: subtasks, recurrence, reminders.

-- Subtasks / checklists — steps within a task.
create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index subtasks_task_id_idx on public.subtasks (task_id);
create index subtasks_user_id_idx on public.subtasks (user_id);

alter table public.subtasks enable row level security;
create policy "own subtasks" on public.subtasks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Recurrence — the "chain" model: completing a recurring task spawns the next
-- occurrence. Exactly one live instance moves forward (soft roll-forward keeps
-- an undone one on today), so recurrence never piles up — on-brand no-guilt.
create type recurrence_freq as enum ('daily', 'weekdays', 'weekly', 'monthly');
alter table public.tasks add column recurrence recurrence_freq;
alter table public.tasks add column recurrence_dow int[]; -- weekly: 0=Sun … 6=Sat
alter table public.tasks add column recurrence_until date;

-- Reminders — a nudge time. Delivered in-app / via the Notifications API while
-- a tab is open (background web-push is a later infra add).
alter table public.tasks add column remind_at timestamptz;
