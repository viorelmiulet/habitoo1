# Habitoo AI — arhitectură (Stage 11: agent, workflow, tracing)

Acest document descrie implementarea REALĂ a fundației AI din `src/lib/ai/`.
Nu descrie funcționalități planificate; ce nu apare aici nu există în cod.

## 1. Decizii arhitecturale

| Decizie | Stare |
| --- | --- |
| Runtime de agent / tool-uri | Mastra (`@mastra/core`), rulat server-side în procesul aplicației |
| Provider AI inițial | Google Gemini (`GEMINI_API_KEY`, model implicit `gemini-3.6-flash`, override prin `GEMINI_MODEL`) |
| Buget răspuns | `maxOutputTokens = 2048`, `thinkingLevel = "low"` — modelele Gemini 3 consumă tokeni de raționament din același buget; `gemini-2.5-flash` a fost retras pentru cheile noi |
| Providere viitoare | OpenAI, Anthropic — se adaugă implementând `AIProvider`, fără a atinge tool-urile sau UI-ul |
| Lovable AI | NU este runtime pentru utilizatorii Habitoo; este doar mediul de dezvoltare |
| Cost | fără serviciu cloud plătit suplimentar; Mastra rulează self-hosted, în workerul aplicației |

Modulul ACP folosește în continuare propriul provider (`src/lib/acp/ai/`) și nu
este afectat de acest layer.

## 2. Straturi

```
src/lib/ai/
  gateway/      types.ts (contractul AIResponse), gateway.server.ts (fluxul complet)
  providers/    types.ts (interfața AIProvider), gemini.server.ts, gemini.parse.ts, registry.server.ts
  tools/        registry.ts (definiții), executors.server.ts (interogări), mastra.server.ts (runtime)
  context/      builder.ts (funcție pură, listă albă de câmpuri)
  prompts/      system.ts (SYSTEM + SECURITY RULES + TOOL DEFINITIONS / CRM CONTEXT + USER REQUEST)
  security/     permissions.ts, injection.ts, audit.ts
  usage/        limits.ts, tracking.server.ts
  agent/        coordinator.server.ts (Habitoo AI Coordinator)
  workflows/    diagnostic.ts (pași puri), runtime.server.ts (persistență, suspend/resume)
  reliability/  retry.ts (clasificare erori + reîncercare doar tranzitorie)
  tracing/      trace.ts (AiTracer), trace.server.ts (scriere evenimente)
  memory/       conversation.server.ts (memorie de conversație pe termen scurt)
  scraping/     types.ts (interfață pentru viitor; niciun provider activ)
  tests/        provider, security, cost-control, retry, workflow, tracing, coordinator
  ai.functions.ts  server functions apelate de interfață
  ai-client.ts     singurul import permis din UI
```

Interfața nu apelează niciodată providerul: `src/routes/_authenticated/app.ai.tsx`
și `src/components/app/ai/AiSettingsCard.tsx` folosesc exclusiv server functions.
Cheia providerului trăiește doar în variabilele de mediu ale serverului și nu
apare în răspunsuri, în UI, în audit sau în loguri.

## 3. Fluxul unei cereri (AI Gateway)

`sendAiMessage` (server function, middleware `requireActiveOrgAuth`) →
`runAiChat` din `gateway/gateway.server.ts`:

1. **Actor** — `resolveActor` citește agenția din `profiles` și rolul din
   `user_roles`. Clientul nu poate trimite organizația sau rolul.
2. **Provider** — lipsă cheie → răspuns `not_configured` cu mesajul
   „AI nu este configurat." și codul `AI_NOT_CONFIGURED`. Nicio eroare brută.
3. **Dimensiune cerere** — `validateAiRequestSize` (max 4000 caractere).
4. **Rate limiting** — RPC `rate_limit_hit`: 6/minut și 40/oră per utilizator,
   200/oră per agenție.
5. **Conversație** — `ai_conversations` legat de user + agenție; un ID străin nu
   este acceptat.
6. **Anti dublu-click** — mesaj identic în 15 secunde → se reafișează răspunsul
   anterior, fără cerere nouă către provider.
7. **Context** — `buildAiContext` (funcție pură) produce doar categoriile cerute
   (`property`, `client`, `lead`, `acp`, `activity`, `document`), cu câmpuri pe
   listă albă și texte sanitizate. Nu se trimite niciodată baza de date.
8. **Prompt** — sistem = SYSTEM + SECURITY RULES + TOOL DEFINITIONS; mesajul
   utilizatorului = blocul „### DATE CRM" + „# USER REQUEST".
9. **Buclă de tool calling** — maximum 4 pași și 6 tool-uri pe cerere. Înainte
   de fiecare execuție: `authorizeAiTool` (capabilitatea vine din registry, nu
   de la model), apoi validare Zod, apoi interogare filtrată pe agenție.
