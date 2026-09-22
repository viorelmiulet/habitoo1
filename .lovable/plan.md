# Bandă de trial în aplicație + paritate marcaj trial în Superadmin

## A. Ce am găsit pentru banda din aplicația agenției

1. **Layout principal**: `src/routes/_authenticated/app.tsx` → `src/components/app/AppShell.tsx`. În AppShell există deja o zonă de benzi globale, imediat sub bara de sus: `ImpersonationBanner`, `SubscriptionBanner`, `ActiveAccessBanner`, plus banda „DEMO / QA". Aici se inserează banda nouă, deci apare pe toate paginile agenției.

2. **Date despre agenția curentă pe client**: `useCurrentUser()` din `src/hooks/use-session.ts` returnează `organization` = rândul complet din `organizations`, deci `subscription_term`, `subscription_expires_at` și `is_trial` sunt deja disponibile. Nu e nevoie de query nou.

3. **Pagină de planuri/upgrade**: există doar pagina publică de prețuri `src/routes/preturi.tsx` (planuri Basic/Pro/Unlimited, preț, FAQ). În aplicație **nu există** pagină de upgrade/facturare: în Setări (`app.settings.tsx`) planul e doar afișat, cu textul „Planul nu poate fi schimbat din aplicație... scrie-ne la...". Deci destinația butonului „Activează acum" trebuie decisă (vezi Întrebare).

4. **Tipar existent de bandă**: `src/components/app/SubscriptionBanner.tsx` — banda roșie din perioada de grație: `role="alert"`, o linie centrată, bordură jos, iconiță `lucide-react`, text scurt bold + detaliu cu opacitate redusă, afișată doar pentru administratorul agenției. Banda de trial va folosi exact acest tipar, în tonul informativ/warning (ca banda DEMO), nu roșu.

## B. Marcaj trial în Superadmin

5. **Pagina Agenții** (`superadmin.agencies.tsx`): pe fiecare rând, badge `Perioadă de probă` (ton warning) când `is_trial`, plus `subscriptionSummary(o).label` în rândul de detalii („Trial până la …") și badge-uri separate pentru grație/expirat. Confirmat: implementat corect, sursa e rândul `organizations`.

6. **Pagina Stare agenții** (`superadmin.stare-agentii.tsx`): folosește deja `SubscriptionCell`, care cheamă `subscriptionSummary(...)` și afișează badge cu ton (info pentru trial) cu textul „Trial până la …" plus linia „N zile rămase". Deci **nu lipsește** marcajul; singura diferență față de Agenții e că nu apare un badge separat cu eticheta „Perioadă de probă". Paritatea e practic acoperită; opțional se adaugă prefixul „Trial · N zile rămase" pe o singură linie.

7. **Utilitar pentru zile rămase**: `src/lib/subscription.ts` — `subscriptionState()` (calculează `daysLeft` prin rotunjire în sus, pe milisecunde UTC, minim 1) și `subscriptionSummary()` (textele afișate, cu ton). Se reutilizează pentru bandă și pentru orice ajustare în Stare agenții. `isTrialTerm()` decide dacă termenul e trial.

## Ce propun să construim

- **Componentă nouă** `src/components/app/TrialBanner.tsx`, montată în `AppShell` lângă celelalte benzi:
  - vizibilă doar dacă agenția e în trial (`is_trial` sau `isTrialTerm(subscription_term)`) și starea e `active` (nu în grație/expirat — acolo rămâne banda roșie existentă);
  - ascunsă pentru superadmin; se decide dacă o văd și agenții sau doar administratorul agenției (vezi Întrebare);
  - text: „Perioadă de testare · N zile rămase" + data de final, cu buton „Activează acum".
- **Teste** pentru componentă: trial activ → banda apare cu zilele corecte; agenție fără termen sau cu abonament plătit → nu apare; trial în grație → nu apare (banda roșie preia).
- **Stare agenții**: fără marcaj nou, doar, dacă vrei paritate vizuală, prefix „Trial · " în badge — modificare pur textuală în `SubscriptionCell`.

Fără migrări, fără schimbări în funcția din bază sau în paginile Superadmin existente (în afara eventualului prefix).

## Întrebare înainte de implementare

Butonul „Activează acum" unde trimite? Opțiuni: (a) pagina publică `/preturi`; (b) pagina de suport din aplicație (`/app/support`), cu tichet precompletat pentru activarea abonamentului; (c) `mailto:` către adresa de contact a platformei. Momentan planul nu se poate schimba din aplicație, deci nu există o pagină reală de upgrade.
