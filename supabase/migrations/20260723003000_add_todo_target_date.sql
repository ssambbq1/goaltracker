alter table public.todos
  add column if not exists target_date date;
