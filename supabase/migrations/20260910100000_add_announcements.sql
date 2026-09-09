create table if not exists public.announcements (
  id text primary key,
  sender_id text not null references public.app_users(login_id) on delete cascade,
  message text not null,
  target_user_ids jsonb,
  created_at_ms bigint not null
);

create index if not exists announcements_created_idx
  on public.announcements (created_at_ms desc);

alter table public.announcements enable row level security;

