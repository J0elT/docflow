-- Add typed taxonomy and case references on documents
alter table if exists public.documents
  add column if not exists sender_type_id uuid references public.taxonomy_sender_types(id),
  add column if not exists topic_id uuid references public.taxonomy_topics(id),
  add column if not exists domain_profile_id uuid references public.taxonomy_domain_profiles(id),
  add column if not exists case_id uuid references public.cases(id);

create index if not exists documents_sender_type_idx on public.documents (sender_type_id);
create index if not exists documents_topic_idx on public.documents (topic_id);
create index if not exists documents_domain_profile_idx on public.documents (domain_profile_id);
create index if not exists documents_case_idx on public.documents (case_id);
