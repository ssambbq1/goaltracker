alter table public.agent_settings
  add column if not exists api_keys jsonb not null default '[]'::jsonb,
  add column if not exists active_key_id text not null default '';
