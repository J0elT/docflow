-- Cases + typed taxonomy scaffolding (per docflow_schema_v1_5)

-- Typed taxonomy tables (sender_type, topic, domain_profile)
create table if not exists public.taxonomy_sender_types (
  id uuid primary key default gen_random_uuid(),
  canonical_label text not null,
  synonyms text[] not null default '{}',
  description text,
  country_scope text[] not null default '{}',
  source text not null default 'human',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.taxonomy_topics (
  id uuid primary key default gen_random_uuid(),
  canonical_label text not null,
  synonyms text[] not null default '{}',
  description text,
  country_scope text[] not null default '{}',
  source text not null default 'human',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.taxonomy_domain_profiles (
  id uuid primary key default gen_random_uuid(),
  canonical_label text not null,
  synonyms text[] not null default '{}',
  description text,
  country_scope text[] not null default '{}',
  source text not null default 'human',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists taxonomy_sender_types_label_idx on public.taxonomy_sender_types (lower(canonical_label));
create index if not exists taxonomy_topics_label_idx on public.taxonomy_topics (lower(canonical_label));
create index if not exists taxonomy_domain_profiles_label_idx on public.taxonomy_domain_profiles (lower(canonical_label));

-- Cases (per-user)
create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  status text not null default 'open', -- open, pending, closed
  domain_profile_id uuid references public.taxonomy_domain_profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

-- Link documents to cases (many-to-many, but usually one case)
create table if not exists public.case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (case_id, document_id)
);

-- Case events (lightweight timeline)
create table if not exists public.case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null, -- note, status_change, task_created, doc_added, etc.
  payload jsonb,
  created_at timestamptz not null default now()
);

-- Helpful indexes
create index if not exists cases_user_status_idx on public.cases (user_id, status);
create index if not exists case_documents_case_idx on public.case_documents (case_id);
create index if not exists case_documents_doc_idx on public.case_documents (document_id);
create index if not exists case_events_case_idx on public.case_events (case_id, created_at desc);
