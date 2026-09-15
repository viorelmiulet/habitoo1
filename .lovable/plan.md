# Stage 19 — Prospectare cu sursă reală + integrare Manager

## 1. Inventar surse (rezultat verificat)

Am verificat registrul de prospectare, portalurile și conexiunile disponibile în workspace:

- Providere implementate: `http_feed` (feed JSON autorizat, HTTPS, robots.txt), `manual_list` (lista proprie a agenției / fixture).
- Chei rezervate fără integrare: `olx`, `imobiliare_ro`, `storia`, `publi24`.
- Conexiuni externe disponibile: doar GitHub și Google Search Console — niciuna nu este o sursă de anunțuri.
- La Cheie este integrare de **publicare** a ofertelor agenției; nu va fi folosită ca sursă de prospectare, chiar dacă expune `GET /properties`.

**Concluzie: nu există momentan o sursă externă reală și autorizată de anunțuri.** Stage 19 nu va declara „real prospecting connected”. Implementăm infrastructura completă plug-in și un status onest `source_unavailable`, plus `http_feed` gata să devină sursă reală în momentul în care agenția configurează un feed autorizat (URL + mapare, server-side).

## 2. Contract de provider explicit

- Extind `ProspectingSourceProvider` cu `availability: "live" | "manual" | "unavailable"` și `capabilities` (`search`, `fetch_listing`, `pagination`, `health_check`).
- Adaug cod nou `source_unavailable` în `ProspectFetchResult` (distinct de `not_configured` / `failed` / `blocked`).
- Provider nou `unavailable.server.ts`: pentru cheile rezervate (`olx`, `imobiliare_ro`, `storia`, `publi24`) returnează determinist `source_unavailable`, cu mesaj clar, fără date. Se înregistrează în registry astfel încât sursele existente în DB să aibă un provider onest, nu „lipsă integrare”.
- `registry.server.ts`: `listProspectingProviders()` expune availability + capabilities; helper nou `providerAvailability(key)` și `hasLiveProspectingSource(sources)`.

## 3. `http_feed` pregătit pentru sursă reală

Fără a inventa endpointuri: păstrez comportamentul actual și completez ce lipsește pentru o sursă reală.

- Autentificare server-side opțională prin secret referențiat în configurație (nume de secret, nu valoare) — niciodată în loguri sau în UI.
- Paginare opțională (`page`/`per_page` din configurație), cu limită globală de itemi.
- Rate limit per sursă și timeout deja existent; retry doar pentru transient (timeout/5xx/429).
- Atribuire sursă: `source`, `source_id`, `source_url`, `fetched_at`, `published_at` normalizate.
- SSRF: doar HTTPS, fără host-uri locale/IP private, allowlist de host din configurația sursei.

## 4. Runtime + onestitate

- `runtime.server.ts`: agreg `sourceAvailability` în starea rulării; când nicio sursă nu e `live`, rularea se termină cu status explicit `source_unavailable` (0 candidați, notă clară), nu `completed` cu date fabricate.
- Datele fixture rămân marcate `fixture: true` și nu sunt niciodată prezentate ca piață reală.
- Normalizare / clasificare (owner, agency, developer, unknown — necunoscutul NU devine proprietar) / dedupe / scoring determinist se refolosesc neschimbate; scorul rămâne determinist, AI doar explică.
- Importul în CRM rămâne exclusiv prin aprobarea existentă; nicio creare automată, niciun mesaj trimis.

## 5. Manager Agent

- `intent.ts`: extind detecția „găsește proprietăți noi / anunțuri noi / proprietari” pentru rutare la prospecting (rămâne pe lângă keyword-urile actuale).
- `runtime.server.ts`, pasul `prospecting_check`: folosește availability reală; dacă nu există sursă `live`, pasul se marchează `blocked` cu mesaj exact („nu există momentan nicio sursă externă de anunțuri conectată”) și planul se oprește înainte de ACP/marketing, fără rezultate inventate.
- Când o sursă live există, planul continuă: prospecting → filtrare/scor → verificare CRM/dedupe → ACP determinist opțional → propuneri marketing → oprire la approval.

## 6. UI (navy/gold, aerisit)

- `/app/prospecting`: card „Surse” cu nume, tip, status (Conectată / Listă proprie / Indisponibilă / Dezactivată), ultima colectare, ultimul rezultat; banner explicit când nicio sursă reală nu e conectată. La candidați: scor, motivul scorului (factori), sursa originală (link), status dedupe, badge fixture, buton de import care trece prin aprobare.
- `/app/ai-manager`: în panoul planului, pasul de prospectare arată sursa, statusul și motivul indisponibilității.

## 7. Teste

Fișier nou `src/lib/prospecting/tests/providers.test.ts` plus completări în `security.test.ts`, `reliability.test.ts`, `workflow.test.ts` și `src/lib/ai/agents/manager/tests/`:

registry + capabilities; provider `unavailable` onest; feed real (mock HTTP) cu timeout, retry transient, no-retry permanent, paginare, rate limit; normalizare; clasificare owner/agency/unknown; dedupe stabil; scoring determinist; atribuire sursă; SSRF; prompt injection tratat ca DATA; org isolation; approval înainte de import; fără efecte duplicate; rutare Manager la prospecting; comportament Manager fără sursă; ACP rămâne determinist; regresii existente.

## 8. Migrații

Nicio migrație nouă dacă `prospecting_runs` acceptă statusul necesar; altfel o migrație minimă pentru statusul `source_unavailable` (cu RLS și GRANT-uri păstrate). Verific schema înainte.

## 9. Verificare finală

`bunx vitest run` (suită completă), `bunx tsgo --noEmit`, build, verificare UI. Raportez: sursa reală conectată (dacă apare vreuna), configurația folosită fără secrete, ce rămâne indisponibil, numărul de teste PASS/FAIL/SKIPPED, typecheck/build, fișiere și migrații.

La Cheie rămâne production-only; nu reintroduc mediul TEST. Fără Lovable AI ca runtime, fără servicii AI plătite, fără Bright Data sau scraping agresiv.
