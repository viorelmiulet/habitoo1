# ACP — Analiza Comparativă de Piață (documentație tehnică)

Stare: **FROZEN FOR PRODUCTION** (Stage 10). Modificările motorului determinist
se tratează de acum ca schimbări controlate de versiune, nu ca modificări
obișnuite: orice schimbare de formulă schimbă valorile raportate istoric.

Documentul descrie implementarea reală din `src/lib/acp/`, nu o arhitectură
ipotetică.

## 1. Fluxul complet

```text
Property
  -> ACP Analysis (acp_analyses)
  -> Market Data (properties / colaborări / market_listings)
  -> Comparables (scoring + adjustments + outlieri)
  -> Deterministic Engine (engine.ts)
  -> Snapshot (target_data, comparabile persistate, market intelligence)
  -> ACP Version (version, parent_analysis_id, root_analysis_id)
  -> Optional AI Interpretation (acp_ai_insights)
  -> PDF Report (acp_reports + bucket privat acp-reports)
  -> History (versiuni + rapoarte)
  -> Audit (audit_logs)
```

| Etapă | Responsabilitate | Sursa datelor | Validări | Organizație | Se persistă | Poate eșua | Comportament la eroare |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Property | ținta analizei | `properties` | proprietatea există, nu e ștearsă, nu e arhivată (`canRunAcpForTarget`) | `organization_id` din profilul actorului | – | proprietate lipsă/arhivată | mesaj clar în UI, audit `acp.run.blocked`, fără versiune invalidă |
| ACP Analysis | rândul de analiză | server function `createAcpAnalysis` | Zod pe input, surse doar din `acpSourcesSchema`, rate limit 20/utilizator + 60/agenție pe oră, guard rulări duplicate (120s) | scoped server-side | `acp_analyses` (draft → running → completed) | rate limit, duplicate | reutilizează rularea în curs sau eroare sigură; draftul revine la stare anterioară |
| Market Data | colectare candidați | portofoliul propriu, colaborări active, `market_listings` | filtre pe tip/tranzacție/oraș, limite (200/400), exclude ținta și ofertele șterse/arhivate | filtrare pe organizație (colaborări doar dacă sunt activate de ambele părți) | – | lipsă date | 0 candidați → „Date insuficiente”, fără estimare |
| Comparables | similaritate, ajustări, outlieri | candidații colectați | prag de similaritate, preț obligatoriu, ajustări limitate, IQR pentru outlieri, deduplicare | – | comparabilele cu scoruri, ajustări, tier, motiv de includere/excludere | date incomplete | comparabilul e marcat și explicat, nu inventat |
| Deterministic Engine | toate valorile financiare | `engine.ts` (funcție pură) | fără rețea, fără AI, fără DB | – | rezultatul complet | – | rezultat „date insuficiente” explicit |
| Snapshot | reproductibilitate | rezultatul rulării | – | – | `target_data`, comparabile, market intelligence | market intelligence | eșecul snapshotului de piață nu blochează analiza |
| ACP Version | istoric | `recalculateAcpAsNewVersion` | claim optimist pe status, retry pe conflict de versiune | scoped | rând nou de versiune | conflict, eroare | rollback la starea anterioară, audit `acp.version.failed` |
| AI Interpretation | doar text explicativ | Lovable AI Gateway | context strict din snapshot, schemă Zod, timeout 60s, rate limit 10/utilizator + 40/agenție | scoped | `acp_ai_insights` | timeout, provider neconfigurat | valorile deterministe rămân valide, mesaj sigur, audit |
| PDF Report | livrabil | `report/pdf.server.ts` (pdf-lib) | raportul se generează din `report_data` al versiunii | scoped, path `{org}/{analysis}/...` | `acp_reports` + fișier în bucket privat | generare, storage | audit `acp.report.failed`, mesaj sigur |
| History | versiuni + rapoarte | DB | – | scoped | – | – | – |
| Audit | trasabilitate | `audit.ts` (client server-side) | rând valid doar cu organizație | `organization_id` obligatoriu | `audit_logs` | insert | best-effort: se loghează, nu blochează fluxul |

## 2. Determinism (freeze)

- `engine.ts` este singura sursă a valorilor financiare: valoare estimată,
  interval min/max, €/mp median, preț recomandat de listare.
- Este o funcție pură: aceleași intrări produc mereu același rezultat.
- AI nu poate modifica niciuna dintre aceste valori — nu scrie în `acp_analyses`.
- Snapshotul păstrează datele folosite la calcul, deci un raport vechi rămâne
  reproductibil.
- Versiunile livrate (cu raport sau interpretare AI) sunt imuabile.

## 3. Contractul de versionare

- O versiune draft (fără raport și fără AI) poate fi recalculată în loc.
- O versiune cu raport sau interpretare AI nu poate fi suprascrisă
  (`canRecalculateInPlace` → `locked`).
