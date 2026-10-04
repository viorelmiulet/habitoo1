-- Corecție de date, o singură dată, idempotentă: valorile din vechiul grup
-- „Facilități” (properties.features) se copiază în grupul unde au rămas,
-- doar dacă lipsesc acolo. `features` rămâne neatins. „Semineu” devine
-- „Șemineu” în Diverse (misc_features). La a doua rulare nu modifică nimic.
with src as (
  select
    id,
    organization_id,
    features,
    building_amenities,
    additional_spaces,
    cooling_systems,
    heating_systems,
    misc_features,
    furnishing,
    balcony,
    parking_spaces,
    heating
  from public.properties
),
calc as (
  select
    s.*,
    (select coalesce(array_agg(distinct v order by v), '{}') from unnest(
      coalesce(s.building_amenities, '{}')
      || case when 'Lift' = any(coalesce(s.features, '{}')) then array['Lift'] else '{}' end
      || case when 'Grădină' = any(coalesce(s.features, '{}')) then array['Grădină'] else '{}' end
    ) v) as new_building,
    (select coalesce(array_agg(distinct v order by v), '{}') from unnest(
      coalesce(s.additional_spaces, '{}')
      || case when 'Terasă' = any(coalesce(s.features, '{}')) then array['Terasă'] else '{}' end
      || case when 'Boxă' = any(coalesce(s.features, '{}')) then array['Boxă la subsol'] else '{}' end
    ) v) as new_spaces,
    (select coalesce(array_agg(distinct v order by v), '{}') from unnest(
      coalesce(s.cooling_systems, '{}')
      || case when 'Aer condiționat' = any(coalesce(s.features, '{}')) then array['Aer condiționat'] else '{}' end
    ) v) as new_cooling,
    (select coalesce(array_agg(distinct v order by v), '{}') from unnest(
      array_remove(coalesce(s.heating_systems, '{}'), 'Semineu')
      || case when 'Centrală proprie' = any(coalesce(s.features, '{}')) then array['Centrală proprie'] else '{}' end
    ) v) as new_heating,
    (select coalesce(array_agg(distinct v order by v), '{}') from unnest(
      coalesce(s.misc_features, '{}')
      || case when 'Semineu' = any(coalesce(s.heating_systems, '{}')) or s.heating = 'Semineu'
              then array['Șemineu'] else '{}' end
    ) v) as new_misc,
    case when coalesce(s.furnishing, '') = '' and 'Mobilat' = any(coalesce(s.features, '{}'))
         then 'Complet' else s.furnishing end as new_furnishing,
    case when 'Balcon' = any(coalesce(s.features, '{}')) then true else s.balcony end as new_balcony,
    case when coalesce(s.parking_spaces, 0) = 0 and 'Parcare' = any(coalesce(s.features, '{}'))
         then 1 else s.parking_spaces end as new_parking,
    case when s.heating = 'Semineu' then null else s.heating end as new_heating_single
  from src s
),
changed as (
  select * from calc c
  where (select coalesce(array_agg(distinct v order by v), '{}') from unnest(coalesce(c.building_amenities, '{}')) v) is distinct from c.new_building
     or (select coalesce(array_agg(distinct v order by v), '{}') from unnest(coalesce(c.additional_spaces, '{}')) v) is distinct from c.new_spaces
     or (select coalesce(array_agg(distinct v order by v), '{}') from unnest(coalesce(c.cooling_systems, '{}')) v) is distinct from c.new_cooling
     or (select coalesce(array_agg(distinct v order by v), '{}') from unnest(coalesce(c.heating_systems, '{}')) v) is distinct from c.new_heating
     or (select coalesce(array_agg(distinct v order by v), '{}') from unnest(coalesce(c.misc_features, '{}')) v) is distinct from c.new_misc
     or c.furnishing is distinct from c.new_furnishing
     or c.balcony is distinct from c.new_balcony
     or c.parking_spaces is distinct from c.new_parking
     or c.heating is distinct from c.new_heating_single
),
upd as (
  update public.properties p set
    building_amenities = c.new_building,
    additional_spaces = c.new_spaces,
    cooling_systems = c.new_cooling,
    heating_systems = c.new_heating,
    misc_features = c.new_misc,
    furnishing = c.new_furnishing,
    balcony = c.new_balcony,
    parking_spaces = c.new_parking,
    heating = c.new_heating_single
  from changed c
  where p.id = c.id
  returning p.id
)
insert into public.audit_logs (action, entity, new_values)
select
  'property.features_consolidated',
  'properties',
  jsonb_build_object('properties_updated', count(*), 'source', 'data_fix_2026_10_04')
from upd
having count(*) > 0;