10. **Persistență** — mesajele în `ai_messages`, consumul în `ai_usage_events`,
    evenimentele în `audit_logs` (`ai.chat.request`, `ai.chat.failed`,
    `ai.tool.executed`, `ai.tool.denied`).
11. **Răspuns** — `AIResponse`: `status`, `answer`, `toolCalls`, `contextUsed`,
    `sources`, `suggestions`, `warnings`, `confidence`, `conversationId`,
    `provider`, `model`, `usage`, `message`.

## 4. Tool-uri (doar citire în Stage 11A)

`search_properties`, `get_property`, `search_clients`, `get_client`,
`search_leads`, `get_lead`, `get_acp`, `get_acp_history`.

Fiecare tool: server-side, filtrat pe `organization_id` al actorului, validat cu
Zod, autorizat prin capabilități (`read:properties`, `read:contacts`,
`read:leads`, `read:acp`) și auditat. Tool-urile distructive nu există în
registry (`AI_FORBIDDEN_TOOL_NAMES` le enumeră explicit ca interzise), deci
modelul nu le poate cere nici după nume.

Lanțul obligatoriu: autentificare → apartenență la agenție → permisiune de rol →
autorizare tool → validare parametri → interogare filtrată.

## 4b. Agent, workflow, state, retry, memorie, tracing

**Habitoo AI Coordinator** (`agent/coordinator.server.ts`): buclă model → tool
autorizat → model → răspuns structurat. Agentul primește un `AIProvider` gata
construit, deci nu depinde de Gemini. Tool-urile rulează pe runtime-ul Mastra
(`tools/mastra.server.ts`) cu actorul verificat capturat în closure — modelul nu
poate trimite altă agenție prin argumente.

**Workflow** `habitooDiagnosticWorkflow` (`workflows/diagnostic.ts`, pași puri):
`authenticate → resolve_organization → build_context → agent → approval →
read_tool → validate → respond`. Pasul `approval` suspendă fluxul: agentul
propune o acțiune (în Stage 11 exclusiv de citire, `readOnly: true`, parametri
serializați în `argumentsJson`), utilizatorul aprobă sau respinge, iar fluxul se
reia din același pas.

**State**: backendul rulează serverless, fără proces Node permanent, deci starea
este persistată în `ai_workflow_runs` (status, `current_step`, `state` jsonb,
`pending_approval`, rezultat, `trace_id`). Un flux suspendat rămâne valid după
repornire sau după reîncărcarea paginii; `runtime.server.ts` expune
`startDiagnosticWorkflow`, `resumeDiagnosticWorkflow`, `getDiagnosticWorkflow`,
`listDiagnosticWorkflows`.

**Retry** (`reliability/retry.ts`): `classifyAiError` separă erorile tranzitorii
(timeout provider, 429, 5xx, rețea, eșec temporar de bază de date) de cele
terminale (configurare, validare). Se reîncearcă doar apelul modelului și
citirile — niciodată o operație care poate crea duplicate.

**Memorie** (`memory/conversation.server.ts`): doar istoricul recent al
conversației (`AI_HISTORY_MESSAGES`), separat de starea workflow-ului. Nu există
memorie permanentă și conversațiile nu devin automat memorie.

**Tracing** (`tracing/trace.ts` + `ai_trace_events`): fiecare cerere are un
`trace_id`; se înregistrează agent, workflow, pas, tool, cerere de model, eroare
și latență, deci traseul utilizator → agent → tool → bază de date → răspuns este
reconstituibil. `scrubTraceDetails` elimină orice câmp care ar putea conține un
secret.

**Semnătura de raționament**: Gemini 3 cere ca `thoughtSignature` primită într-un
apel de tool să fie retrimisă la turul următor; `gemini.parse.ts` o păstrează,
`gemini.server.ts` o retrimite, iar coordinatorul o transportă. Fără ea
providerul refuză cererea cu 400.

**Scraping**: `scraping/types.ts` definește doar interfața viitoare. Nu există
provider (nici Bright Data); orice cerere întoarce `SCRAPING_NOT_CONFIGURED`.

## 5. Securitate

- **Multi-tenancy**: fiecare interogare adaugă `organization_id = actor.organizationId`
  pe lângă identificatorul cerut. Un ID cunoscut din altă agenție returnează
  „nu există în agenția ta", nu date.
- **Prompt injection**: `security/injection.ts` neutralizează markerii de tip
  „ignoră instrucțiunile", `system:`, `<system>` etc., încadrează datele în
  blocuri marcate ca DATE și sanitizează cererea utilizatorului. Regulile de
  sistem declară explicit că datele CRM nu au autoritate.
