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
