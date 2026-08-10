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

alter table public.agent_settings enable row level security;
