# Portal nou: Imobiliare.ro (API v3)

## Două lucruri de clarificat înainte / în paralel

1. **`locations.sql` nu a ajuns la mine.** În atașamentele conversației există doar
   imagini și un `feed-example.csv`; fișierul cu cele 33.816 locații nu e prezent.
   Fără el nu pot popula nomenclatorul de zone, deci nu pot alege `location_id`
   cu `depth=3`. Plan: construiesc tot mecanismul (tabel + import + mapare +
   eligibilitate) și un ecran de import în Superadmin. Până urci fișierul,
   publicarea pe Imobiliare.ro va fi blocată onest cu mesajul „nomenclatorul de
   locații Imobiliare.ro nu este încărcat”. Nu interoghez API-ul lor pentru
   locații și nu inventez zone.
2. **`category_api`**: nu am nicio sursă a valorilor. Nu ghicesc. Adaptorul va
   încerca, la conectare, un endpoint de categorii (`GET /api/v3/categories`, cu
   variante `.../listings/categories`) și va salva răspunsul BRUT în jurnal.
   Dacă niciunul nu răspunde, publicarea se blochează cu mesaj explicit și îmi
   spui tu valorile (sau îmi dai pagina din ghid). Rezultatul îl raportez.

## Decizie cerută explicit: retragere vs. ștergere

- Debifare portal / retragere din CRM → `POST /listings/{ref}/promotions` cu
  `{"status":"draft"}` (reversibil, păstrează anunțul și istoricul).
- Ștergere definitivă a proprietății în Habitoo → `DELETE /listings/{ref}`.

## Publicarea = o singură acțiune pentru utilizator

Butonul „Publică” rulează atomic: creare draft → medias (imagini base64) →
`promotions online`. Dacă pasul `promotions` eșuează, operațiunea NU se
raportează ca succes: anunțul rămâne marcat „draft la portal” cu eroarea reală,
iar reîncercarea reia doar pasul lipsă (fără a duplica anunțul).

## Ce construiesc

**Nomenclator locații** (migrare + import)
- Tabel `imobiliare_locations` (id portal, parent_id, depth, name, name_normalizat,
  county/city denormalizate, `synced_at`), RLS: citire `authenticated`, scriere
  doar `service_role`; GRANT-uri în aceeași migrare.
- Import din fișier (SQL dump sau CSV) prin server function de Superadmin, cu
  upsert idempotent și raport (rânduri citite / inserate / respinse).
- Mapare `judeţ + oraș + cartier` → `location_id` depth 3, cu normalizare RO
  (reutilizează `src/lib/ro-normalize.ts`): potrivire exactă pe cartier, altfel
  cea mai apropiată zonă din oraș → marcată `approximate` în diagnostic.

**Modul `src/lib/portals/imobiliare/`** (după modelul `lacheie/`)
- `config.ts` — host fix `https://www.imobiliare.ro`, căi v1/v3, limite (titlu 80,
  descriere 80, loturi de imagini), fără mod test.
- `auth.server.ts` — OAuth user+parolă → access/refresh token, ambele criptate cu
  `encryptPortalCredential`; parola NU se păstrează după conectare; reînnoire
  automată la sub 3 zile din expirare (verificare zilnică în cronul existent) și
  la primul 401; `POST /api/v3/logout` la deconectare.
- `mapper.ts` + `taxonomy.ts` — `data_properties` complet (structură, comfort,
  compartimentare, perioadă/stadiu construcție, destinație, colaborare,
  comisioane) și grupurile `amenities_*` construite doar din dotările/utilitățile/
  finisajele existente în Habitoo, cu allowlist strictă; ce nu are corespondent
  clar nu se trimite și apare ca avertisment. Energie: doar date reale.
- `media.server.ts` — citește imaginile din storage, aplică watermark-ul agenției
  când e activ, codifică base64 și trimite în loturi (plafon de payload), cu
  `plans` separat de `images`.
- `agents.server.ts` — `GET /agents`, `POST /agents` la prima publicare a unui
  agent, corespondența salvată per agent (tabel de mapare agent Habitoo → id
  portal) și refolosită apoi.
- `client.server.ts` — HTTP cu timeout/retry, extragerea câmpurilor respinse din
  răspuns, jurnalizare integrală prin `portalResponseLog` (ca după incidentul
  La Cheie).

**Adaptor** `src/lib/portals/adapters/imobiliare.server.ts` — `testConnection`,
`publishListing` (3 pași atomici), `updateListing` (PUT complet + medias),
`withdrawListing` (promotions draft), `sync`, `fetchAgents`, `diagnoseListing`;
înregistrat în `adapters/index.server.ts`.

**Registry & UI** — `imobiliare_ro` devine `available`, autentificare
`username_password`, capabilități reale, câmpuri de configurare (utilizator +
parolă), `notes` cu limitările reale (fără promovări plătite, fără documente,
fără open house); logo real în `src/assets/portals/` (păstrez fișierul existent
`imobiliare_ro.png` dacă e cel actual). Fila Publicare afișează eligibilitatea:
titlu ≤80, descriere ≥80, locație depth 3 (exactă/aproximativă), coordonate,
preț, minimum o imagine, agent sincronizat.

**Ce NU implementez** (conform cererii): promovări plătite, documente/linkuri
media, open house, import de anunțuri de la ei.

## Teste
Unitare pentru mapare taxonomie, limite titlu/descriere, mapare locație
(exact/aproximativ/lipsă), loturi de imagini, reînnoire token, sincronizare
agenți, atomicitatea celor doi pași (eșec la `promotions` ⇒ nu e succes),
izolare între agenții, jurnalizare completă a răspunsului. La final: suita
completă + verificarea de tipuri + build.
