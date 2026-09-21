alter table if exists public.goals
  add column if not exists focused boolean not null default false;

alter table if exists public.todos
  add column if not exists focused boolean not null default false;

alter table if exists public.routines
  add column if not exists focused boolean not null default false;
