alter table public.app_users
  add column if not exists ai_enabled boolean not null default false;

