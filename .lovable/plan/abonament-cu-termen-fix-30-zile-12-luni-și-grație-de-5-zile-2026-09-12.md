# Abonament cu termen fix (30 zile / 12 luni) și grație de 5 zile

## Ce va vedea utilizatorul

**În Superadmin → Agenții**
- Pentru fiecare agenție, un selector de termen: „30 de zile", „12 luni" sau „Fără termen (nelimitat)", plus buton „Reînnoiește". Data de expirare se calculează automat din momentul salvării — nu se scrie manual.
- În listă, o coloană nouă: termenul curent, data de expirare și o pastilă vizuală: „Activă", „În grație — N zile" (portocaliu) sau „Expirată" (roșu).

**Pentru administratorul agenției**
- După trecerea termenului, o bandă roșie permanentă sus în aplicație: „Contul va fi suspendat în N zile", cu N scăzând 5 → 1. Agenții simpli nu o văd.
- Tot atunci primește o notificare în aplicație și un email brandat, o singură dată, la intrarea în grație.
- După cele 5 zile, contul devine „Suspendată" și se afișează ecranul de blocare cu mesajul: „Abonamentul agenției tale a expirat. Contactează administratorul platformei."
- Reînnoirea în perioada de grație scoate imediat banda și anulează suspendarea.

## Detalii tehnice

### Bază de date (migrare nouă `0014_subscription_terms.sql`)
- `organizations`: coloane noi `subscription_term text` (`30d` / `12m`, nullable = nelimitat), `subscription_started_at`, `subscription_expires_at`, `subscription_grace_notified_at`, `suspended_reason text`.
- `org_access_blocked()`: întoarce `expired` când `status = 'suspended'` și `suspended_reason = 'subscription_expired'`; restul rămâne neschimbat. `current_org()` blochează deja `suspended`, deci blocarea reală funcționează fără alte modificări.
- RPC `set_organization_subscription(_org uuid, _term text)` — superadmin-only, security definer: `subscription_started_at = now()`, `subscription_expires_at = now() + 30 days` sau `+ 1 year`, resetează `subscription_grace_notified_at`, iar dacă agenția era suspendată pentru expirare o readuce la `active`. `_term = null` → fără termen. Scrie audit `organization.subscription_set` / `organization.subscription_renewed`.
- RPC `subscription_enforce_daily()` — security definer, idempotentă: suspendă agențiile trecute de `expires_at + 5 zile` (`suspended_reason = 'subscription_expired'`, audit `organization.subscription_suspended`); pentru cele intrate în grație și nenotificate inserează notificări pentru `agency_admin`, marchează `subscription_grace_notified_at`, audit `organization.subscription_grace_started`. Întoarce JSON cu agențiile care necesită email.
- GRANT-uri explicite pe funcții (`authenticated`, `service_role`).

### Job zilnic
- `pg_cron` rulează zilnic la 03:00 UTC: transițiile de stare + notificările în aplicație prin `subscription_enforce_daily()`, apoi `net.http_post` către o rută nouă `src/routes/api/public/cron/subscriptions.ts`, autentificată cu `authenticateCronRequest` (`LOVABLE_CRON_SECRET`, infrastructura deja generată în proiect), care trimite emailurile brandate.
- Cadență: o singură rulare pe zi — suficient pentru numărătoarea zilnică, cost minim.

### Frontend
- `src/lib/subscription.ts`: etichete de termen și `subscriptionState(org)` → `none | active | grace(daysLeft) | expired`.
- `src/components/app/SubscriptionBanner.tsx`: banda roșie, randată în `AppShell` doar pentru `user.isAdmin && !user.isSuperadmin`, în stare de grație.
- `src/lib/org-access.ts` + `OrgBlocked.tsx` + `use-session.ts`: motiv nou `expired` cu textul cerut.
- `superadmin.agencies.tsx`: selector de termen + reînnoire prin RPC, coloană cu termen/expirare/pastilă.
- Șablon email nou `src/lib/email-templates/subscription-grace.tsx`, pe layoutul brandat existent.

### Verificare finală
Typecheck + suita de teste.
