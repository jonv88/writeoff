-- Phase B: suggestion metadata + profile context for write-off engine

alter table public.profiles
  add column if not exists jurisdiction text not null default '',
  add column if not exists tax_year integer not null default extract(year from now())::integer,
  add column if not exists entity_type text not null default 'unspecified'
    check (entity_type in ('sole_prop', 'llc', 'corp', 'partnership', 'employee', 'personal', 'unspecified'));

alter table public.expenses
  add column if not exists currency text not null default 'USD',
  add column if not exists treatment_source text not null default 'suggestion'
    check (treatment_source in ('suggestion', 'user', 'tax_pro')),
  add column if not exists suggested_status text,
  add column if not exists suggestion_rule_id text,
  add column if not exists suggestion_rule_version text,
  add column if not exists suggestion_reason text;
