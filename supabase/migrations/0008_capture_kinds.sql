-- Capture types (mockup 1): not everything you dump in is a task.
--
-- Only 'task' is schedulable. Ideas and notes are kept, searchable and out of
-- the planner entirely — they can never crowd the day or read as overdue.
-- "Feeling" from the mockup is deliberately NOT a kind: the weather-scale mood
-- check-in already owns that, and two feelings channels would split the data.
alter table public.tasks
  add column if not exists kind text not null default 'task'
    check (kind in ('task', 'idea', 'note'));

-- The inbox filters by kind; a partial-friendly composite keeps that cheap.
create index if not exists tasks_user_kind_idx on public.tasks (user_id, kind);
