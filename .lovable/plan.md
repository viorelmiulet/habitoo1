# Raport: contactul agentului pe portaluri (doar citire, nimic modificat)

Fără modificări de cod sau de date și fără apeluri către portaluri. Telefoanele apar mascate.

## 1. Ce trimitem azi, pe fiecare portal

| Portal | Nume | Telefon | Email | Poză | Când agentul nu are telefon |
|---|---|---|---|---|---|
| Romimo/Publi24 | agentul responsabil (`romimo/mapper.ts:322`) | agent, altfel `org.phone`, altfel `org.material_phone` (`:328-331`) | agent, obligatoriu (`:326`) | nu | ia telefonul agenției |
| Storia/OLX | agentul (`storia/mapper.ts:192`) | agent, altfel `org.phone` (`:194`) | agent, altfel emailul agenției (`:199`) | nu | ia telefonul agenției; fără nume+email, se omite `contact` și Storia folosește contactul contului (`:200-205`, `:300-307`) |
| Imobiliare.ro | agentul, prin `agents:[id]` (`imobiliare/payload.server.ts:128-147`) | anunț: `phones`/`whatsapp_number` = agent, apoi agenția (`:157-158`); la crearea agentului LOR tot cu telefonul agenției ca rezervă (`agents.server.ts:75-79`) | agentul, obligatoriu (`agents.server.ts:91`) | nu | ia telefonul agenției, atât pe anunț, cât și pe agentul creat |
| La Cheie | agentul (`lacheie/mapper.ts:385`) | doar agentul, obligatoriu (`:397`) | agentul, opțional (`:462`) | nu | **blochează publicarea** (regula dorită există deja aici) |
| Homepitch | agentul `first_name/last_name` (`homepitch/mapper.ts:292`) | doar agentul, altfel `null` (`:334`) | agentul, obligatoriu (cheia de potrivire, `:262-264`) | nu | trimite telefonul gol; Homepitch afișează contactul contului |
| Imove (feed) | nu se trimite nume | doar `agentPhone` al agentului, altfel `null` (`imove/mapper.ts:196`) | `agentEmail` al agentului (`:197`) | nu | câmp gol, fără telefonul agenției |
| Imospot | agentul în `contact.agent` (`imospot/mapper.ts:314-318`) | `contact.phone` = agent, altfel agenția, obligatoriu (`:244-245`, `:307`) | agentul, opțional | nu | ia telefonul agenției |
| PrimulAnunț | `agent_name` (`primulanunt/mapper.ts:182`) | `agent_phone` = agent, apoi `org.phone`, apoi `material_phone` (`:184-187`) | `agent_email` | nu | ia telefonul agenției |
| OferteImobiliare | numele agentului (`oferteimobiliare/mapper.ts:305`) | telefonul contului (nu se trimite pe anunț) | nu | nu | se folosește contactul contului |
| Properstar (feed) | agentul (`properstar/feed.server.ts:252-264`) | `mobilePhone` = agent; `landPhone` = **mereu telefonul agenției** (`:262`, `:185`) | agentul | `avatar_url` | `mobilePhone` gol; Properstar afișează `landPhone`, adică telefonul firmei |
| ClickImob (index + `/sites/v1`) | `agent` pe ofertă: doar `full_name` (`site-feed/handlers.server.ts:165`) | prin `/agents`: `telefon` = telefonul agentului (`site-feed/mapper.ts:182`) | `email` | `poza` | `telefon` gol; ClickImob afișează contactul agenției din index (telefonul firmei) |
| Feedul site-ului | la fel ca la ClickImob (`/sites/v1`) | la fel | la fel | la fel | `telefon` gol; site-ul decide ce afișează |

Nimeni nu folosește utilizatorul care a apăsat „Publică”. Peste tot, contactul se ia din `properties.assigned_to`, cu sau fără telefonul agenției ca rezervă.

## 2. Contact pe fiecare anunț, permis de portal?

