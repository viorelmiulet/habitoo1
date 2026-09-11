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
