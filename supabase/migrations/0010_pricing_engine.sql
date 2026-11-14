-- Veyra Platform Phase 9: Pricing Engine schema
--
-- Tables:
--   pricing_rules - Configurable pricing rules by model, provider, modality, region
--
-- Design principles:
--   * Prices are stored in the database and can be updated administratively
--   * No hardcoded prices in code
--   * Most-specific-match pricing resolution (model > provider > modality > region)
--   * All monetary amounts in smallest currency unit
--
-- No production pricing records are seeded here.

-- pricing_rules: Configurable pricing rules
create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  model_id uuid references public.ai_models(id) on delete set null,
  provider_id uuid references public.ai_providers(id) on delete set null,
  modality text,
  region text check (length(region) = 2),
  input_price_per_unit_cents bigint not null check (input_price_per_unit_cents >= 0),
  output_price_per_unit_cents bigint not null check (output_price_per_unit_cents >= 0),
  currency text not null check (length(currency) = 3),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index idx_pricing_rules_model_id on public.pricing_rules(model_id);
create index idx_pricing_rules_provider_id on public.pricing_rules(provider_id);
create index idx_pricing_rules_modality on public.pricing_rules(modality);
create index idx_pricing_rules_region on public.pricing_rules(region);
create index idx_pricing_rules_active on public.pricing_rules(is_active) where is_active = true;
create index idx_pricing_rules_effective_from on public.pricing_rules(effective_from);

-- Row Level Security
alter table public.pricing_rules enable row level security;

-- Pricing rules: readable by all authenticated users (pricing is public info)
create policy pricing_rules_read_all on public.pricing_rules
  for select using (auth.uid() is not null);

-- No client write policies - server-side only

-- updated_at trigger
create trigger pricing_rules_set_updated_at
  before update on public.pricing_rules
  for each row execute function public.set_updated_at();
