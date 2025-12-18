-- Assistant chat storage (per-session, token-windowed; Galaxy global, Clarity per-document)

create table if not exists public.assistant_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  assistant text not null, -- 'galaxy' | 'clarity'
  document_id uuid references public.documents (id) on delete cascade,
  lang text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index if not exists assistant_sessions_user_assistant_idx on public.assistant_sessions (user_id, assistant);
create index if not exists assistant_sessions_doc_idx on public.assistant_sessions (document_id);

-- Enforce "one Galaxy session per user" and "one Clarity session per (user, document)".
create unique index if not exists assistant_sessions_unique_galaxy_idx
  on public.assistant_sessions (user_id)
  where assistant = 'galaxy' and document_id is null;

create unique index if not exists assistant_sessions_unique_clarity_idx
  on public.assistant_sessions (user_id, document_id)
  where assistant = 'clarity';

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assistant_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  token_estimate integer,
  created_at timestamptz not null default now()
);

create index if not exists assistant_messages_session_idx on public.assistant_messages (session_id, created_at);

alter table public.assistant_sessions enable row level security;
alter table public.assistant_messages enable row level security;

do $$
begin
  -- Tighten constraints (safe to re-run).
  if not exists (
    select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'assistant_sessions'
       and c.conname = 'assistant_sessions_assistant_check'
  ) then
    alter table public.assistant_sessions
      add constraint assistant_sessions_assistant_check
      check (assistant in ('galaxy', 'clarity'));
  end if;

  if not exists (
    select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'assistant_sessions'
       and c.conname = 'assistant_sessions_doc_check'
  ) then
    alter table public.assistant_sessions
      add constraint assistant_sessions_doc_check
      check (
        (assistant = 'galaxy' and document_id is null)
        or (assistant = 'clarity' and document_id is not null)
      );
  end if;

  -- Policies: drop+recreate to ensure updates apply.
  drop policy if exists assistant_sessions_owner on public.assistant_sessions;
  create policy assistant_sessions_owner on public.assistant_sessions
    using (
      auth.uid() = user_id
      and (
        document_id is null
        or exists (
          select 1 from public.documents d
          where d.id = assistant_sessions.document_id
            and d.user_id = auth.uid()
        )
      )
    )
    with check (
      auth.uid() = user_id
      and (
        document_id is null
        or exists (
          select 1 from public.documents d
          where d.id = assistant_sessions.document_id
            and d.user_id = auth.uid()
        )
      )
    );

  drop policy if exists assistant_messages_owner on public.assistant_messages;
  create policy assistant_messages_owner on public.assistant_messages
    using (
      auth.uid() = user_id
      and exists (
        select 1 from public.assistant_sessions s
        where s.id = assistant_messages.session_id
          and s.user_id = auth.uid()
      )
    )
    with check (
      auth.uid() = user_id
      and exists (
        select 1 from public.assistant_sessions s
        where s.id = assistant_messages.session_id
          and s.user_id = auth.uid()
      )
    );
end
$$;
