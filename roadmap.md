## Faza 2 – de finalizat

- [x] Erorile de typecheck rezolvate (typecheck curat).
- [x] Faza 2: proprietăți, media, contacte, cereri, potriviri, lead-uri, activități, calendar, dashboard-uri, rapoarte, obiective, search global, quick add.

## QA / Demo Data

- [x] Organizație demo izolată, funcții DB protejate, server functions superadmin-only, panou Superadmin → QA / Demo Data, indicator DEMO, seed realist, E2E pe date QA, bug-fix-uri, validare finală.

## Site public Habitoo CRM

- [x] Tokens navy/gold + utilități marketing în styles.css (fără a atinge tokenii existenți).
- [x] Layout public: header sticky + meniu mobil, footer complet, helper SEO (title/description/OG/canonical/fonturi).
- [x] Mockup-uri UI din componente reale: dashboard, proprietăți, pipeline lead-uri, matching, rapoarte/obiective, mini-mockups module.
- [x] Homepage refăcut: hero, value strip, flux „totul într-un singur loc”, proprietăți, lead-uri, matching, dashboard/rapoarte, beneficii, CTA final, footer.
- [x] Pagini: /functionalitati, /preturi, /despre, /contact, /confidentialitate, /termeni.
- [x] sitemap.xml + lang="ro".
- [x] Verificare 1440/1024/768/390, linkuri, typecheck, build, polish vizual (hero cards, KPI mobil, h1 subpagini, pipeline mock, contrast în secțiunea navy).

## Următorii pași (pregătiți)

- [ ] Conectare formular contact la un canal real (necesită adresă de email / tabel dedicat — aprobare utilizator).
- [ ] Imagine OG 1200×630 dedicată pentru paginile publice (după aprobare).
- [x] Texte reale pentru /confidentialitate și /termeni (date companie rămase placeholder [...], completate de client).
- [ ] Leads module — audit QA complet (cerință anterioară rămasă deschisă).

## Arhitectura domeniilor

- [x] Site public pe habitoo.ro / www.habitoo.ro (comportament neschimbat).
- [x] crm.habitoo.ro deschide direct aplicația (redirect host-based de la `/` la `/app`).
- [x] Guard `_authenticated` trimite la `/login?redirect=<rută>`; login și callback OAuth revin la ruta cerută.
- [x] noindex pe layout-urile CRM (app, superadmin, onboarding).

## Interfața autentificată – audit + premium (în lucru)

- [x] Audit complet (shell, primitive, pagini agent, pagini Superadmin) – documentat în `.lovable/audit-ui-autentificata.md`.
- [x] Fundație: fonturi brand în CRM, `friendlyError`/`toastError`, skeleton-uri, stare de eroare cu retry, ConfirmDialog, PromptDialog, SectionCard.
- [x] Shell nou: sidebar colapsabil (persistă), workspace card, user card + logout, topbar compact cu breadcrumbs, meniu notificări, temă light/dark, bottom nav mobil.
- [x] Shell Superadmin distinct (mod „Platformă”), fără a atinge guard-urile.
- [x] Primitive: PageHeader (back, eyebrow, meta), KpiCard (trend, link, skeleton), EmptyState, StatusBadge (dot) – compatibile cu site-ul public.
- [x] Pagini agent: `window.prompt` înlocuit cu PromptDialog (filtre salvate, etichete), confirmare la arhivare proprietate și ștergere obiectiv, aria-labels pe butoanele icon, skeleton-uri în loc de „Se încarcă…”, `toastError` în toate rutele autentificate.
- [x] Superadmin: dashboard cu stări loading/eroare/gol, KPI cu linkuri, status/plan/audit umanizate; listele folosesc skeleton-uri.
- [ ] Notificări: pagină refăcută (filtre, grupare pe zi, marcare individuală) – meniul rapid din topbar este gata.
- [ ] Superadmin: agenții (drawer detalii, acțiuni confirmate), utilizatori (filtre), audit (filtre, paginare, detalii).
- [ ] Pipeline lead-uri: fallback tastatură/touch pentru drag & drop.
- [x] Verificare vizuală 1440/390 light + dark pe toate rutele autentificate, typecheck, build, fără erori consolă/network.
  - Notă: avertismentul dev intermitent „state update on a component that hasn't mounted yet” provine din `@tanstack/react-router` (Transitioner.startTransition la încărcarea inițială), nu din codul aplicației.

