-- Phase 4: Google Calendar bidirectional sync.

-- OAuth tokens are service-role only: RLS enabled with deliberately NO
-- policies — the browser must never be able to read refresh tokens.
-- The web BFF reaches this table exclusively through the secret-key client.
create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  google_email text,
  refresh_token text not null,
  access_token text,
  token_expiry timestamptz,
  calendar_id text not null default 'primary',
  sync_token text,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz
);
alter table public.calendar_connections enable row level security;

-- Pushed blocks: remember which Google event backs a scheduled task so
-- re-flows update the same event instead of duplicating it.
alter table public.tasks add column google_event_id text;

create index calendar_events_user_google_idx
  on public.calendar_events (user_id, google_event_id);
