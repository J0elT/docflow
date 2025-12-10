-- Global taxonomy backbone (shared across users)
create table if not exists public.taxonomy_global (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  parent_id uuid references public.taxonomy_global(id) on delete cascade,
  level int not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists taxonomy_global_parent_idx on public.taxonomy_global (parent_id);
create index if not exists taxonomy_global_level_idx on public.taxonomy_global (level);

-- Optional: per-language labels for the global taxonomy
create table if not exists public.taxonomy_global_translations (
  id uuid primary key default gen_random_uuid(),
  taxonomy_id uuid not null references public.taxonomy_global(id) on delete cascade,
  lang text not null,
  label text not null,
  created_at timestamptz not null default now(),
  unique (taxonomy_id, lang)
);

create index if not exists taxonomy_global_translations_lang_idx on public.taxonomy_global_translations (lang);

-- Map user categories to the global taxonomy
alter table public.categories
  add column if not exists global_taxonomy_id uuid references public.taxonomy_global(id);

-- Optional: enable RLS if you want to restrict access; otherwise leave disabled for shared lookup
-- alter table public.taxonomy_global enable row level security;
-- alter table public.taxonomy_global_translations enable row level security;