- „Recalculează cu date actuale” creează întotdeauna o versiune nouă
  (`version + 1`, cu `parent_analysis_id` și `root_analysis_id`).
- Versiunile vechi rămân accesibile în istoric, cu valorile lor originale.
- Fiecare raport este legat exact de `analysis_id`-ul versiunii din care a fost
  generat.

## 4. Securitate

- Toate operațiile ACP rulează în server functions, cu organizația derivată
  server-side din profilul utilizatorului (niciodată din input).
- RLS este activ pe toate tabelele ACP; auditul se scrie cu clientul de
  serviciu, după verificarea actorului și organizației.
- Un ID din altă organizație nu dă acces: analiza „nu este găsită”.
- Bucketul `acp-reports` este privat; accesul se face doar prin URL semnat
  temporar, iar path-ul este validat pe organizație.
- Proprietățile arhivate nu pot porni rulări noi (audit `acp.run.blocked`).
- Rate limiting: analize 20/utilizator + 60/agenție pe oră; AI 10 + 40 pe oră.
- Input validation: Zod pe fiecare server function.
- Mesajele de eroare pentru utilizator trec prin `safe-error.ts`; detaliile
  tehnice rămân doar în logurile serverului.

## 5. Contractul AI

AI este strat de **interpretare**, nu de **evaluare**.

Poate: explica rezultatul, sintetiza factorii, evidenția riscuri, formula
observații, genera interpretare profesională.

Nu poate: modifica valoarea, intervalul, €/mp sau prețul recomandat, introduce
comparabile nevalidate, deveni sursa adevărului financiar.

La timeout sau eroare de provider, analiza deterministă rămâne validă și
completă; interfața afișează un mesaj sigur, iar eșecul se auditează.

## 6. Limitarea datelor de piață (actuală)

Pool-ul extern de anunțuri este momentan **gol**. Comparabilele provin din:

- portofoliul propriu al agenției;
- colaborările disponibile.

Prin urmare: precizia statistică pe piață largă **nu este validată**,
calibrarea **nu este activată** (implicit `false` pe fiecare agenție), iar
indicatorii de acuratețe nu trebuie prezentați ca validați statistic.
Interfața afișează această limitare în secțiunea „Calibrare & Precizie” când
analiza nu conține oferte externe.

## 7. Calibrare

`calibration.ts`: mediană + MAD pe raportul observat/estimat, clamping ±15%,
praguri minime (12 global, 8 per segment), segmentare `city|type|rooms`.
Baseline-ul determinist rămâne raportat separat de valoarea calibrată.
Calibrarea este opt-in per agenție și nu se activează automat.

## 8. Erori

- Erori de bază de date/storage → mesaj generic pentru utilizator, detalii doar
  în log (`acpDbError`).
- Rulare duplicată (dublu-click, retry în 120s) → se reutilizează analiza în
  curs.
- Recalculare eșuată → rollback la statusul anterior.
- Snapshot de market intelligence eșuat → analiza rămâne validă.
- Zero comparabile sau date invalide → „Date insuficiente”, fără estimare falsă.

## 9. Fișiere principale

`src/lib/acp/`: `engine.ts`, `scoring.ts`, `adjustments.ts`, `statistics.ts`,
`confidence.ts`, `precision.ts`, `calibration.ts`, `config.ts`, `guards.ts`,
`safe-error.ts`, `audit.ts`, `versioning.ts`, `workflow.ts`,
`analyses.functions.ts`, `reports.functions.ts`, `calibration.functions.ts`,
`workflow.functions.ts`, `ai/`, `report/`.

UI: `src/components/app/PropertyAcpCard.tsx`, `AcpPrecisionCard.tsx`,
`AcpReportCard.tsx`, `AcpVersionsCard.tsx`, `AcpAiInsight.tsx`; rute
`src/routes/_authenticated/app.acp.*`.

Migrații: `0029`–`0035` (infrastructură + market data), `0036` (raport),
`0037` (indexuri market intelligence), `0038` (AI insights),
`0039` (calibrare). Stage 10: **MIGRATIONS: NONE**.

## 10. Indice de preț al locuințelor (Eurostat) — strat de date

Stare: **doar date**. Nimic din motorul determinist, scoring, ajustări, analize
sau rapoarte nu citește acest indice; există un test care verifică asta.

Sursa (verificată pe API-ul live):

