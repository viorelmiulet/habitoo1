
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
- [ ] Texte reale pentru /confidentialitate și /termeni (date companie, operator de date).
- [ ] Leads module — audit QA complet (cerință anterioară rămasă deschisă).

## Arhitectura domeniilor
- [x] Site public pe habitoo.ro / www.habitoo.ro (comportament neschimbat).
- [x] crm.habitoo.ro deschide direct aplicația (redirect host-based de la `/` la `/app`).
- [x] Guard `_authenticated` trimite la `/login?redirect=<rută>`; login și callback OAuth revin la ruta cerută.
- [x] noindex pe layout-urile CRM (app, superadmin, onboarding).
