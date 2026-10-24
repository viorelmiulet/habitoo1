# Import hbsync în ACP

## Alegere: B — PUSH separat

`POST https://crm.habitoo.ro/api/public/market-listings/upsert`

Header: `x-scraper-secret`, aceeași cheie securizată ca la importul particularilor.

Endpointul nou este disponibil în previzualizare; URL-ul public îl va servi după publicarea aplicației. Nu trimite token-ul API hbsync la acest endpoint.

Varianta A nu este activată: adresa oferită folosește HTTP necriptat, iar token-ul API hbsync nu este configurat în Habitoo. PUSH evită transportul acelui token și păstrează controlul exportului în hbsync. Configurația externă hbsync trebuie să trimită și ofertele agențiilor, independent de exportul particularilor. Nu a fost modificat workflow-ul particularilor și nu este creat un job zilnic PULL.

## Tabele și mapare reală

ACP citește `market_listings` când sursa „Portaluri” este selectată. Importul folosește normalizarea, entitățile canonice, istoricul de preț și jurnalul existente. Analizele deja salvate nu se recalculează automat.

| hbsync | market_listings |
| --- | --- |
| source | source (storia / olx / romimo) |
| external_id | source_listing_id |
| city / county | city / county și normalized_city / normalized_county |
| sector / crm.sector | sector |
| neighborhood / crm.zona | district și neighborhood, cu normalized_* |
| rooms / crm.camere | rooms (numeric în tabel, întreg în contractul hbsync) |
| price / currency | price / currency |
| surface_built / crm.suprafata_mp | total_area (nu presupunem suprafață utilă) |
| deal_type=lease | transaction_type=rent |
| property_type=apartment | property_type=apartament |
| price și suprafață | price_per_sqm calculat determinist |
| publisher_type | publisher_type și is_private |
| images | images și image_url (prima imagine) |
| first_seen_at / last_seen_at | first_seen_at / last_seen_at |
| period / crm.perioada | period |
| transport | import_provider=hbsync |

Nu există coloane `external_id`, `surface`, `price_per_m2` sau `scraped_at` în `market_listings`; denumirile reale sunt cele de mai sus. Codurile SIRUTA nu sunt necesare potrivirii ACP actuale, deci nu au fost adăugate. Telefonul, descrierea, scorurile colectorului și datele de contact nu sunt copiate în pool-ul ACP. Prețurile provin numai din câmpuri structurate, nu din textul descrierii.

`publisher_type=particular` înseamnă `is_private=true`; `agency` înseamnă `false`; lipsa clasificării înseamnă `NULL`, nu particular implicit. Ambele categorii pot intra în ACP. Endpointul particularilor rămâne separat și nemodificat.

Loturi de 1–500 înregistrări, maximum 10 MB. Rândurile invalide sunt raportate individual; rândurile valide pot fi salvate chiar dacă răspunsul este 422. Reîncercarea întregului lot este sigură. Lipsa unui anunț dintr-un lot nu îl dezactivează: `limit=500` nu dovedește că feedul este complet.

## Exemplu complet

```json
{
  "listings": [{
    "source": "storia",
    "external_id": "ID-exemplu-inlocuieste-cu-id-real",
    "title": "Apartament 2 camere Titan",
    "deal_type": "lease",
    "property_type": "apartment",
    "price": 1500,
    "currency": "EUR",
    "surface_built": 50,
    "rooms": 2,
    "city": "București",
    "county": "București",
    "sector": "Sector 3",
    "neighborhood": "Titan",
    "publisher_type": "agency",
    "images": [],
    "status": "active",
    "crm": { "perioada": "luna" }
  }]
}
```

Răspunsul include `success`, `received`, `imported`, `created`, `updated`, `unchanged`, `rejected` și `errors`. `updated` numără schimbările de preț/stare; celelalte câmpuri se resalvează și pentru un rând numărat ca `unchanged`. HTTP 401 = cheie lipsă/invalidă; 400 = corp invalid; 413 = corp prea mare; 422 = lot parțial sau respins; 500 = eroare de import.

## Verificare efectuată

Un anunț Storia real existent în Anunțuri particulari (Otopeni, 2 camere, 50 mp, 499 EUR/lună) a fost trimis la endpointul local de două ori: HTTP 200, prima dată `created=1`, a doua oară `unchanged=1`; fără cheie: HTTP 401. Nu a fost modificat prețul din Anunțuri particulari. Testele acoperă și agențiile, clasificarea necunoscută, București/Sector 3/Titan, prețul de 1500 EUR și reimportul idempotent.

Importul automat din hbsync și o analiză deschisă în contul solicitantului nu sunt încă verificate. Este necesară configurarea exportului extern către noul endpoint și accesul la contul solicitantului pentru verificarea vizuală.