## Storia.ro (OLX Group RE API)

- [x] Faza 1 — OAuth2 per agenție: buton de conectare în Superadmin → Portaluri, `state` CSRF cu un singur consum, callback public, schimb de cod pe token, tokenuri criptate per agenție, reîmprospătare automată + o reîncercare la 401, stare afișată în Superadmin.
- [ ] Faza 2 — taxonomie Storia (URN-uri) cu cache și reîmprospătare periodică (așteaptă confirmarea utilizatorului).
- [ ] Faza 3 — publicare/actualizare/retragere anunțuri, flux asincron cu `advert_uuid` + validări locale înainte de trimitere.
- [ ] Faza 4 — webhook de notificări (HMAC SHA1, răspuns rapid 2xx) + mesaje Storia transformate în lead-uri.
- [ ] Neimplementat intenționat: promovări (VAS), Primary Market.
- [ ] Necesită de la utilizator: secretele `OLX_CLIENT_ID`, `OLX_CLIENT_SECRET`, `OLX_BASIC_BASE64`, `OLX_API_KEY`, `OLX_NOTIFICATION_SECRET` și înregistrarea callback-ului în Application Manager.

## Storia — legarea mesajelor reale

- [x] Identificator canonic `ADSLUG:` pentru URL și `data.ad_id`, cu fallback de citire pentru `AD:` istoric.
- [x] Backfill sluguri din `public_url` pentru anunțurile existente.
- [x] Reprocesare notificări nefinalizate și verificare lead pentru `RF-1001`.
- [x] Typecheck, teste și build.

## Fișă de vizionare

- [x] Selector „Pentru client” / „Pentru alt agent”, cu telefoane afișate doar pentru client și branding Habitoo în subsol.

## Contracte și documente

- [x] Catalog curățat: exclusiv contractul real de închiriere și contractul real de reprezentare exclusivă; șabloanele generice temporare au fost eliminate.
- [x] Document nou din proprietate/contact, cu completare automată din fotografia actului (imaginea nu se salvează).
- [x] CNP și seria/numărul actului criptate AES-256-GCM; afișare în clar doar pentru creator/administrator, cu audit.
- [x] PDF brandat cu logo-ul agenției, atașat automat la proprietate și contact.
- [x] Semnare la distanță: link personal, valabil 7 zile, consumat o singură dată, semnătură pe canvas, IP + user agent + dată în dovada semnării.
- [x] Pagini: /app/contracts, /app/contracts/$id, pagina publică /semnare.
- [x] Etapa 2: contract real de închiriere cu proprietar și chiriaș, anexă opțională de inventar în același PDF și listă implicită configurabilă per agenție.
## Contract de reprezentare exclusivă
- [x] Adaugă setări agenție pentru reprezentant legal și funcție.
- [x] Adaugă șablonul real și câmpurile editabile, inclusiv fără proprietate.
- [x] Integrează PDF-ul și semnăturile în două coloane.
- [x] Rulează typecheck și testele.

## ACP – Analiză Comparativă de Piață (etapa 1: infrastructură)
- [x] Cele 8 tabele de piață și ACP, cu indexuri, RLS și pool comun doar-citire (migrația 0029).
- [x] Motor determinist: similaritate cu ponderi centralizate, praguri 85/70, outlieri IQR, statistici (min/max/medie/mediană/P25/P75, preț/mp).
- [x] Adaptoare pentru proprietăți proprii și oferte de piață normalizate; puncte de integrare pentru audit.
- [x] Pagini iniţiale /app/acp și /app/acp/new, cu surse selectabile și snapshot al proprietății.

## ACP – etapa 2: motor real de analiză (fără AI)
- [x] Migrația 0030: ajustări, snapshot comparabil, decizii manuale, statistici salvate, versiune și istoric de rulări.
- [x] Colectare candidați din proprietățile agenției și din Colaborare (portalurile rămân pentru etapa 3).
- [x] Ajustări explicabile per factor, outlieri IQR, estimare min/valoare/max, preț recomandat și confidence score determinist.
- [x] Pagina de detaliu: KPI, proprietatea analizată, grafic preț/mp, listă de comparabile cu imagine, include/exclude manual, recalculare și „Cum s-a calculat”.
- [ ] Etapa următoare: import portaluri, deduplicare entități, rapoarte PDF și sumar AI.