- **RLS**: `ai_conversations`, `ai_messages` (citire doar de proprietar, în
  agenția proprie) și `ai_usage_events` (proprietar sau administrator de
  agenție). Scrierea este exclusiv server-side, prin rolul de serviciu.
- **Erori**: `safeAiProviderMessage` produce mesaje în română, fără stack trace,
  status code brut sau detalii de bază de date.

## 6. Cost și limite

`usage/limits.ts`: 6/minut și 40/oră per utilizator, 200/oră per agenție, 4000
caractere pe mesaj, 10 mesaje de istoric, 4 pași de tool calling, 6 tool-uri pe
cerere, fereastră de 15 secunde pentru dublu-click.

`ai_usage_events` reține agenția, utilizatorul, providerul, modelul,
capabilitatea, tokenurile (dacă providerul le raportează — altfel `null`, nu
estimări), latența, succesul și numărul de tool-uri.

## 7. Baza de date

Migrarea `0040_ai_foundation.sql` (aditivă): `ai_conversations`, `ai_messages`,
`ai_usage_events`, cu GRANT-uri și politici RLS.

Migrarea `0041_ai_workflow_state_and_tracing.sql` (aditivă): `ai_workflow_runs`
(starea fluxurilor, necesară pentru suspend/resume pe un backend serverless) și
`ai_trace_events` (observabilitate). Ambele cu GRANT-uri, indexuri și RLS strict
pe agenție (citire: propriile rânduri sau administratorul agenției; scriere doar
server-side). Nicio tabelă existentă nu a fost modificată.

## 8. Setări și interfață

- Setări → **AI**: stare (Configurat / Neconfigurat), furnizor, model, conexiune,
  limite, consum pe 30 de zile, lista instrumentelor de citire. Fără billing.
- `/app/ai`: conversație minimă, cu stări pentru încărcare, răspuns, eroare
  sigură, „Încearcă din nou", indicator de context („Date folosite: …") și
  „AI nu este configurat.".
- `/app/ai`: cardul „Flux cu aprobare" pornește `habitooDiagnosticWorkflow`,
  afișează pasul curent, propunerea agentului și butoanele Aprob / Resping.

## 9. Limitări cunoscute (Stage 11)

- `GEMINI_API_KEY` este configurat și verificat cu o cerere reală; free tier.
- Workflow-ul demonstrativ propune doar citiri; nu există acțiuni care modifică date.
- Fără scraping: interfața de scraping există, dar niciun provider nu este activ.
- Fără acțiuni: email, WhatsApp, publicare pe portaluri, ștergere, modificare
  preț, contracte, agenți autonomi, multi-agent, memorie AI permanentă.
- Fără streaming; răspunsul se afișează la final.
- Categoriile de context `activity` și `document` sunt definite, dar nu au încă
  tool-uri care să le alimenteze.

## 10. CRM Agent (Stage 14)

`src/lib/ai/agents/crm/` adaugă un agent specializat pe CRM, peste aceeași
infrastructură: interfață → server function autentificată → AI Gateway → Mastra
→ agent → tool registry → executori server-side → Supabase.

- **Module pure**: `filters.ts` (întrebare în română → filtre deterministe),
  `insights.ts` (scor de prioritate 0–100 explicabil), `matching.ts` (reutilizează
  `@/lib/matching`), `actions.ts` (scheme Zod + propunere cu diff), `workflow.ts`
  (`habitooCrmWorkflow`), `instructions.ts` (prompt CRM anti-injection).
- **Server-side**: `tools.server.ts` (10 tool-uri de citire + 5 acțiuni),
  `agent.server.ts`, `runtime.server.ts` (stare persistentă în `ai_workflow_runs`,
  suspend/resume), `crm.functions.ts`, `crm-client.ts`.
- **Acțiuni**: `create_task`, `create_note`, `update_lead_status`, `assign_lead`,
  `create_property_match`. Fiecare rulează numai cu `approvalGranted: true`, după
  aprobarea explicită a utilizatorului. Nu există comunicare automată sau ștergeri.
- **Securitate**: fiecare interogare filtrează `organization_id`; agentul poate
  modifica doar lead-uri nealocate sau alocate lui; `assign_lead` este rezervat
  administratorilor; activitățile sunt deduplicate pe zi/entitate/titlu, deci
  aprobarea repetată nu creează duplicate; audit `ai.crm.*`, tracing și usage
  `crm_agent`.
- **Interfață**: `/app/ai-crm`, în română, cu sugestii, istoric al rulărilor și
  card de aprobare care arată valoarea actuală → valoarea nouă.
- **Limitări**: fără outreach, fără modificări ACP, fără streaming; ACP rămâne
  sursa deterministă de adevăr și nu este atins de agent.
