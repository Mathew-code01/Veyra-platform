-- Veyra Platform Phase 7: Cloud AI Gateway schema
--
-- Tables:
--   ai_providers       - AI provider identifiers and configuration
--   ai_models          - Model identifiers and metadata
--   model_capabilities - Supported capabilities per model
--
-- Design principles:
--   * Model capabilities explicitly described and validated
--   * No BYOK key storage on the platform
--   * Provider interfaces for adding supported providers later
--   * Desktop's AIManager remains authoritative for local/BYOK execution
--
-- No production AI provider credentials are seeded here.

-- ---------------------------------------------------------------------------
-- ai_providers: AI provider identifiers and configuration
-- ---------------------------------------------------------------------------
create table public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  supports_streaming boolean not null default false,
  supports_structured_output boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ai_models: AI model identifiers and metadata
-- ---------------------------------------------------------------------------
create table public.ai_models (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.ai_providers(id) on delete cascade,
  model_id text not null,
  name text not null,
  description text,
  context_limit integer,
  input_modalities text[] default '{"text"}',
  output_modalities text[] default '{"text"}',
  supports_vision boolean not null default false,
  supports_audio boolean not null default false,
  supports_streaming boolean not null default false,
  supports_structured_output boolean not null default false,
  is_available boolean not null default true,
  is_retired boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, model_id)
);

-- ---------------------------------------------------------------------------
-- model_capabilities: Supported capabilities per model
-- ---------------------------------------------------------------------------
create table public.model_capabilities (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.ai_models(id) on delete cascade,
  capability text not null,
  max_tokens integer,
  cost_per_1k_tokens_input_cents integer,
  cost_per_1k_tokens_output_cents integer,
  created_at timestamptz not null default now(),
  unique (model_id, capability)
);

-- ---------------------------------------------------------------------------
-- ai_usage_log: Cloud AI usage audit log
-- ---------------------------------------------------------------------------
create table public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  provider_id uuid references public.ai_providers(id) on delete set null,
  model_id uuid references public.ai_models(id) on delete set null,
  capability text not null,
  tokens_input integer,
  tokens_output integer,
  cost_cents integer not null default 0,
  status text not null check (status in ('success', 'failure', 'timeout')),
  error_message text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index idx_ai_providers_provider_id on public.ai_providers(provider_id);
create index idx_ai_providers_active on public.ai_providers(is_active) where is_active = true;
create index idx_ai_models_provider_id on public.ai_models(provider_id);
create index idx_ai_models_model_id on public.ai_models(model_id);
create index idx_ai_models_available on public.ai_models(is_available) where is_available = true;
create index idx_ai_models_retired on public.ai_models(is_retired) where is_retired = false;
create index idx_model_capabilities_model_id on public.model_capabilities(model_id);
create index idx_model_capabilities_capability on public.model_capabilities(capability);
create index idx_ai_usage_log_user_id on public.ai_usage_log(user_id);
create index idx_ai_usage_log_created_at on public.ai_usage_log(created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.ai_providers enable row level security;
alter table public.ai_models enable row level security;
alter table public.model_capabilities enable row level security;
alter table public.ai_usage_log enable row level security;

-- AI providers: readable by all authenticated users (no credentials exposed)
create policy ai_providers_read_all on public.ai_providers
  for select using (auth.uid() is not null);

-- AI models: readable by all authenticated users
create policy ai_models_read_all on public.ai_models
  for select using (auth.uid() is not null);

-- Model capabilities: readable by all authenticated users
create policy model_capabilities_read_all on public.model_capabilities
  for select using (auth.uid() is not null);

-- AI usage log: users read their own logs only
create policy ai_usage_log_own_read on public.ai_usage_log
  for select using (auth.uid() = user_id);

-- No client write policies for AI tables -- all mutations are server-side only

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger ai_providers_set_updated_at
  before update on public.ai_providers
  for each row execute function public.set_updated_at();

create trigger ai_models_set_updated_at
  before update on public.ai_models
  for each row execute function public.set_updated_at();
