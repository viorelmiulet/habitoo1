# Raport ClickImob: cum funcționează azi și ce se poate refolosi pentru un index

Doar am citit codul și datele. Nu am schimbat nimic, nu am trimis nicio notificare, iar cheile apar doar prin prefix sau ultimele 4 caractere.

## 1. Ce poate citi ClickImob cu o cheie Habitoo

- **Ambele grupuri de adrese acceptă aceeași cheie.** Toate rutele trec prin `withFeedAuth` din `src/lib/site-feed/auth.server.ts`. Dacă tokenul nu se găsește în `site_feed_tokens`, funcția îl caută în `portal_api_keys`. Agenția se ia doar din cheie.
  - `src/routes/api/public/sites/v1/`: `properties.ts`, `properties.$id.ts`, `agents.ts`, `contacts.ts`, `visits.ts`, `media.$id.ts`
  - `src/routes/api/public/portal/v1/`: `properties.ts`, `properties.$id.ts`, `agents.ts`
- **În practică ClickImob citește `/sites/v1`.** În `site_feed_access_logs` apar doar citirile `properties` și `agents` (plus un singur `properties.detail` pe 20.09), toate cu cheia `clicki_portal_ac7404b2`, de aproximativ 20 de ori pe zi, cu răspuns 200.
- **Selecția pe portal se aplică la lista de oferte și la detaliul unei oferte.** Pentru o cheie de portal, `handlePropertiesList` și `handlePropertyDetail` din `src/lib/site-feed/handlers.server.ts` (liniile 81–107 și 224–226) păstrează doar ofertele cu `portal_publications.portal_key = 'clickimob'` și `enabled = true`.
- **Răspunsul direct: nu.** Dacă retragi o proprietate doar de pe ClickImob, dar ea rămâne pe site, nu mai apare în feedul citit de ClickImob. Lista o omite, iar detaliul răspunde 404.
- **Excepția: pozele.** `media.$id.ts` nu cere cheie și nu verifică selecția ClickImob. Verifică doar starea de publicare a proprietății, așa că un link de poză deja cunoscut rămâne accesibil.

## 2. Notificările: se trimit de fapt sau doar în test?

- **Decizia se ia per conexiune.** În `buildContext` din `src/lib/portals.functions.ts` (linia 398) avem `allowLiveRequests = settings.allow_live === true`, citit din `portal_connections.settings`. Regula există de la primul commit care o conține, pe 06.09. Adaptorul (`src/lib/portals/adapters/clickimob.server.ts`, liniile 149–161) face cererea către ClickImob doar când opțiunea e pornită.
- **Pentru „Test api” opțiunea e pornită** (`allow_live = true`). Cu codul actual, retragerile de azi de la 12:34–12:35 au trecut prin `withdrawListing`, deci prin calea cu cerere reală către ClickImob, nu prin test.
- **De ce `http_status` e gol: lipsește din adaptor, nu din trimitere.** `logOperation` scrie `http_status` doar dacă adaptorul îl întoarce în `data.httpStatus` sau `httpStatus`. Adaptorul ClickImob nu îl întoarce niciodată: statusul ajunge doar în textul `detail`, care nu se salvează. De aceea toate cele 154 de rânduri ClickImob au `http_status` gol, inclusiv cele din 20.09. Jurnalul nostru nu poate arăta dacă notificarea a plecat efectiv.
- **Nu pot explica sigur de ce ClickImob spune că ultimul webhook a venit pe 20.09.** Posibile cauze, niciuna confirmată:
  - retragerile au fost făcute din previzualizare, iar ClickImob nu le-a înregistrat;
  - ClickImob a respins cererea, dar noi nu păstrăm răspunsul;
  - ClickImob înregistrează doar anumite tipuri de notificări.

  Ca să aflăm, ClickImob ar trebui să verifice în jurnalul lor intervalul 12:34–12:35 UTC de azi.
- **Problemă de securitate găsită.** La „Test api”, `settings.endpoint_url` conține adresa completă, cu `agency` și tokenul de webhook necriptat, în clar. Tokenul criptat e deja salvat separat, iar adaptorul oricum înlocuiește acești parametri în adresă. E bine să ștergem această copie în clar.

## 3. Ce se întâmplă dacă revoci cele două chei nefolosite

| Cheie | Creată | Ultima folosire | Cereri |
|---|---|---|---|
| `clicki_portal_d7e0029a` | 06.09 07:00 | niciodată | 0 |
| `clicki_portal_d174856f` | 06.09 12:01 | niciodată | 0 |
| `clicki_portal_ac7404b2` | 06.09 12:11 | azi 14:45 | 949 |

