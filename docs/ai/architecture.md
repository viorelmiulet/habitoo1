# Habitoo AI — arhitectură (Stage 11A: fundație)

Acest document descrie implementarea REALĂ a fundației AI din `src/lib/ai/`.
Nu descrie funcționalități planificate; ce nu apare aici nu există în cod.

## 1. Decizii arhitecturale

| Decizie | Stare |
| --- | --- |
| Runtime de agent / tool-uri | Mastra (`@mastra/core`), rulat server-side în procesul aplicației |
| Provider AI inițial | Google Gemini (`GEMINI_API_KEY`, model implicit `gemini-2.5-flash`) |
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
  tests/        provider, security, cost-control
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
`ai_usage_events`, cu GRANT-uri și politici RLS. Nicio tabelă existentă nu a
fost modificată.

## 8. Setări și interfață

- Setări → **AI**: stare (Configurat / Neconfigurat), furnizor, model, conexiune,
  limite, consum pe 30 de zile, lista instrumentelor de citire. Fără billing.
- `/app/ai`: conversație minimă, cu stări pentru încărcare, răspuns, eroare
  sigură și „AI nu este configurat.".

## 9. Limitări cunoscute (Stage 11A)

- `GEMINI_API_KEY` nu este configurat în acest mediu: interfața afișează „AI nu
  este configurat." și nu se face nicio cerere către provider.
- Fără acțiuni: email, WhatsApp, publicare pe portaluri, ștergere, modificare
  preț, contracte, agenți autonomi, multi-agent, memorie AI permanentă.
- Fără streaming; răspunsul se afișează la final.
- Categoriile de context `activity` și `document` sunt definite, dar nu au încă
  tool-uri care să le alimenteze.
