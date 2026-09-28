# Retragere automată de pe portaluri la Vândut / Închiriat / Arhivat

## Raport — situația de acum

**Schimbarea statusului nu atinge portalurile.**
- Pagina proprietății: `changeStatus` în `src/routes/_authenticated/app.properties.$id.tsx` (~l. 310) face doar `update properties.status` din browser + `logAudit`.
- Lista de proprietăți (acțiune în masă): `updateStatus` în `src/routes/_authenticated/app.properties.index.tsx` (~l. 320) face `update ... .in("id", ids)` din browser. Nicio retragere.
- Rezultat: o proprietate „Vândută” rămâne publicată pe portalurile push (Imobiliare.ro, Storia, Romimo, PrimulAnunț, Imospot, LaCheie, OferteImobiliare) până la debifare manuală.

**Arhivarea blochează, nu retrage.** `archiveProperty` în `src/lib/property-archive.functions.ts` refuză arhivarea cât timp există listări live (`published/updated/pending`) — utilizatorul trebuie să debifeze întâi fiecare portal. Golește cache-ul Properstar și scrie `property_archived` în audit.

**Calea de debifare:** `performPortalWithdraw` în `src/lib/portals.functions.ts:1426` → `executeListingAction(action: "withdraw")` (jurnal în `portal_operation_logs`, update `portal_listings`). Folosită de `applyPortalSelectionForOrg` (l. ~2137, ~2626), care setează și `portal_publications.enabled=false` + `withdraw_reason`. 404 = deja retrasă; fără `external_id` = nimic de retras; portaluri fără push = „iese din feed”.

**Feeduri — statusuri:** `FEED_PUBLIC_STATUSES = ["active","reserved","negotiation"]` (`src/lib/site-feed/mapper.ts:132`), folosit de iMove, HomePitch (`isActiveOnly` → doar `active`), ClickImob/site-feed și Properstar. Vândut/Închiriat/Arhivat sunt deja excluse; Properstar le emite `Deleted` 7 zile, apoi le omite. Nu e nevoie de corectură la feeduri.

**Mecanism de fundal refolosibil:** coada `portal_slot_withdraw_jobs` / `portal_slot_withdraw_items` (`src/lib/portals/slot-withdraw.server.ts`) + cron `src/routes/api/public/cron/portal-slot-withdraw.ts`: claim/release cu lock, `next_attempt_at` pentru reîncercări, buget de timp, armare cron prin `portal_slot_withdraw_arm` + nonce, apel `executeListingAction`, eroare raportată per proprietate. Același model există la promovări (`promotion_withdraw_*`) și LaCheie resend. Este cel mai potrivit de copiat ca structură.

## Ce construiesc

1. **Server fn unică `changePropertyStatus({ propertyIds[], status })`** — înlocuiește update-ul din browser în ambele ecrane (inclusiv masă). Salvează statusul imediat, apoi, pentru `sold` / `rented`, pune în coadă retragerile. Arhivarea: `archiveProperty` nu mai blochează pe portaluri (colaborarea rămâne blocaj), ci pune în coadă cu motiv `archived`.
2. **Coadă nouă `portal_status_withdraw_jobs` + `_items`** (migrare, GRANT, RLS citire pe organizație), cron `/api/public/cron/portal-status-withdraw` armat la punerea în coadă, după modelul sloturilor. Fiecare item = (proprietate, portal), max 5 încercări cu backoff (1, 5, 15, 60 min). Un portal eșuat nu le blochează pe celelalte.
3. **Aceeași cale ca debifarea:** workerul apelează `applyPortalSelectionForOrg` cu `enabled:false` pentru portalul respectiv (deci `performPortalWithdraw` + `portal_publications.enabled=false`), cu `withdraw_reason` = `status_sold` / `status_rented` / `archived`.
4. **OferteImobiliare** (fără retragere în API): item marcat direct `manual_required`, fără apel; selecția devine inactivă cu motivul.
5. **Dialog de confirmare** la schimbarea statusului (pagină + masă): server fn `previewStatusWithdrawals` listează portalurile cu publicare activă, separat „trebuie retras manual din contul portalului”.
6. **Fila de portaluri:** per portal — „Retragere în curs / reușită / eșuată: <motiv>”; după revenire la Activ: „Retras automat la <data>, motiv: <status>” + butonul obișnuit de republicare. Fără republicare automată.
7. **Notificare** către agentul responsabil (sau adminul agenției, dacă nu are agent) după ultima încercare eșuată.
8. **Jurnal:** `audit_logs` (`portal_auto_withdraw_queued/succeeded/failed/manual_required`, cu motivul) și `portal_operation_logs` (prin `executeListingAction`, plus rând pentru `manual_required`).
9. **Teste** (adaptoare simulate, zero apeluri reale): Vândut → un withdraw per portal publicat pe calea debifării; OferteImobiliare → manual, fără apel; eroare → reîncercare, apoi notificare, celelalte continuă; revenire Activ → nicio publicare; feedurile nu conțin vândut/închiriat; masă pe 3 proprietăți → 3 seturi.
10. **Verificare fără apeluri reale:** pe o proprietate de test „Test api”, rulez planificarea + workerul cu adaptoare simulate (script local, nu cronul live), afișez lista retragerilor care ar fi fost trimise și SELECT pe `portal_publications` înainte/după. Nu se trimite nimic la portaluri; dacă modificarea selecției în DB pentru proprietatea de test nu e dorită, rulez doar în simulare (fără scriere) — presupun simulare fără scriere în DB-ul real.

## Detalii tehnice
- Fișiere noi: `src/lib/portals/status-withdraw.server.ts`, `src/lib/property-status.functions.ts`, ruta cron, teste în `src/lib/portals/tests/status-withdraw.test.ts`.
- Modificate: cele două rute de proprietăți, `property-archive.functions.ts`, `PropertyPortalsCard.tsx`, `ArchivePropertyDialog.tsx`.
- Migrare: tabele coadă + funcții `claim/release/arm` după modelul `portal_slot_withdraw_*`.
- Typecheck + toate testele (`--testTimeout=15000`).
