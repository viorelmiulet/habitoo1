-- Colectorul OLX pe JSON-ul încorporat (window.__PRERENDERED_STATE__).
-- Configurarea sursei devine tabela de ținte de căutare: (categoria de
-- căutare, județ, opțional oraș și cartier). Categoria de căutare dă tipul
-- nostru de proprietate; harta categorie OLX -> tip se completează când
-- cunoaștem identificatorii reali de categorie.
-- Sursa rămâne OPRITĂ: nimic nu rulează până când un superadmin o activează.
with tipuri(t, p) as (
  values
    ('garsonieră', 'imobiliare/apartamente-garsoniere-de-vanzare/garsoniere'),
    ('apartament 2 camere', 'imobiliare/apartamente-garsoniere-de-vanzare/2-camere'),
    ('apartament 3 camere', 'imobiliare/apartamente-garsoniere-de-vanzare/3-camere'),
    ('apartament 4+ camere', 'imobiliare/apartamente-garsoniere-de-vanzare/4-camere'),
    ('casă/vilă', 'imobiliare/case-de-vanzare'),
    ('teren', 'imobiliare/terenuri'),
    ('spațiu comercial', 'imobiliare/spatii-comerciale')
),
judete(c) as (
  values ('alba'),('arad'),('arges'),('bacau'),('bihor'),('bistrita-nasaud'),('botosani'),
    ('brasov'),('braila'),('buzau'),('caras-severin'),('calarasi'),('cluj'),('constanta'),
    ('covasna'),('dambovita'),('dolj'),('galati'),('giurgiu'),('gorj'),('harghita'),
    ('hunedoara'),('ialomita'),('iasi'),('ilfov'),('maramures'),('mehedinti'),('mures'),
    ('neamt'),('olt'),('prahova'),('satu-mare'),('salaj'),('sibiu'),('suceava'),
    ('teleorman'),('timis'),('tulcea'),('vaslui'),('valcea'),('vrancea'),('bucuresti')
),
ținte as (
  select jsonb_build_object(
    'type', tipuri.t,
    'path', tipuri.p,
    'county', judete.c,
    'city', null,
    'districtId', null,
    'categoryId', null
  ) as target
  from judete cross join tipuri
)
update public.collector_sources
set config = jsonb_build_object(
      'targets', (select jsonb_agg(target) from ținte),
      'pagesPerTarget', 25,
      'categoryTypes', '{}'::jsonb
    ),
    updated_at = now()
where key = 'olx';