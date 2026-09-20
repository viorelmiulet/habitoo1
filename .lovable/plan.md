# Apify — bazin de date de piață pentru ACP (doar ingestie)

Colectarea rulează la Apify, pe contul și tokenul tău. Habitoo doar pornește rularea manual, așteaptă rezultatul, îl mapează și îl scrie în bazinul de piață existent. Fără programare automată, fără cron, fără worker.

## Ce vezi în aplicație

În Superadmin → Nomenclator, sub datele de piață, apare cardul **„Apify — surse de colectare"**:

- lista surselor, cu comutator pornit/oprit (implicit oprit), numărul maxim de rezultate pe rulare și destinația (bazin de piață / prospecți);
- costul estimat înainte de rulare (din numărul maxim de rezultate și prețul anunțat al actorului) și costul real raportat de Apify după rulare;
- total cheltuit pe sursă și pe luna curentă, mereu la vedere lângă butonul de rulare;
- ultima rulare: primite, create, actualizate, neschimbate, respinse cu motive, erori, cost;
- primul element brut din ultima rulare, ca o greșeală de mapare să se vadă imediat;
- butonul **„Rulează acum"**.

O sursă nouă se adaugă completând configurația (actor, input, mapare), fără cod nou.

## Detalii tehnice

### Migrația `0070_apify_sources.sql`

- `apify_sources`: `key` (PK), `label`, `actor_id`, `input jsonb` (inputul actorului, stocat ca date), `field_mapping jsonb`, `enabled boolean default false`, `max_items int`, `target text check in ('market_pool','prospects')`, `unit_cost_usd numeric` + `cost_note text` (prețul anunțat al actorului, pentru estimare), `notes`, `spend_total_usd numeric default 0`, `last_run_id`, `created_at/updated_at`.
- `apify_runs`: `id`, `source_key` → `apify_sources`, `apify_run_id`, `apify_dataset_id`, `status`, `started_at/finished_at`, `items_received/created/updated/unchanged/discarded`, `discard_reasons jsonb`, `cost_usd numeric`, `usage jsonb`, `first_item jsonb` (primul element brut, redactat de chei sensibile), `market_import_run_id` → `market_import_runs`, `triggered_by`, `errors jsonb`.
- RLS + GRANT ca la `market_query_sources`: `select` pentru `authenticated` doar prin `is_superadmin()`, `all` pentru `service_role`. Scrierile trec doar prin clientul privilegiat server-side.
- `market_source_state` este refolosit pentru lock: cheia sursei devine `apify:<key>`, deci `market_sync_claim` / `market_sync_release` garantează că două rulări ale aceleiași surse nu se suprapun. Fără tabel de lock nou.

### Client Apify — `src/lib/market/apify/client.server.ts`

Token din `process.env['APIFY_TOKEN']`, citit în handler, niciodată trimis către browser. Endpointuri folosite:

- `POST /v2/acts/{actorId}/runs?memory=...` — pornește rularea cu inputul stocat (`maxItems` aplicat prin inputul actorului și prin `?maxItems` la citire).
- `GET /v2/actor-runs/{runId}` — polling până la `status` terminal (`SUCCEEDED`/`FAILED`/`ABORTED`/`TIMED-OUT`), cu backoff și buget de timp; citește `usageTotalUsd` / `usage` pentru costul real.
- `GET /v2/datasets/{datasetId}/items?offset=&limit=&clean=true` — citirea paginată a rezultatelor, plafonată la `max_items`.

Dacă `APIFY_TOKEN` lipsește, sursa se raportează „token neconfigurat" și rularea este refuzată — nu se simulează nimic.

### Mapare și normalizare — `src/lib/market/apify/mapping.ts` (pur)

`field_mapping` traduce cheile actorului în câmpurile noastre și se compune peste `HABITOO_MAPPING`, deci refolosește `normalizeRecord` existent: id extern, url, titlu, preț, monedă, suprafață, camere, oraș/județ/zonă, data anunțului, tip vânzător (`owner`/`agency`/`unknown`, doar dacă sursa îl declară), url-uri de imagini. Ce lipsește rămâne gol, nimic nu se ghicește. Un rând fără preț sau fără url se respinge și se numără cu motiv.

### Scriere în bazinul existent

`src/lib/market/apify/import.server.ts` deschide un rând în `market_import_runs` (`source: apify:<key>`, `format: "json"`, `mode: "partial"`), apoi apelează `ingestListings` cu `createMarketRepository(admin)` — exact calea actuală de dedupe, istoric de preț și snapshot-uri. Niciun pipeline al doilea. Rezultatele se raportează per rulare și se scriu și în `apify_runs`.

Sursele Apify apar în registrul de surse de piață (`MARKET_SOURCES`) generate din rândurile `apify_sources`, ca bazinul să fie vizibil în Market Intelligence și disponibil ACP prin tipul de sursă existent `market_listings`.

### Server functions — `src/lib/market/apify/apify.functions.ts`

Toate cu `requireSupabaseAuth` + verificare `is_superadmin()`: `getApifySources`, `saveApifySource`, `setApifySourceEnabled`, `runApifySource` (lock, refuz dacă sursa e oprită sau dacă tokenul lipsește, rulare, mapare, import, cost), `getApifyRun`.

`target: 'prospects'` este acceptat ca valoare de configurare, dar în acest pas doar `market_pool` are traseu de scriere; o sursă cu `prospects` raportează clar că nu are încă destinație implementată.

### Ce NU se atinge

Modulul ACP de interogare live (`market_query`) rămâne neschimbat. Cardul ofertei, portalurile și colectorul nu se modifică.

## Teste

- maparea produce forma noastră dintr-un element-eșantion capturat;
- rândurile fără preț sau fără url sunt respinse și numărate cu motiv;
- importul folosește calea existentă de dedupe și istoric de preț (depozit în memorie);
- o rulare suprapusă este refuzată (lock);
- o sursă oprită nu rulează niciodată;
- tokenul nu apare în niciun rezultat trimis clientului.

Apoi suita completă, verificarea de tipuri și build-ul.

## Ce trebuie de la tine

Tokenul Apify se adaugă în Setări proiect → Secrets, ca `APIFY_TOKEN`. Fără el cardul funcționează, dar rularea este refuzată explicit.
