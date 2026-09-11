# Acces temporar al Superadminului în contul unui utilizator

Faza 1: fluxul principal — cerere → aprobare → sesiune activă → expirare/revocare.
Cazul „utilizator care nu se poate autentifica” (sesiune doar-citire fără aprobare) **nu** se implementează acum; îl construim după confirmarea ta.

## Ce vei putea face

**Superadmin (Utilizatori):**
- Buton „Solicită acces” pe fiecare rând (nu apare pe conturile de Superadmin).
- Motiv obligatoriu (min. 10 caractere), apare în cerere, în email și în audit.
- O singură cerere în așteptare / sesiune activă per Superadmin.
- Când sesiunea e aprobată, un buton „Intră în cont” pornește vizualizarea.

**Utilizatorul vizat:**
- Notificare în aplicație + email brandat: cine cere, motivul, durata (24h), ce poate face Superadminul, butoane Acceptă / Respinge.
- Ecran nou „Acces la contul meu” (Setări → filă dedicată): cereri primite, sesiune activă cu timp rămas și buton „Revocă acum”, istoric complet al acceselor.
- Poate revoca oricând, inclusiv după aprobare.

**În timpul sesiunii:**
- Banner lat, permanent, sus pe toate ecranele autentificate: „Ești conectat ca [Nume] ([email]) · Expiră în [hh:mm] · Ieși din cont”. Vizibil și pe mobil.
- Utilizatorul vede propriul banner informativ cu timp rămas și revocare.
- Toate acțiunile se scriu în audit marcate ca impersonare, cu identitatea reală a Superadminului.
- Blocate server-side chiar și în impersonare: schimbarea parolei, a emailului, a autentificării în doi pași, ștergerea contului și orice acțiune de tip Superadmin.

## Reguli de expirare
- Cerere fără răspuns: expiră după **48h** (așa cum ai propus).
- Sesiune aprobată: **24h de la aprobare**, fără prelungire tacită.
- Expirarea se calculează server-side la fiecare cerere; nu depinde de un job programat.

## Detalii tehnice

**Tabel nou `impersonation_requests`**: `superadmin_id`, `target_user_id`, `reason`, `status` (pending/approved/rejected/expired/revoked), `mode` (`full` acum, `read_only` pregătit pentru faza 2), `requested_at`, `responded_at`, `expires_at`, `revoked_at`, `revoked_by`, `last_used_at`. RLS: Superadminul vede cererile inițiate de el; utilizatorul vede cererile către el și poate doar accepta/respinge/revoca. GRANT-uri pentru `authenticated` + `service_role`.
Constrângeri: index unic parțial „o singură cerere pending sau sesiune approved activă per superadmin”; trigger care refuză ținta cu rol `superadmin` și auto-ținta.

**Sesiunea nu se falsifică din client:** Superadminul își păstrează propria sesiune de autentificare; nu se emit tokenuri pentru contul țintă. Identitatea „acting as” trăiește doar ca rând în baza de date. Fiecare server function citește starea prin funcția SQL `impersonation_active(_superadmin, _target)` (security definer), care validează rolul, statusul `approved` și `expires_at > now()`. Clientul trimite doar id-ul cererii; dacă rândul nu e valid, cererea e respinsă.

**Context partajat:** un helper server `resolveActingUser()` (middleware peste `requireSupabaseAuth`) întoarce `{ realUserId, actingUserId, impersonationId | null }`. Pe client, `useCurrentUser()` primește un parametru de impersonare și întoarce profilul/organizația țintei, ca aplicația să se vadă exact ca la utilizator. Datele citite trec prin politicile existente de Superadmin, deci nu se ating RLS-urile de agenție.

**Audit:** `logAudit` primește câmpuri noi în `new_values` (`impersonated_by`, `impersonation_id`) completate automat din context, plus intrări dedicate la request/approve/reject/revoke/expire și la start/stop sesiune.

**Blocare acțiuni sensibile:** o listă de acțiuni interzise verificată în `resolveActingUser()` (parolă, email, 2FA, ștergere cont, rute Superadmin) — refuz server-side, nu doar ascundere în UI.

**Email:** șablon nou `impersonation-request.tsx` peste `layout.tsx` existent, trimis prin infrastructura Mailgun deja pornită, best-effort (eșecul emailului nu blochează notificarea în aplicație).

**Fișiere noi:** migrare `drizzle/migrations/00xx_impersonation.sql`, `src/lib/impersonation.functions.ts`, `src/lib/impersonation.server.ts`, `src/components/app/ImpersonationBanner.tsx`, `src/components/app/ImpersonationRequestDialog.tsx`, `src/components/app/AccountAccessCard.tsx`, `src/lib/email-templates/impersonation-request.tsx`.
**Modificate:** `superadmin.users.tsx`, `AppShell.tsx`, `use-session.ts`, `app.settings.tsx`, `crm.ts` (audit).

**Verificare finală:** typecheck, suita de teste (plus teste noi pentru expirare, unicitate sesiune, refuz Superadmin-pe-Superadmin, blocarea acțiunilor sensibile) și build.

## Întrebare deschisă
Faza 2 (sesiune doar-citire fără aprobare pentru utilizatorul blocat, cu notificare după fapt) rămâne neimplementată până confirmi varianta.
