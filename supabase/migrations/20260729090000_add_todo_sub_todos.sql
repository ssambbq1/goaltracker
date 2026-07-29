alter table public.todos
  add column if not exists sub_todos jsonb not null default '[]'::jsonb;
