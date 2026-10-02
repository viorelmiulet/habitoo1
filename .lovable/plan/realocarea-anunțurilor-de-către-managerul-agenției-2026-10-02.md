# Realocarea anunțurilor de către managerul agenției

## Pas 0 – ce există azi (verificat, nimic modificat)

**Acțiuni existente în interfață**
- Lista de anunțuri: bara de selecție are deja „Asignează agent” (selector). Apelează `reassignPropertyAgent` câte un anunț, pe rând. **Bara nu are restricție de rol, deci o vede orice utilizator care selectează anunțuri, inclusiv agenții.** La blocaj se afișează doar primul mesaj.
- Pagina anunțului: doar un card „Agent responsabil”, fără acțiune de schimbare.
- Pagina Echipă: nu are acțiunea „Mută toate anunțurile”.
- Server: `reassignPropertyAgent` verifică doar sesiunea și locurile libere (`ensureReassignSlots`), **nu și rolul**. Scrierea trece prin sesiunea utilizatorului.

**Baza de date**
- `properties_upd`: `organization_id = current_org() AND deleted_at IS NULL`, fără WITH CHECK pe coloane. **Prin urmare, un agent obișnuit poate schimba `assigned_to` la orice anunț al agenției**, fie din interfață, fie direct prin API.
- Pe tabel rulează și declanșatorii `portal_slots_guard_reassign` (dă eroarea „Agentul nu are locuri libere de publicare pe: …”), `guard_property_soft_delete`, `properties_sync_floor_surface` și `touch_updated_at`.

**Ce propun (fără a reduce celelalte drepturi)**
- Adăug un declanșator nou, `guard_property_reassign` (BEFORE UPDATE OF assigned_to). Când `assigned_to` se schimbă, permite operația doar dacă:
  - apelantul are rolul `agency_admin` în organizația anunțului, sau `is_superadmin()`; ori
  - cererea vine de la service_role, adică worker-ul de ștergere conturi, pe care nu îl modific; ori
  - utilizatorul își preia singur un anunț neasignat. Cazul păstrează fluxurile de creare, care pun `assigned_to = user`.
- Politica `properties_upd` rămâne neschimbată, deci agenții pot edita în continuare restul câmpurilor.
- Pentru `assigned_to` aleg un declanșator în locul unei politici WITH CHECK, pentru că o politică nu poate compara valoarea veche cu cea nouă.

## Ce construiesc

1. **Acțiunea server `reassignProperties({ propertyIds, toUserId })`** în `src/lib/property-agent.functions.ts`, cu maximum 100 de anunțuri pe apel:
   - Folosește `requireSupabaseAuth`. Rolul se verifică pe server prin `has_role` / `is_superadmin`, cu sesiunea apelantului. Alte roluri primesc „Doar managerul agenției poate realoca anunțuri.”
   - Organizația apelantului se determină pe server. Superadminul o deduce din anunțuri, iar toate anunțurile trebuie să fie din aceeași organizație. Un anunț lipsă, șters sau din altă agenție respinge întregul apel.
   - Destinatarul trebuie să existe în `profiles` cu aceeași organizație, să fie activ (cont neblocat și fără job de ștergere activ) și să aibă rol `agent` sau `agency_admin`.
   - Anunțurile care au deja acel agent sunt sărite.
   - Fiecare anunț se actualizează separat, prin sesiunea utilizatorului. Declanșatorul de locuri rămâne activ, nu este ocolit. Eroarea lui este tradusă cu `humanizeSlotGuardError` și pusă la `blocked` pentru anunțul respectiv, cu referința anunțului.
   - Răspunsul are forma `{ moved, skipped, blocked: [{ id, reference, message }], phoneWarning }`. `phoneWarning` se completează prin `resolveListingContact` când destinatarul nu are telefon. Mutarea nu este blocată.
   - Publicările pe portaluri nu se ating. Nu există un mecanism automat de resincronizare la schimbarea agentului: feed-urile citesc contactul la generare, iar portalurile API preiau agentul la următoarea actualizare. Nu declanșez nicio sincronizare.
   - Audit: `property.reassigned` cu actor, de la cine, la cine și lista de anunțuri (un rând pe lot). Refuzurile se înregistrează prin `portal.slot_refused`, care există deja.
   - Logica stă într-un helper testabil, `src/lib/property-reassign.server.ts`, care primește clientul ca parametru.
   - `reassignPropertyAgent` rămâne disponibilă, dar primește aceeași verificare de rol.
2. **Mutarea în masă**: acțiunea `listUserPropertyIds({ userId })` (doar manager) întoarce anunțurile nesterse ale utilizatorului. Interfața le trimite în loturi de 50 către `reassignProperties` și cumulează rezultatul.
3. **Interfață, vizibilă doar pentru `isAdmin` sau `isSuperadmin`:**
   - Pagina anunțului: butonul „Schimbă agentul” în cardul Agent responsabil, cu selector și confirmare.
   - Lista: „Asignează agent” devine „Realocă la…”, ascuns pentru agenți și urmat de confirmare.
   - Echipă: în meniul unui utilizator, „Mută toate anunțurile” deschide selectorul de destinatar și confirmarea.
   - O componentă comună, `ReassignPropertiesDialog`, cu un singur buton de confirmare. Rezultatul arată mutate, sărite și blocate, cu motivul fiecărui blocaj, plus avertismentul despre telefon.
4. **Teste** (vitest, client fals, `--testTimeout=15000`): rol nepermis, anunț din altă agenție, destinatar din altă agenție, destinatar inactiv, blocaj de locuri (eroarea declanșatorului devine mesaj în română), mutare reușită cu sărirea celor deja asignate și audit, mutare în masă pe mai multe loturi.

## Ce nu se atinge
Motorul de ștergere conturi, publicările, retragerile și sincronizările reale pe portaluri, Mailgun și secretele. Migrația adaugă doar declanșatorul `guard_property_reassign` și nu modifică date.
