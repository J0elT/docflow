-- Remove user categories that are no longer used by any documents and have no children.
-- This also removes their translations to keep dropdowns clean.
with dead_leaves as (
  select c.id
  from public.categories c
  left join public.documents d on d.category_id = c.id
  left join public.categories child on child.parent_id = c.id
  where d.category_id is null
    and child.id is null
)
delete from public.category_translations
where category_id in (select id from dead_leaves);

delete from public.categories
where id in (select id from dead_leaves);
