create table if not exists public.app_users (
  login_id text primary key,
  google_user_id text unique,
  google_email text,
  display_name text,
  password_hash text,
  created_at_ms bigint not null,
  last_login_at_ms bigint not null
);

alter table public.app_users
  add column if not exists google_user_id text,
  add column if not exists google_email text,
  add column if not exists display_name text,
  add column if not exists password_hash text;

create unique index if not exists app_users_google_user_id_idx
  on public.app_users (google_user_id)
  where google_user_id is not null;

create table if not exists public.goals (
  id text primary key,
  user_id text references public.app_users(login_id) on delete cascade,
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

alter table public.goals
  add column if not exists user_id text references public.app_users(login_id) on delete cascade;

create table if not exists public.progress_entries (
  id text primary key,
  goal_id text not null references public.goals(id) on delete cascade,
  created_at_ms bigint not null,
  value double precision not null default 0 check (value >= 0),
  memo text not null default ''
);

create table if not exists public.todos (
  id text primary key,
  user_id text not null references public.app_users(login_id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  created_at_ms bigint not null
);

create index if not exists goals_user_active_order_idx
  on public.goals (user_id, position asc, created_at_ms desc)
  where deleted_at_ms is null and archived_at_ms is null;

create index if not exists goals_user_deleted_idx
  on public.goals (user_id, deleted_at_ms desc)
  where deleted_at_ms is not null;

create index if not exists goals_user_archived_idx
  on public.goals (user_id, archived_at_ms desc)
  where deleted_at_ms is null and archived_at_ms is not null;

create index if not exists progress_entries_goal_created_idx
  on public.progress_entries (goal_id, created_at_ms asc);

create index if not exists todos_user_created_idx
  on public.todos (user_id, created_at_ms desc);

alter table public.app_users enable row level security;
alter table public.goals enable row level security;
alter table public.progress_entries enable row level security;
alter table public.todos enable row level security;
