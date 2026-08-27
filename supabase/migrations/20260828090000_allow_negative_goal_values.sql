alter table public.goals
  drop constraint if exists goals_target_check;

alter table public.progress_entries
  drop constraint if exists progress_entries_value_check;
