-- Doc chat threads and messages
create table if not exists public.doc_chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.doc_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.doc_chat_threads(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists doc_chat_threads_user_doc_idx on public.doc_chat_threads (user_id, document_id);
create index if not exists doc_chat_messages_thread_idx on public.doc_chat_messages (thread_id, created_at);

alter table public.doc_chat_threads enable row level security;
alter table public.doc_chat_messages enable row level security;

drop policy if exists "doc_chat_threads per user" on public.doc_chat_threads;
create policy "doc_chat_threads per user"
  on public.doc_chat_threads
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "doc_chat_messages per user" on public.doc_chat_messages;
create policy "doc_chat_messages per user"
  on public.doc_chat_messages
  for all
  using (
    exists (
      select 1 from public.doc_chat_threads t
      where t.id = thread_id and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.doc_chat_threads t
      where t.id = thread_id and t.user_id = auth.uid()
    )
  );