## ACP – faza 3, etapa 4: Market Intelligence
- [x] Strat determinist reutilizabil (`market/intelligence.ts`): filtre, agregări, percentile/distribuții, prospețime, acoperire, poziționare, trenduri lunare.
- [x] Agregări server-side pe baza de date (`intelligence.server.ts`) + indexuri aditive (migrația 0037).
- [x] Server functions cu Zod, organizație activă, izolare pe organization_id și rate limiting.
- [x] Card Market Intelligence în /app/acp/$id și în „Date piață”, cu stări insuficient/gol explicite.
- [x] Snapshot de piață salvat în versiunea ACP și inclus în raportul PDF (istoric reproductibil).
- [x] Teste: 42 noi, suită completă 410, typecheck și build curate.
- [x] Etapa 5 (AI ACP) – finalizată, vezi mai jos.

## ACP – etapa 5: analist AI
- [x] Migrația 0038: tabelul `acp_ai_insights` (organizație, analiză, versiune, snapshot, prompt/schema version, status, insight, audit), RLS de citire pe accesul la analiză, scriere doar server-side.
- [x] Schema de ieșire v2 cu 9 secțiuni + metadata, validare Zod, sanitizare, compatibilitate cu interpretările vechi.
- [x] Prompt versionat (`acp-ai-prompt-2`), datele anunțurilor tratate strict ca date (anti prompt injection).
- [x] Context legat de versiunea ACP + snapshot, cu Market Intelligence exclusiv din snapshot.
- [x] Server functions: status, generare (rate limit 10/oră utilizator, 40/oră agenție, audit reușită/eșec), istoric regenerări.
- [x] UI „Analiză AI” cu istoric, metadata (model, versiune, snapshot) și disclaimer; PDF cu secțiune AI opțională.
- [x] Teste: 20 noi (total 430), typecheck și build curate; generare reală validată pe gateway.

## ACP – etapa 6: ACP integrat în workflow-ul CRM
- [x] Filă „ACP” și CTA „Analiză comparativă de piață (ACP)” în pagina proprietății, cu status, versiune, surse și data ultimei analize.
- [x] Statusuri de workflow derivate din datele existente (`workflow.ts`): fără analiză / în pregătire / în curs / finalizată / date insuficiente / eroare — fără statusuri noi în baza de date.
- [x] `workflow.functions.ts`: `getPropertyAcpWorkflow` (citire fără recalculare, ultima versiune + snapshot) și `applyAcpRecommendedPrice` (confirmare explicită, audit, rate limit).
- [x] „Preț proprietate” vs. „Preț recomandat ACP” cu diferență valorică/procentuală, copiere și aplicare manuală confirmată; fără suprascriere automată.
- [x] Reutilizare integrală a versionării, raportului PDF, Market Intelligence și interpretării AI existente (AI doar strat explicativ).
- [x] Teste: 21 noi (total 451), typecheck și build curate; nicio migrare nouă necesară.

## ACP – etapa 7: calibrare, precizie și matching avansat
- [x] Migrația aditivă 0039: tabelul `acp_calibrations` (versiuni de calibrare, factor, mediană/MAD, bias, eșantion, segmente, metrici, model activ) cu RLS pe organizație și indexuri unice; `organizations.acp_calibration_enabled` + `acp_calibration_min_sample_size`.
- [x] `calibration.ts`: calibrare versionată pe date reale (raport observat/estimat, mediană + MAD, clamping ±15%, praguri minime 12 global / 8 per segment, segmentare doar cu volum și stabilitate suficiente); baseline determinist păstrat separat de valoarea calibrată.
- [x] `precision.ts`: prospețime per anunț, calitatea datelor per comparabil, istoric de preț și relevanță; scor de calitate a analizei separat de scorul de încredere, cu motive explicite.
- [x] Motorul rămâne determinist: `runAcpAnalysis(..., options)` sortează comparabilele după relevanță, iar calibrarea se aplică doar ca strat final, explicabil și reversibil.
- [x] `calibration.functions.ts`: rulare/aplicare calibrare cu Zod, organizație activă, izolare pe organization_id, audit și rate limiting.
- [x] UI „Calibrare & Precizie” în pagina analizei + setări de agenție (activare, eșantion minim, recalibrare manuală).
- [x] Secțiune „Calibrare și calitatea datelor” în raportul PDF, doar pentru versiunile care au aceste date (rapoartele istorice rămân neschimbate).
- [x] Surse externe: nicio simulare — adaptoarele neconfigurate rămân `NOT_CONFIGURED`.
- [x] Teste: 29 noi (total 480), typecheck și build curate.

