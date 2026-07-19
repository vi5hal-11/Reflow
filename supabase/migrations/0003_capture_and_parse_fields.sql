-- Phase 1: capture & parse enrichment fields
alter table public.tasks
  add column raw_text text,
  add column parse_suggestions jsonb,
  add column parsed_at timestamptz,
  add column planned_date date;

create index tasks_user_planned_date_idx on public.tasks (user_id, planned_date);
