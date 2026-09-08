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

create index if not exists friendships_requester_idx
  on public.friendships (requester_id, status, created_at_ms desc);

create index if not exists friendships_addressee_idx
  on public.friendships (addressee_id, status, created_at_ms desc);

create index if not exists item_assignments_assigner_idx
  on public.item_assignments (assigner_id, status, created_at_ms desc);

create index if not exists item_assignments_assignee_idx
  on public.item_assignments (assignee_id, status, created_at_ms desc);

alter table public.friendships enable row level security;
alter table public.item_assignments enable row level security;