- **Romimo**: da, pe articol (nume, email, telefon de contact). Contul de pe Romimo e unul pe agenție, identificat prin email; agenții nu au conturi separate.
- **Storia/OLX**: da, `advert.contact { name, email, phone }`. Nu are id de agent; dacă lipsește, se folosește contactul contului.
- **Imobiliare.ro**: da. Agenții au conturi separate în LOR (`/agents`, id salvat în `imobiliare_agents`), legați prin `agents:[id]`, plus `phones` și `whatsapp_number` pe anunț.
- **La Cheie**: da, `agent { external_id, full_name, phone, email }`, cu agent separat pe id extern.
- **Homepitch**: da, `agent { email, first_name, last_name, phone }`. Agentul se potrivește după email cu un utilizator Homepitch.
- **Imove**: da, `agentPhone`/`agentEmail` pe fiecare ofertă din feed.
- **Imospot**: da, `contact.phone` și `contact.agent { name, email, phone }`.
- **PrimulAnunț**: da, `agent_name`, `agent_phone`, `agent_email`.
- **OferteImobiliare**: doar numele agentului pe anunț; telefonul rămâne al contului (după maparea actuală).
- **Properstar**: da, `agent { mobilePhone, landPhone, email, photo }` pe fiecare anunț.
- **ClickImob/site**: agentul e legat prin id (`agent_id`), iar datele lui vin din `/agents` (`nume`, `telefon`, `email`, `poza`).

## 3. HB-1088 (MRM IMOBILIARE, agent Bogdan M, are email, nu are telefon)

Selectat pe Storia, ClickImob și Properstar. Jurnalul (`portal_operation_logs`) nu păstrează corpul trimis, deci contactul de mai jos e reconstituit din regulile de mai sus.
- **Storia** (publicat pe 01.10.2026 la 12:48 UTC): `contact.name` = „Bogdan M”, emailul agentului, `phone` = telefonul agenției, 07xx xxx 858.
- **Properstar**: `mobilePhone` gol, `landPhone` = 07xx xxx 858 (agenția), deci se vede telefonul firmei.
- **ClickImob**: agentul „Bogdan M”, cu `telefon` gol în `/agents`; ClickImob arată telefonul agenției (07xx xxx 858).

## 4. Agenți fără telefon sau email în profil

| Agenție | Agent | Lipsește | Pe portaluri | Publicate pe site |
|---|---|---|---|---|
| MRM IMOBILIARE | Bogdan M | telefon | 1 | 1 |
| Test api | test conexiune 2 | telefon | 0 | 0 |

Toți agenții au email.

## 5. Concluzie: ce trebuie schimbat pentru regula „contactul = agentul responsabil, fără telefonul agenției; fără telefon, publicarea se blochează”

| Portal | Schimbare necesară |
|---|---|
| Romimo/Publi24 | scoatem rezerva pe `org.phone`/`material_phone`; mesaj „Agentul responsabil nu are telefon” |
| Storia/OLX | scoatem rezerva pe telefonul și emailul agenției; blocăm publicarea în loc să omitem `contact` |
| Imobiliare.ro | scoatem `fallbackPhone`/`fallbackWhatsapp` la anunț și la crearea agentului; blocăm dacă agentul n-are mobil |
| La Cheie | e deja conform; nu e nevoie de nimic |
| Homepitch | adăugăm blocare când telefonul agentului lipsește |
| Imove | excludem din feed ofertele cu agent fără telefon și le arătăm motivul |
| Imospot | scoatem rezerva pe agenție; blocăm |
| PrimulAnunț | scoatem rezerva; telefonul devine obligatoriu |
| OferteImobiliare | trimitem telefonul agentului pe anunț dacă API-ul îl acceptă (de verificat în documentație); altfel blocăm |
| Properstar | `landPhone` nu mai ia telefonul firmei (îl lăsăm gol sau egal cu `mobilePhone`); excludem din feed oferta fără telefonul agentului |
| ClickImob / site | ofertele cu agent fără telefon nu mai apar în feed, iar motivul se vede în CRM |

Pentru toate:
- o singură regulă comună de verificare înainte de publicare: agent asignat, cu telefon valid;
- același mesaj clar în fila Publicare și în modul Publicare;
- retragerea anunțurilor deja publicate rămâne o decizie separată.
