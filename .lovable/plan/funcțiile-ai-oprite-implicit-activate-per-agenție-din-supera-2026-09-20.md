# Funcțiile AI oprite implicit, activate per agenție din Superadmin

## Ce se schimbă pentru utilizatori

Toate funcțiile din grupul „Asistent AI” devin **oprite implicit** pentru fiecare agenție:

- Habitoo Manager
- AI CRM
- AI Marketing
- Habitoo AI (asistentul de chat)
- Studio AI (imagini și video)
- Analiza AI din ACP (comentariul AI de pe o analiză)

Efect în aplicație:

- Intrările corespunzătoare dispar din meniul lateral când agenția nu are funcția activată. Dacă nicio funcție nu e activă, întreg grupul „Asistent AI” dispare.
- Accesul direct pe adresă arată o pagină simplă: „Această funcție nu este activată pentru agenția ta. Contactează administratorul platformei.”
- Pe o analiză ACP, secțiunea „Analiză AI” nu mai apare deloc când funcția e oprită; cifrele calculate rămân neschimbate.

În Superadmin apare o pagină nouă, **Funcții AI**: lista agențiilor, fiecare cu un comutator pentru fiecare dintre cele șase funcții, plus acțiuni „Activează tot” / „Oprește tot” pe agenție. Fiecare schimbare e înregistrată în jurnalul de audit.

## Detalii tehnice

### Bază de date

Migrație nouă `organization_ai_features`:

- `organization_id uuid` (FK organizations, cascade), `feature_key text`, `enabled boolean not null default false`, `updated_by uuid`, `updated_at timestamptz default now()`; unique `(organization_id, feature_key)`.
- GRANT: `select` pentru `authenticated`, `all` pentru `service_role`.
- RLS: superadmin full (prin `has_role`), membrii agenției pot doar citi rândurile propriei organizații. Lipsa rândului = funcție oprită (default deny, fără seed).

### Server

- `src/lib/ai/features/keys.ts` — lista `AI_FEATURES` (cheie + etichetă RO + descriere scurtă), tip `AiFeatureKey`.
- `src/lib/ai/features/features.server.ts` — `isAiFeatureEnabled(orgId, key)` și `loadAiFeatures(orgId)` prin `supabaseAdmin`, fail-closed (eroare de citire → oprit).
- `src/lib/ai/features/features.functions.ts` — `listMyAiFeatures()` (harta pentru utilizatorul curent, folosită de meniu și de rute) și, pentru superadmin, `listOrganizationAiFeatures()` + `setOrganizationAiFeature({ organizationId, featureKey, enabled })` (verifică rolul superadmin, upsert, scrie audit `organization.ai_feature_changed`).
- Gard în fiecare punct de intrare AI, înaintea oricărei chemări de provider sau tool, cu mesaj RO unitar: `ai.functions.ts` (chat + workflow-uri), `agents/manager/manager.functions.ts`, `agents/crm/crm.functions.ts`, `agents/marketing/marketing.functions.ts`, `media/media.functions.ts`, `acp/ai.functions.ts` (`generateAcpAiAnalysis`, `listAcpAiInsights`, iar `getAcpAiStatus`/`getAiStatus` raportează „neactivat”).

### Interfață

- Hook `useAiFeatures()` peste `listMyAiFeatures` (react-query, `staleTime` 60s).
- `AppShell`/`AppSidebar`: grupul „Asistent AI” se filtrează după harta de funcții; grup gol → ascuns. Fără alte schimbări de navigație.
- Rutele `/app/ai`, `/app/ai-crm`, `/app/ai-marketing`, `/app/ai-manager`, `/app/ai-media`: componentă comună `AiFeatureGate` care afișează mesajul de indisponibilitate.
- `AcpAiInsight` nu se randează când funcția e oprită.
- Superadmin: rută nouă `/superadmin/ai-features` + intrare în `superadminNav` („Funcții AI”, icon `Bot`), construită din componentele și tokenii existenți.
- `AiSettingsCard` din Setări agenție arată starea funcțiilor („activată de administratorul platformei” / „neactivată”) fără posibilitate de modificare.

### Teste

- Fără rând în tabel → funcție oprită; eroare de citire → oprită (fail-closed).
- Fiecare punct de intrare AI refuză când funcția e oprită și trece când e activată.
- Meniul ascunde intrările oprite și tot grupul când nicio funcție nu e activă.
- `setOrganizationAiFeature` refuză un ne-superadmin și scrie audit când reușește.

Apoi suita completă, verificare de tipuri și build.