## ACP – etapa 8: production hardening
- [x] Audit tehnic al server functions ACP (analize, versiuni, rapoarte, AI, calibrare, workflow, market data): izolarea pe organizație, validările Zod, rate limiting și auditul existente au fost confirmate; nicio migrare nouă necesară.
- [x] Erori sigure pentru client: `safe-error.ts` (`acpError`, `acpDbError`, `acpSafeMessage`) — detaliile de bază de date/storage rămân doar în logurile serverului.
- [x] Protecție la rulări duplicate: `guards.ts` (fereastră de 120s pentru reutilizarea unei analize în curs) + blocare optimistă prin update condiționat pe status la recalculare.
- [x] Imutabilitatea versiunilor livrate: o versiune cu raport sau interpretare AI nu mai poate fi recalculată în loc, ci doar ca versiune nouă.
- [x] Rate limiting pe pornirea analizei (20/utilizator, 60/agenție pe oră) și validare strictă a surselor (doar tipurile cunoscute).
- [x] Timeout de 60s pentru providerul AI, cu mesaj dedicat; motorul determinist rămâne valid dacă AI eșuează.
- [x] Audit nou `acp.report.failed` la eșecul generării raportului; refacerea statusului anterior la recalculări eșuate.
- [x] Teste: 11 noi (total 491), typecheck și build curate.

## ACP – etapa 9: test end-to-end
- [x] E2E real în aplicație (utilizator autentificat, două agenții): flux complet proprietate → analiză → comparabile → versiune → raport PDF → istoric.
- [x] Defect reparat: auditul ACP scria prin clientul public (RLS respingea inserarea); `audit.ts` folosește acum clientul server-side, cu teste dedicate.
- [x] Defect reparat: proprietățile arhivate puteau porni rulări noi; `canRunAcpForTarget` blochează crearea și recalcularea, cu audit `acp.run.blocked` și mesaj clar în interfață.
- [x] Verificat: cross-org blocat (mesaj „Analiza nu a fost găsită”), raport PDF privat cu URL semnat, versiuni istorice intacte, recalculare simultană fără suprascriere, zero comparabile → „Date insuficiente” fără estimare falsă.
- [x] Teste: 498 (44 fișiere), typecheck și build curate.
- [ ] Limitare deschisă: pool-ul extern de anunțuri este gol, deci calibrarea pe volum real de piață nu poate fi validată (rămâne dezactivată implicit).

## ACP – etapa 10: finalizare și release freeze
- [x] Audit final de arhitectură documentat în `docs/acp.md`: fiecare etapă a fluxului (proprietate → analiză → market data → comparabile → motor determinist → snapshot → versiune → AI opțional → raport PDF → istoric → audit) cu responsabilitate, sursa datelor, validări, organizație, ce se persistă, ce poate eșua și comportamentul la eroare.
- [x] Freeze al motorului determinist: `engine.ts` rămâne singura sursă a valorilor financiare, funcție pură și reproductibilă; AI nu scrie valori; snapshot-urile păstrează datele de calcul; versiunile livrate sunt imuabile. Nicio modificare de implementare necesară.
- [x] Contract de versionare documentat (draft recalculabil, versiune livrată imuabilă, recalculare = versiune nouă, raport legat exact de versiune).
- [x] Security freeze documentat: server-side scoping pe organizație, RLS activ, bucket privat + URL semnat, validare path/ownership, blocarea proprietăților arhivate, rate limiting, Zod, erori sigure. Nicio protecție relaxată.
- [x] Contract AI documentat: strat de interpretare, nu de evaluare; la timeout/eroare analiza deterministă rămâne validă.
- [x] Limitarea datelor de piață documentată și afișată în UI: când analiza nu conține oferte externe, secțiunea „Calibrare & Precizie” explică faptul că precizia nu este validată statistic pe piață largă. Calibrarea rămâne dezactivată implicit.
- [x] Suită finală: 498 teste passed / 0 failed / 0 skipped (44 fișiere), typecheck curat, build de producție reușit — identic cu Stage 9.
- [x] Release audit: fără TODO critice, fără debug output, fără mock-uri în producție, fără date de test rămase, fără endpoint-uri ACP neprotejate, fără texte tehnice expuse.
- [x] MIGRATIONS: NONE.
- [x] **ACP FROZEN FOR PRODUCTION** — modificările viitoare ale motorului determinist se tratează ca schimbări controlate de versiune.

