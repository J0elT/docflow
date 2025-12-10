-- Category translations per user and language
create table if not exists public.category_translations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  lang text not null,
  label text not null,
  created_at timestamptz not null default now(),
  unique (user_id, category_id, lang)
);

alter table public.category_translations enable row level security;

drop policy if exists "Category translations per user" on public.category_translations;
create policy "Category translations per user"
  on public.category_translations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists category_translations_user_lang_idx
  on public.category_translations (user_id, lang);
create index if not exists category_translations_category_idx
  on public.category_translations (category_id);
