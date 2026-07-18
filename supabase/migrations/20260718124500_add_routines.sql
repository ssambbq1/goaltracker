create table if not exists public.routines (
  id text primary key,
  user_id text not null references public.app_users(login_id) on delete cascade,
  title text not null,
  memo text not null default '',
  start_date date not null,
  end_date date not null,
  created_at_ms bigint not null,
  position integer not null default 0,
  check (start_date <= end_date)
);

create table if not exists public.routine_marks (
  id text primary key,
  routine_id text not null references public.routines(id) on delete cascade,
  date date not null,
  status text not null check (status in ('success', 'failure')),
  created_at_ms bigint not null,
  unique (routine_id, date)
);

create index if not exists routines_user_position_idx
  on public.routines (user_id, position asc, created_at_ms desc);

create index if not exists routine_marks_routine_date_idx
  on public.routine_marks (routine_id, date asc);

alter table public.routines enable row level security;
alter table public.routine_marks enable row level security;