### ACP – viitor (neimplementat)
- [ ] Ingestie de date de piață externe (portaluri/furnizori suplimentari).
- [ ] Volum real de piață.
- [ ] Măsurarea acurateței statistice.
- [ ] Calibrare pe date reale de piață.
- [ ] Calibrarea scorului de încredere.

## Habitoo AI – etapa 11A: fundația AI (Mastra + Gemini)
- [x] AI Gateway server-side (`src/lib/ai/gateway/`): singurul punct prin care aplicația cere AI; frontendul nu apelează niciodată providerul.
- [x] Abstracție de provider (`AIProvider`) cu implementare Gemini; OpenAI și Anthropic se pot adăuga fără a atinge tool-urile sau interfața.
- [x] Mastra (`@mastra/core`) ca runtime de tool-uri, rulat server-side, fără serviciu cloud plătit.
- [x] Context builder pur, pe categorii (property, client, lead, acp, activity, document), cu listă albă de câmpuri.
- [x] Registry de 8 tool-uri READ (proprietăți, clienți, leaduri, ACP + istoric ACP), fiecare org-scoped, validat cu Zod, autorizat și auditat.
- [x] Strat de permisiuni: modelul cere tool-ul, Habitoo decide execuția (autentificare → agenție → rol → tool → validare → interogare filtrată).
- [x] Protecție prompt injection: datele CRM sunt date, nu instrucțiuni; prompt separat SYSTEM / SECURITY RULES / TOOL DEFINITIONS / CRM CONTEXT / USER REQUEST.
- [x] Control de cost: 6/min și 40/oră per utilizator, 200/oră per agenție, 4000 caractere, 4 pași și 6 tool-uri pe cerere, protecție dublu-click.
- [x] Usage tracking (`ai_usage_events`) și audit (`ai.chat.request`, `ai.chat.failed`, `ai.tool.executed`, `ai.tool.denied`), fără chei sau secrete.
- [x] Migrare aditivă `0040_ai_foundation.sql`: `ai_conversations`, `ai_messages`, `ai_usage_events` cu GRANT-uri și RLS.
- [x] Interfață: Setări → AI (stare, furnizor, model, limite, consum) și `/app/ai` (conversație minimă, stări sigure).
- [x] Documentație: `docs/ai/architecture.md`.
- [x] Teste: 26 noi (total 524, 47 fișiere), typecheck curat, build de producție reușit.
- [x] `GEMINI_API_KEY` configurat și verificat cu o cerere reală către provider.

## Habitoo AI – etapa 11: agent, workflow, state, tracing
- [x] Habitoo AI Coordinator (`agent/coordinator.server.ts`): buclă model → tool autorizat → model → răspuns structurat, independent de provider.
- [x] Tool-uri READ extinse cu `get_acp_report` și `get_comparables` (org-scoped prin analiza-părinte).
- [x] `habitooDiagnosticWorkflow`: authenticate → resolve_organization → build_context → agent → approval → read_tool → validate → respond.
- [x] Aprobare umană: fluxul suspendă la propunerea agentului (doar citiri) și se reia după Aprob / Resping.
- [x] State persistent în `ai_workflow_runs` — backendul este serverless, deci starea supraviețuiește repornirii.
- [x] Retry doar pentru erori tranzitorii (`reliability/retry.ts`), fără reîncercarea operațiilor cu risc de duplicare.
- [x] Memorie de conversație pe termen scurt, separată de starea workflow-ului; fără memorie permanentă.
- [x] Tracing în `ai_trace_events`: agent, workflow, pas, tool, model, eroare, latență, fără secrete.
- [x] Interfață `/app/ai`: retry, indicator de context, card de aprobare a fluxului.
- [x] Arhitectură de scraping pregătită, fără provider activ (fără Bright Data).
- [x] Migrare aditivă `0041_ai_workflow_state_and_tracing.sql` cu RLS strict pe agenție.

### Habitoo AI – neimplementat în 11A
- [ ] Acțiuni (email, WhatsApp, publicare portal, ștergere, modificare preț, contracte).
- [ ] Agent autonom, agent de fundal, multi-agent, memorie AI permanentă.
- [ ] Streaming al răspunsului.
