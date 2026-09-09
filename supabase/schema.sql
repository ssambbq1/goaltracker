create table if not exists public.app_users (
  login_id text primary key,
  google_user_id text unique,
  google_email text,
  display_name text,
  password_hash text,
  ai_enabled boolean not null default false,
  created_at_ms bigint not null,
  last_login_at_ms bigint not null
);

alter table public.app_users
  add column if not exists google_user_id text,
  add column if not exists google_email text,
  add column if not exists display_name text,
  add column if not exists password_hash text,
  add column if not exists ai_enabled boolean not null default false;

create unique index if not exists app_users_google_user_id_idx
  on public.app_users (google_user_id)
  where google_user_id is not null;

create table if not exists public.goals (
  id text primary key,
  user_id text references public.app_users(login_id) on delete cascade,
  title text not null,
  memo text not null default '',
  target double precision not null,
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
  value double precision not null default 0,
  memo text not null default ''
);

create table if not exists public.todos (
  id text primary key,
  user_id text not null references public.app_users(login_id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  created_at_ms bigint not null,
  target_date date,
  category text not null default '',
  position integer not null default 0
);

alter table public.todos
  add column if not exists position integer not null default 0,
  add column if not exists target_date date,
  add column if not exists category text not null default '';

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

create table if not exists public.agent_settings (
  user_id text primary key references public.app_users(login_id) on delete cascade,
  llm_model text not null default '',
  api_key_ciphertext text not null default '',
  api_keys jsonb not null default '[]'::jsonb,
  active_key_id text not null default '',
  updated_at_ms bigint not null
);

alter table public.agent_settings
  add column if not exists api_keys jsonb not null default '[]'::jsonb,
  add column if not exists active_key_id text not null default '';

create table if not exists public.announcements (
  id text primary key,
  sender_id text not null references public.app_users(login_id) on delete cascade,
  message text not null,
  target_user_ids jsonb,
  created_at_ms bigint not null
);

create table if not exists public.friendships (
  id text primary key,
  requester_id text not null references public.app_users(login_id) on delete cascade,
  addressee_id text not null references public.app_users(login_id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined')),
  created_at_ms bigint not null,
  responded_at_ms bigint,
  check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

create table if not exists public.item_assignments (
  id text primary key,
  assigner_id text not null references public.app_users(login_id) on delete cascade,
  assignee_id text not null references public.app_users(login_id) on delete cascade,
  kind text not null check (kind in ('goal', 'todo', 'routine')),
  title text not null,
  memo text not null default '',
  target double precision,
  unit text,
  deadline text,
  start_date date,
  end_date date,
  target_date date,
  category text not null default '',
  status text not null check (status in ('pending', 'accepted', 'declined')),
  applied_item_id text,
  created_at_ms bigint not null,
  responded_at_ms bigint,
  check (assigner_id <> assignee_id)
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

create index if not exists todos_user_position_idx
  on public.todos (user_id, position asc, created_at_ms desc);

create index if not exists routines_user_position_idx
  on public.routines (user_id, position asc, created_at_ms desc);

create index if not exists routine_marks_routine_date_idx
  on public.routine_marks (routine_id, date asc);

create index if not exists friendships_requester_idx
  on public.friendships (requester_id, status, created_at_ms desc);

create index if not exists friendships_addressee_idx
  on public.friendships (addressee_id, status, created_at_ms desc);

create index if not exists item_assignments_assigner_idx
  on public.item_assignments (assigner_id, status, created_at_ms desc);

create index if not exists item_assignments_assignee_idx
  on public.item_assignments (assignee_id, status, created_at_ms desc);

create index if not exists announcements_created_idx
  on public.announcements (created_at_ms desc);

alter table public.app_users enable row level security;
alter table public.goals enable row level security;
alter table public.progress_entries enable row level security;
alter table public.todos enable row level security;
alter table public.routines enable row level security;
alter table public.routine_marks enable row level security;
alter table public.agent_settings enable row level security;
alter table public.announcements enable row level security;
alter table public.friendships enable row level security;
alter table public.item_assignments enable row level security;
