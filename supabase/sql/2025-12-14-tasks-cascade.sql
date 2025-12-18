-- Ensure tasks tied to a document are removed when the document is deleted
alter table if exists public.tasks
  drop constraint if exists tasks_document_id_fkey;

alter table if exists public.tasks
  add constraint tasks_document_id_fkey
  foreign key (document_id)
  references public.documents(id)
  on delete cascade;
