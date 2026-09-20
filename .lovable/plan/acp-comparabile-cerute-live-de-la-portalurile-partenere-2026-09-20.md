# ACP — comparabile cerute live de la portalurile partenere

Analiza întreabă sursele activate exact în momentul rulării și păstrează din răspuns
doar ce a folosit efectiv raportul. Nimic nu se colectează în fundal, nimic nu se
stochează în afara analizei salvate.

## Ce vede utilizatorul

- În analiză și în raportul PDF, un tabel „Baza de dovezi": pentru fiecare sursă
  întrebată — „a răspuns cu N comparabile", „a răspuns fără rezultate",
  „nu a răspuns în timp util" sau „eroare". Analiza continuă cu ce a venit.
- Pentru fiecare comparabil folosit: preț, suprafață, camere, localitate/zonă,
  data anunțului și linkul. Nimic altceva.
- Superadmin → Nomenclator → „Interogare live a portalurilor": listă de surse cu
  comutator, timp maxim de așteptare, contoare (răspuns / fără rezultate /
  expirat / eroare) și butonul „testează sursa", care rulează o interogare și
  arată rezultatul normalizat, fără să salveze nimic.
- Modulul se livrează fără nicio sursă activată; adaptoarele se adaugă pe rând.

## Detalii tehnice

### Migrare (0065_acp_market_query)

- `market_query_sources`: `key` (PK), `label`, `base_url`, `enabled` (default
  `false`), `timeout_ms` (default 4000), `radius_km`, `price_band_percent`,
  `notes`, contoare `answered_count` / `empty_count` / `timeout_count` /
  `error_count`, `last_query_at`, `last_outcome`, timestamps.
  GRANT: `authenticated` SELECT, `service_role` ALL; RLS cu policy doar pentru
  superadmin (`public.is_superadmin()`). Nicio sursă inserată activată.
- `acp_analysis_sources`: coloane noi `outcome` (text) și `outcome_detail`
  (text), pentru dovada per sursă a analizei salvate.

### Modulul `src/lib/acp/market-query/`

- `port.ts` — tipurile portului și registrul de adaptoare, după modelul
  colectorului (`registerMarketQueryAdapter`, `marketQueryAdapter`,
  `marketQueryAdapterKeys`). Un adaptor primește criteriile și întoarce
  comparabile brute.
- `criteria.ts` (pur) — criteriile din subiectul analizei: tip tranzacție, tip
  proprietate, localitate/județ, rază (km) și bandă de preț (%) configurabile,
  plus `marketQueryCriteriaKey` folosit de cache.
- `normalize.ts` (pur) — normalizare comună: preț, monedă, suprafață, camere,
  localitate, zonă, data anunțului, URL. Ce lipsește rămâne gol, niciodată
  ghicit; un comparabil fără preț sau fără suprafață este eliminat.
- `session-cache.ts` — cache doar în memoria procesului, TTL 3 minute, cheia =
  criteriile normalizate. Nimic persistat.
- `fetch.server.ts` — strat de cereri politicos: User-Agent descriptiv cu
  contact, robots.txt respectat, o cerere pe rând per domeniu (reutilizează
  `runSerialPerDomain` și modulul `robots` din colector), fără proxy, fără
  mascare, fără autentificare.
- `run.server.ts` — citește sursele activate, le întreabă în paralel cu timeout
  per sursă, întoarce `{ comparables, outcomes }`; o sursă care expiră sau dă
  eroare este sărită, iar contoarele sursei se actualizează.
- `adapters.register.ts` — livrat gol (nicio sursă activată).
- `sources.functions.ts` — server functions rezervate superadminului:
  `listMarketQuerySources`, `setMarketQuerySource` (enabled, timeout, rază,
  bandă), `testMarketQuerySource` (o interogare, rezultat normalizat, fără
  salvare).

### Versiunea motorului

`ACP_ENGINE_VERSIONS = [1, 2, 3]`, `ACP_CURRENT_ENGINE_VERSION = 3`, etichetă
„Motor v3 — comparabile cerute live de la surse partenere" și
`engineSupportsLiveMarketQuery(version) => version >= 3`. Versiunile 1 și 2 nu
declanșează niciodată o interogare: recalcularea în loc folosește versiunea
stocată, deci o analiză veche se reproduce identic, fără rețea.

### Integrare în analiză

- `ACP_SOURCE_TYPES` primește `market_query` („Surse partenere (live)").
- `collectCandidates` interoghează live doar când `engineVersion >= 3` și sursa
  este bifată; `SourceStat` primește `outcome` + `outcomeDetail`, salvate în
  `acp_analysis_sources`.
- Snapshot-ul unui comparabil live conține strict: preț, monedă, suprafață,
  camere, localitate, zonă, data anunțului, URL. Fără imagini, fără date de
  contact, fără corp brut.
- Raport: `report/model.ts` și `report/pdf.server.ts` afișează starea per sursă;
  ecranul analizei (`app.acp.$id.tsx`) arată același bloc.

### Teste

`src/lib/acp/market-query/tests/` — rezultate parțiale continuă analiza și se
consemnează per sursă; un timeout e consemnat, nu fatal; o sursă dezactivată nu
e interogată niciodată; cache-ul de sesiune previne interogarea dublă; doar
câmpurile permise sunt persistate; o analiză v2 recalculată nu face nicio
cerere de rețea. Apoi suita completă, typecheck și build.

**Versiunea nouă de motor: 3.**