- endpoint: `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hpi_q`
- set de date: `prc_hpi_q` („House price index - quarterly data")
- parametri: `format=JSON`, `lang=EN`, `freq=Q`, `geo=RO`, `unit=I15_Q`
  („Quarterly index, 2015=100" — formă de indice, NU rată de variație),
  `purchase=TOTAL | DW_NEW | DW_EXST`; opțional `lastTimePeriod=1` pentru
  verificarea ieftină „este deja la zi?".

Se stochează în `market_price_indices`: `source`, `dataset`, `series`
(`total`, `new_dwellings`, `existing_dwellings`), `region`, `unit`,
`period_year`, `period_quarter`, `index_value`, `base_label` (`2015=100`),
`published_at` (`updated` raportat de Eurostat), `import_run_id`,
`created_at`, `updated_at`. Cheia unică:
`(source, dataset, series, region, unit, period_year, period_quarter)`.
Citirea este rezervată superadminului (RLS), scrierea doar rolului de serviciu.

Revizuiri: Eurostat corectează trimestre trecute. Sincronizarea aduce întreg
istoricul publicat și face upsert pe cheia unică — o valoare schimbată
actualizează rândul existent și se numără `updated`, niciodată duplicat.
Fiecare rulare (automată săptămânală sau „Sincronizează acum" din
Superadmin → Nomenclator) se jurnalizează în `market_import_runs` cu sursa
`eurostat` și contoarele primite/noi/revizuite/neschimbate/invalide plus erori.
Când cel mai nou trimestru publicat este deja stocat și publicarea Eurostat nu
este mai nouă, rularea se încheie cu statusul `skipped` și nu scrie nimic.

Limitare declarată: indicele este **național** (România, fără defalcare pe
orașe sau zone) și, când va fi folosit, se aplică exclusiv ca **ajustare în
timp** între două trimestre. O perioadă lipsă înseamnă lipsa ajustării,
niciodată o valoare inventată.

## 11. Ajustarea în timp a comparabilelor (motor v2)

Motorul determinist este versionat. O schimbare de metodologie nu modifică
niciodată o versiune existentă: analizele salvate păstrează `engine_version` și
se recalculează identic cu versiunea lor.

- **v1** — motorul original: scoring + ajustări de caracteristici.
- **v2** — în plus, prețul fiecărui
  comparabil este adus la trimestrul analizei cu
  `index(trimestrul analizei) / index(trimestrul comparabilului)`, seria `total`
  a indicelui trimestrial al prețurilor locuințelor.
- **v3** (curent, `ACP_CURRENT_ENGINE_VERSION`) — în plus, comparabilele pot fi
  cerute **live** surselor partenere activate, în momentul rulării.

Reguli (`src/lib/acp/time-adjustment.ts`, funcții pure):

- indicele se citește **exclusiv** din `market_price_indices`
  (`src/lib/acp/time-adjustment.server.ts`); la momentul analizei nu se face
  niciun apel HTTP. Tabel gol ⇒ comportamentul v1 plus o notă explicativă;
- trimestrul comparabilului vine din ultima observare reală a ofertei; fără el,
  fără ajustare și motivul este consemnat;
- când trimestrul analizei depășește ultimul trimestru publicat, raportul se
  **plafonează** la ultimul trimestru publicat, iar acest lucru este consemnat;
- lipsa indicelui pentru trimestrul comparabilului ⇒ fără ajustare, cu motiv;
- un raport în afara intervalului `0.5 – 2.0` este **refuzat** (fallback fără
  ajustare, cu motiv), ca un import greșit al indicelui să nu poată deforma o
  evaluare;
- indicele este **național** (România) — raportul spune explicit acest lucru
  acolo unde ajustarea este arătată.

Rezultatul este explicit: pe fiecare comparabil se salvează prețul original,
trimestrul folosit, raportul aplicat și prețul ajustat; la nivel de analiză se
salvează indicele, sursa, baza, plafonarea și câte comparabile au rămas
neajustate. Toate apar și în PDF, în secțiunea „Ajustarea în timp a
comparabilelor".

Recalcularea în loc a unei analize păstrează versiunea motorului a analizei;
versiunile noi (`recalculateAcpAsNewVersion`) folosesc versiunea curentă.

### 11.1 Afișarea în interfață

- Ecranul analizei arată versiunea metodologiei (badge) și, pentru v2, un card
  „Ajustarea în timp a comparabilelor": trimestrul analizei, indicele (sursă, set
  de date, serie, bază), avertismentul că indicele este NAȚIONAL, trimestrul la
  care se oprește ajustarea când este plafonată și câte comparabile au fost
  ajustate față de câte nu.
- Fiecare comparabil arată prețul original, trimestrul din care provine,
  raportul și prețul ajustat; dacă nu a fost ajustat, motivul în română simplă.
- Analizele v1 nu afișează nimic din acest bloc: arată exact ca înainte.
- Istoricul de versiuni afișează metodologia fiecărei versiuni.
- Toate apelurile de producție ale motorului încarcă indicele cu `loadPriceIndex`
  și transmit versiunea corectă a motorului; un test de regresie
  (`time-adjustment-view.test.ts`) cade dacă un apel nou omite `priceIndex` sau
  `engineVersion`.

## 12. Comparabile cerute live de la surse partenere (motor v3)

Sursele activate sunt întrebate **doar** în momentul rulării analizei. Nu există
pool de piață alimentat de acest modul, nu există crawling, nici rulări
programate; nu se descarcă imagini și nu se citesc date de contact.

- `src/lib/acp/market-query/` — portul și registrul (`port.ts`), criteriile pure
  (`criteria.ts`), normalizarea comună (`normalize.ts`), cache-ul doar de
  sesiune (`session-cache.ts`, TTL 3 minute), cererile politicoase
  (`fetch.server.ts`) și rularea (`run.server.ts`).
- Modulul este livrat **fără nicio sursă activată**: `adapters.register.ts` este
  gol, iar adaptoarele se adaugă pe rând.
- Cereri politicoase: User-Agent descriptiv cu contact, robots.txt respectat, o
  cerere pe rând per domeniu, fără autentificare, fără proxy, fără mascare.
- Fiecare sursă are propriul timp maxim de așteptare (implicit 4000 ms);
  interogările rulează în paralel. O sursă care expiră sau dă eroare este
  consemnată, iar analiza continuă cu rezultatele parțiale.
- Se păstrează din răspuns **exclusiv** câmpurile folosite de analiză: preț,
  monedă, suprafață, camere, localitate, zonă, data anunțului și linkul. Un
  comparabil fără preț sau fără suprafață este eliminat.
- `acp_analysis_sources.outcome` / `outcome_detail` țin dovada per sursă a
  analizei salvate; ecranul analizei („Baza de dovezi") și PDF-ul arată aceeași
  informație.
- Superadmin → Nomenclator → „Interogare live a portalurilor": activare, timp
  maxim, rază, bandă de preț, contoare și „testează sursa" (o interogare, fără
  salvare).
- Analizele v1/v2 nu declanșează niciodată o interogare live: recalcularea în loc
  folosește versiunea stocată a motorului.

## 13. Interogare live — sursa Imospot.ro

Primul adaptor al portului `market_query`. Doar interogare, în momentul
analizei; nimic nu se stochează în afara analizei salvate.

- Cheia sursei: `imospot`, livrată **dezactivată** (`market_query_sources`).
- Adresă publică: `https://www.imospot.ro/toate-ofertele-din-{slug}` cu
  parametrii sursei: `tranzactie` (`vanzari` | `inchirieri`), `categorie`,
  `rooms` (1–5), `price_min`, `price_max`, `area_min`, `area_max`, `sort`
  (`-cele-mai-noi`), `page`. `city_id` / `neighborhood_id` se trimit doar când
  îi cunoaștem cu certitudine. Se construiesc numai parametrii pe care noi
  chiar îi restrângem.
- Categorii — vânzare: `apartamente-de-vanzare` (apartament, garsonieră),
  `case-vile-de-vanzare`, `terenuri-de-vanzare`,
  `birouri-si-spatii-comerciale-de-vanzare` (spațiu comercial, birou),
  `hale-si-depozite-de-vanzare` (industrial).
- Categorii — închiriere: `apartamente-de-inchiriat`, `case-vile-de-inchiriat`,
  `terenuri-de-inchiriat`, `birouri-si-spatii-comerciale-de-inchiriat`,
  `hale-si-depozite-de-inchiriat`.
- Localități: hartă explicită (`imospot/locations.ts`) — București, cele șase
  sectoare (`sectorul-N-bucuresti`) și cartierele confirmate
  (`/bucuresti/militari`, `/domenii`, `/rahova`). Zonă fără corespondent →
  nivelul orașului. Localitate fără corespondent → nicio cerere; niciun slug nu
  se ghicește.
- Cel mult 2 pagini (24 de rezultate) per interogare, cu oprire mai devreme la
  12 comparabile. Cereri politicoase și identificate, robots.txt respectat, o
  cerere pe rând, fără autentificare, cookie-uri sau mascarea identității.
- Per rezultat: adresă, titlu, preț și monedă, camere, suprafață,
  localitate/sector afișat, agenție și vechimea relativă convertită în dată.
  Fără preț sau fără suprafață → rezultatul se aruncă. Imaginile și datele de
  contact nu sunt citite.
- Cifrele agregate publicate de sursă (mediane, chirie mediană, timp mediu pe
  piață, distribuții) se citesc separat, ca bloc „Cifre publicate de Imospot",
  etichetat cu data citirii, și nu intră în niciun calcul al analizei.
- Status 403/429 sau lipsa corpului → eroare consemnată per sursă; analiza
  continuă cu rezultate parțiale. Timeout-ul este consemnat, nu fatal.
