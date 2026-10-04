# Hartă: pagini despre agenți și agenții (doar analiză)

Nimic modificat. Planul de mai jos e doar propunerea de ordine pentru redesign.

## 1. Echipa agenției (CRM)

| Ruta | Fișier | Cine | Ce afișează |
|---|---|---|---|
| `/app/team` | `routes/_authenticated/app.team.tsx` | manager (agent: doar citire/limitat) | Listă membri: avatar, nume, email, telefon, rol, badge „Invitație trimisă”, Activ/Inactiv, data. Acțiuni: Invită agent (email, nume, mobil RO), Editează profil (`ProfileEditForm`), Dezactivează/Reactivează, Elimină (`ConfirmDialog`), Realocă proprietăți (`ReassignPropertiesDialog`). |
| — (panou în dashboard) | `PortfolioPanel`, `AgentPortfolioList`, `ManagerAgentPanel` | manager | Portofoliu pe agent (acordeon cu proprietăți, status, preț) în dashboardul managerului și în AI Manager. |

Date: `agency-team.functions.ts` (`inviteAgent`, `setAgentActive`, overview), `property-agent.functions.ts`, `profiles`, `user_roles`.
Lipsește: **pagină de detaliu agent** (`/app/team/$id`) — azi totul e în dialoguri.

## 2. Agenția (CRM)

| Ruta | Fișier | Cine | Ce afișează |
|---|---|---|---|
| `/app/settings` | `routes/_authenticated/app.settings.tsx` (538 linii) | agent: Profil, Acces; manager: toate | File: Profil (`ProfileEditForm`), Acces (`AccountAccessCard`), Agenție (`AgencyCompanyDataFields`, plan + limită agenți), Branding (`AgencyBrandingCard`), Echipă (listă duplicată cu `/app/team`, doar citire), Portaluri (`AgencyPortalCatalogCard`, `PortalSlotsCard`, `FacebookCatalogCard`, `CollaborationAutoSwitch`), Promovare (`ImobiliarePromotionsAdminCard`), Integrări (`SiteFeedCard`, `ProperstarFeedCard`), AI (`AiSettingsCard`). |
| `/onboarding` | `routes/_authenticated/onboarding.tsx` | utilizator nou fără agenție | Creare agenție prin CUI/ANAF. |
| `/register` | `routes/register.tsx` | public | Cerere de înscriere agenție (CUI, contact). |
| ecrane blocante | `CompleteAgencyData`, `CompleteUserProfile`, `OrgBlocked` | manager / agent | Date firmă lipsă, profil incomplet, agenție suspendată/în așteptare. |

## 3. Public (agenție/agent)

Nu există nicio pagină HTML publică de agenție sau agent. Există doar feeduri API:
- `/api/public/sites/v1/agency`, `/agents`, `/media.agency.$id`, `/media.agent.$id` (site-ul propriu al agenției, cu token)
- `/api/public/portal/v1/agency`, `/agents` (portaluri)
- `/api/public/homepitch/v1/agents.me`, feeduri Properstar/ClickImob
- `/oferta/$id` — fișă publică a unei proprietăți (arată agentul)

## 4. SuperAdmin

| Ruta | Fișier | Ce afișează |
|---|---|---|
| `/superadmin/agencies` | `superadmin.agencies.tsx` (709) | Cereri de înregistrare (rânduri expandabile `RegistrationRequestDetails`, aprobare/respingere cu motiv) + listă agenții (căutare nume/oraș, plan `SubscriptionPicker`, stare, comutatoare), detaliu în dialog `AgencyDetailsDialog`, import proprietăți, ștergere agenție. |
| `/superadmin/stare-agentii` | `superadmin.stare-agentii.tsx` | Abonamente: plan, locuri ocupate/limită, expirare, trial, schimbare plan. |
| `/superadmin/users` | `superadmin.users.tsx` (623) | Utilizatori: căutare, filtre Agenție/Rol/Status; avatar (`UserAvatarEditor`), rol, agenție; acces temporar (`ImpersonationRequestDialog`), mutare proprietăți între utilizatori, ștergere (`UserDeletionDialog`). |

Lipsă: pagini de detaliu cu rută proprie (`/superadmin/agencies/$id`, `/superadmin/users/$id`) — azi dialoguri.

## 5. Invitații, roluri, statusuri

- Roluri: `superadmin`, `agency_admin` (Manager), `agent` — tabel `user_roles`, etichete în `lib/labels.ts`.
- Invitație: doar managerul, din `/app/team`, email cu link de setare parolă; badge „Invitație trimisă” până la prima logare. Nu există listă separată de invitații sau „Retrimite”.
- Status agent: Activ/Inactiv (`profiles.is_active`). Status agenție: active, trial, suspended, cancelled, pending_approval.

## Ordine de lucru propusă

1. **Echipa în CRM** — redesign `/app/team` + pagină nouă de detaliu agent (profil, portofoliu, activitate), eliminarea listei duplicate din Setări.
2. **Setările agenției** — reorganizare `/app/settings` (profil firmă, branding, portaluri, integrări) în secțiuni mai clare.
3. **SuperAdmin** — unificare agenții + stare abonamente, pagini de detaliu cu rută pentru agenție și utilizator.
4. **Pagini publice noi** (opțional, după decizia ta).

## Pagini publice care ar merita create

- `/agentii/$slug` — profil public agenție (logo, descriere, contact, anunțuri active).
- `/agenti/$slug` — profil public agent (poză, telefon, anunțurile lui).
- `/agentii` — director al agențiilor Habitoo (bun pentru SEO).
