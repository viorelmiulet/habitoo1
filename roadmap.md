
## Faza 2 – de finalizat
- [x] Erorile de typecheck rezolvate (typecheck curat).
- [x] Faza 2: proprietăți, media, contacte, cereri, potriviri, lead-uri, activități, calendar, dashboard-uri, rapoarte, obiective, search global, quick add.

## QA / Demo Data (în lucru)
- [ ] Migrare: `organizations.is_demo`, `demo_seeded_at`, `demo_seed_version` + funcție DB `qa_reset_demo_organization` (SECURITY DEFINER, doar service_role, verifică is_demo).
- [ ] Server functions superadmin-only (`src/lib/qa.functions.ts` + `src/lib/qa-seed.server.ts`): status, seed, reset, purge, regenerare parole demo; audit pentru fiecare acțiune.
- [ ] Seed realist: 4 utilizatori, 14 contacte, 14 proprietăți (+ foto), 7 cereri, 14 lead-uri (toate etapele + istoric), 24+ activități (8+ viitoare), obiective pe agent, notificări, favorite; scenariile A–D.
- [ ] Panou Superadmin → QA / Demo Data (status, contoare, ultimul seed, butoane cu confirmare).
- [ ] Indicator „DEMO / QA” în interfață când organizația curentă este demo.
- [ ] Bibliotecă de fotografii demo (generate, fără copyright) în bucket `property-media/demo-library`.
- [ ] Teste end-to-end cu Playwright pe datele QA (login, proprietate, media, vizionare, lead DnD, istoric, contact 360, matching, calendar, dashboard, rapoarte).
- [ ] Bug-fix-uri descoperite la testare.
- [ ] Validare finală: build/TS curat, consolă curată, RLS/roluri/audit intacte.
