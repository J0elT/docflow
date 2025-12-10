-- Backfill missing taxonomy_global translations using the canonical name
-- Languages aligned with the app: de,en,ro,tr,fr,es,ar,pt,ru,pl,uk
with langs as (
  select unnest(array['de','en','ro','tr','fr','es','ar','pt','ru','pl','uk']) as lang
),
missing as (
  select tg.id as taxonomy_id, l.lang, tg.name as label
  from public.taxonomy_global tg
  cross join langs l
  left join public.taxonomy_global_translations t on t.taxonomy_id = tg.id and t.lang = l.lang
  where t.id is null
)
insert into public.taxonomy_global_translations (taxonomy_id, lang, label)
select taxonomy_id, lang, label from missing;
