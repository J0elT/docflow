-- Categories table
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parent_id uuid references public.categories(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

drop policy if exists "Categories per user" on public.categories;
create policy "Categories per user"
  on public.categories
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists categories_user_parent_idx on public.categories (user_id, parent_id, name);

-- Link documents to categories
alter table public.documents
  add column if not exists category_id uuid references public.categories(id) on delete set null;

-- Tasks table
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  title text not null,
  description text,
  due_date date,
  status text not null default 'open',
  urgency text not null default 'normal',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.tasks enable row level security;

drop policy if exists "Tasks per user" on public.tasks;
create policy "Tasks per user"
  on public.tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists tasks_user_status_idx on public.tasks (user_id, status);
create index if not exists tasks_document_idx on public.tasks (document_id);
