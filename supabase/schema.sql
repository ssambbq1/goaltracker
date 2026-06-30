create table if not exists public.goals (
  id text primary key,
  title text not null,
  memo text not null default '',
  target double precision not null check (target > 0),
  unit text not null default 'units',
  deadline text not null default '',
  created_at_ms bigint not null,
  deleted_at_ms bigint,
  archived_at_ms bigint,
  position integer not null default 0
);

create table if not exists public.progress_entries (
  id text primary key,
  goal_id text not null references public.goals(id) on delete cascade,
  created_at_ms bigint not null,
  value double precision not null default 0 check (value >= 0),
  memo text not null default ''
);

create index if not exists goals_active_order_idx
  on public.goals (position asc, created_at_ms desc)
  where deleted_at_ms is null and archived_at_ms is null;

create index if not exists goals_deleted_idx
  on public.goals (deleted_at_ms desc)
  where deleted_at_ms is not null;

create index if not exists goals_archived_idx
  on public.goals (archived_at_ms desc)
  where deleted_at_ms is null and archived_at_ms is not null;

create index if not exists progress_entries_goal_created_idx
  on public.progress_entries (goal_id, created_at_ms asc);

alter table public.goals enable row level security;
alter table public.progress_entries enable row level security;
