-- Label candidates for future taxonomy alignment
create table if not exists public.label_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('sender_type','topic','domain_profile','case')),
  label_text text not null,
  raw_variants jsonb not null default '[]'::jsonb,
  doc_count integer not null default 0,
  example_titles jsonb not null default '[]'::jsonb,
  last_seen_at timestamptz not null default now()
);

create unique index if not exists label_candidates_unique on public.label_candidates (user_id, type, label_text);
create index if not exists label_candidates_user_type_idx on public.label_candidates (user_id, type);

alter table public.label_candidates enable row level security;

drop policy if exists "label_candidates per user" on public.label_candidates;
create policy "label_candidates per user"
  on public.label_candidates
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