- **Nu se strică nimic.** Primele două nu au fost folosite niciodată.
- **Testul de conexiune rămâne verde cât timp există o cheie activă.** Testul din adaptor cere cel puțin o cheie activă, iar cheia folosită rămâne.
- Toate trei au doar permisiunile `feed:read` și `agents:read`, deci niciuna nu poate trimite lead-uri (vezi punctul 4).

## 4. Lead-urile și vizualizările de la ClickImob

- **Pe unde ar intra:**
  - lead-uri: `POST /api/public/sites/v1/contacts`, salvate în `contacts` și `leads`, cu `source = "website:<source>"`;
  - vizualizări: `POST /api/public/sites/v1/visits`, salvate prin funcția `site_feed_record_visit` în `site_feed_visits`.
- **Autentificare:** aceeași cheie prin `withFeedAuth`, plus permisiunea `leads:write`. Agenția se ia doar din cheie. Proprietatea trimisă trebuie să aparțină acelei agenții, altfel răspunsul e 404.
- **Starea reală:** cheile ClickImob nu au `leads:write`, deci ar primi 403. În jurnal nu există nicio cerere ClickImob către `contacts` sau `visits`. În baza de date nu există niciun lead cu sursă ClickImob și nicio vizualizare ClickImob. Deocamdată nu vine nimic înapoi de la ClickImob.
  - Cheile noi primesc implicit toate cele trei permisiuni, inclusiv `leads:write` (`PORTAL_KEY_SCOPES` în `src/lib/portals/keys.server.ts`). Cele trei chei existente însă nu au această permisiune.

## 5. Ce se poate refolosi din indexul Properstar

**Se poate refolosi direct** (din `src/lib/portals/properstar/index-feed.ts` și `index-feed.server.ts`):
- **Criteriul de activare:** `isProperstarActive`, adică portalul activat de Superadmin și agenția `active`/`trial`, nearhivată. Se poate generaliza pe `portal = 'clickimob'`.
- **Semnătura HMAC:** `signOfficeId`, `verifyOfficeSignature` și `verifyIndexKey`, cu o cheie separată (de exemplu `CLICKIMOB_INDEX_KEY`).
- **Grația de 7 zile:** `nextIndexState` și `indexPresence`, cu un tabel de stare separat sau cu o coloană `portal` în `properstar_index_state`.
- **Jurnalizarea și limita de cereri:** din `index-feed.server.ts`.

**Ce e diferit:**
- **Formatul:** ClickImob citește JSON paginat (`buildPaginatedFeed`, `/properties` și `/agents`), nu XML. Linkul semnat trebuie să ducă la aceleași rute `/sites/v1` cu selecția ClickImob, adică un nou tip de autentificare prin semnătură în `withFeedAuth`, în locul cheii din `portal_api_keys`.
- **„Deleted” în grație:** în JSON nu există `Status=Deleted`. Ar trebui fie o listă goală, fie un câmp de status. Trebuie stabilit cu ClickImob.
- **Direcția înapoi:** lead-urile și vizualizările cer o scriere autentificată spre Habitoo. O semnătură pusă în adresă e mai slabă pentru scriere. Ar fi nevoie fie de o semnătură a conținutului trimis, fie de o permisiune separată.
- **Notificările:** tokenul de webhook primit de la ClickImob rămâne per agenție, cât timp ClickImob nu acceptă un singur token pentru Habitoo. Indexul elimină doar cheia Habitoo, nu și datele `agency_id`/token.
- **Acord cu ClickImob:** ClickImob trebuie să accepte un index, adică o singură adresă cu toate agențiile. Azi ei citesc cu câte o cheie per agenție.

## 6. Conexiunile ClickImob de azi

| Agenție | `external_account_id` | Status | Activat | allow_live | Token webhook |
|---|---|---|---|---|---|
| Test api | `…df1e` (UUID agenție ClickImob) | connected | da | da | salvat (criptat, plus copia în clar din `endpoint_url`) |
| MG Imobiliare | `…e.ro` (o adresă de email, nu UUID) | error | da | da | salvat |

- **MG Imobiliare:** ultimul test (20.09) a eșuat cu „Portalul nu are nicio cheie activă emisă de Habitoo”. Agenția nu are nicio cheie ClickImob, iar `external_account_id` e un email, nu UUID-ul agenției din ClickImob. Toate operațiile reale de publicare, actualizare și retragere din jurnal aparțin agenției „Test api”.
- Configurarea conexiunii e în `portal_connections`. Tabelul `portal_integrations` nu are coloana `portal`, deci ClickImob nu e configurat acolo.
