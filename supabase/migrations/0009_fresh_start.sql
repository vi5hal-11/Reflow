-- Founder feedback 2026-07-28: a way to reset after a stretch of not logging.
--
-- Deliberately NOT a delete. A habit keeps every check-in it ever had; this
-- just draws a line and says "count from here". Nothing the user recorded is
-- destroyed, the reset is undoable by clearing the date, and the momentum strip
-- is untouched — CLAUDE.md §7's "dims, never resets" promise still holds, so
-- the comeback framing stays true.
alter table public.habits
  add column if not exists fresh_start_on date;

comment on column public.habits.fresh_start_on is
  'Grids and consistency count only from this date. Earlier check-ins are kept, not counted.';
