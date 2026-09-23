# Raport: import proprietăți IMMOFLUX (doar investigație, nimic modificat)

## 1. Mecanisme de import existente
- Nu există niciun import de proprietăți (fișier, CSV, feed sau IMMOFLUX). Feed-urile existente (Properstar, site-feed, HomePitch) doar **exportă**.
- Modele reutilizabile de import din fișier, ambele în Superadmin > Nomenclator:
  - `importImobiliareLocationsFile` (`src/lib/imobiliare-locations.functions.ts`): fișierul e citit în browser și trimis ca text, max 24 MB, verificare `is_superadmin`, scriere cu clientul admin, rând în `audit_logs`.
  - importul SIRUTA (`src/lib/siruta.functions.ts` + `siruta-import.server.ts`), același tipar.
- Importuri de piață (`src/lib/market/ingest.ts`, Apify, collector) scriu în `market_listings`, nu în `properties` — logica de idempotență (căutare după sursă + ID, apoi actualizare) e un bun model, nu cod direct reutilizabil.
- Joburi durabile în pași (claim/lease + cron): `promotion_withdraw_jobs`, `portal_slot_withdraw_jobs`, `lacheie_resend_jobs` (RPC `claim_*`/`release_*`, `*_tick`, rută `/api/public/cron/*`).

## 2. Corespondența câmpurilor
| IMMOFLUX | Coloană `properties` | Tip |
|---|---|---|
| `id` | `external_id` (există, nefolosită: 0 rânduri) | text |
| `ref` | nu există coloană dedicată; `reference` e rezervat `HB-…` (index unic) | — |
| `transaction_id` | `transaction_kind` + `for_sale`/`for_rent` | enum sale/rent, bool |
| `subcategory_id` | `property_type` (+ opțional `category`) | text |
| `price`, `price_currency` | `price`/`currency` și `sale_price`/`sale_currency` sau `rent_price`/`rent_currency` | numeric, text |
| `title.ro` | `title` (obligatoriu) | text |
| `description.ro` | `description` | text |
| `rooms`, `bathrooms` | `rooms`, `bathrooms` | int |
| `floor` | `floor` (int) + `floor_label` (text, pt. „P”, „D”, „M”) | int, text |
| `building_levels` | `building_floors` | int |
| `surface_util_total` | `usable_surface` / `total_usable_surface` | numeric |
| `surface_total` / `surface_size` | `built_surface` / `surface` (teren: `land_surface`) | numeric |
| `built_year` | `build_year` | int |
| `partitioning` | `layout` | text |
| `latitude`, `longitude` | `lat`, `lng` (+ `location_precise`) | float8 |
| `address` | `address`, `street`, `street_number` | text |
| `city.name` | `city` (+ `county`, coduri SIRUTA) | text |
| `zone.name` | `district` | text |
| `eficienta_energetica` | **lipsește** | — |
| `exclusivity` | **lipsește** | — |
| `images[]` | `property_images` | — |

Alte coloane cerute:
- Stadiul construcției: `construction_stage` (text) — există.
- Balcoane: `balconies` (int), `balcony` (bool), `balcony_surface` — există.
- Parcare: `parking` (text), `parking_spaces`, `garages` (int) — există.
- Adresă: `street`, `street_number` există; **bloc, scară, apartament lipsesc**.
- Clasa energetică și exclusivitatea **lipsesc**.

## 3. ID-ul din sursă
- `external_id` (text) există, dar **fără index unic** și nefolosit. `source` (text) există, tot nefolosit.
- Recomandat: index unic parțial pe `(organization_id, source, external_id)` unde `external_id` nu e gol, cu `source = 'immoflux'`; reimportul caută după această pereche și actualizează. `ref` IMMOFLUX se poate păstra într-o coloană nouă (ex. `source_reference`) sau în `internal_notes`.
- Pentru poze, reimportul are nevoie de o cheie per imagine: recomandat coloană nouă `source_url` (sau hash) în `property_images`, ca aceeași imagine să nu fie descărcată din nou.

## 4. Crearea proprietății și a pozelor azi
- Proprietate: se creează **în browser** (`app.properties.new.tsx`), nu printr-o funcție server: `rpc("next_property_reference")` → insert în `properties` cu `organization_id`, `assigned_to`, `created_by`, `reference`, `title`, `status`, tranzacție, locație, detalii; apoi `resolvePropertyPostalCode` pe server. Obligatorii în DB: `organization_id`, `title`; restul au valori implicite (`property_type='apartment'`, `transaction_kind='sale'`, `status='draft'`, `currency='EUR'`). Tiparul server există deja în `property-duplicate.functions.ts` (referință nouă + copiere poze).
- Poze: `PropertyMediaManager.tsx` comprimă în browser, urcă în bucketul `property-media` la `mediaPath(org, property, nume)`, apoi insert în `property_images` cu `url = storage_path = path`, `position` incremental, `is_primary` pentru prima, `width`/`height`. `include_in_publish`, `is_confidential` au valori implicite.
- Descărcare de la URL extern în storage: **nu există** cod care face asta pentru proprietăți. Există doar fetch-uri externe politicoase (collector, geocodare) — tiparul de timeout/limită de dimensiune e reutilizabil.

## 5. Superadmin „Agenții”
- `superadmin.agencies.tsx`: fiecare agenție are un rând cu abonament, status, „Aprobă”, iar în dreapta grupul distructiv „Arhivează/Șterge”. Locul natural: un buton „Importă proprietăți” înaintea separatorului distructiv, care deschide un dialog (fișier + agent + mod).
- Utilizatorii agenției: `profiles` cu `organization_id = agenția` (pagina deja încarcă `profiles.id, organization_id`); pentru nume se adaugă `full_name`/email. Rolul din `user_roles` (`agency_admin`/`agent`). Recomandat: un agent implicit ales în dialog pentru `assigned_to`.

## 6. Limite de rulare
- Mediul de rulare: aproximativ 30 s de calcul efectiv și 128 MB memorie pe cerere; conexiunea poate rămâne deschisă mai mult, dar investigația HB-1009 a arătat cereri moarte după ~90 s la prelucrarea a 15 poze.
- Corpul cererii: limita platformei e ~100 MB, dar codul existent se limitează singur la 24 MB (JSON text). Un export cu câteva sute de proprietăți fără imagini încape confortabil.
- Watermark-ul este JS pur și costisitor; la import **nu trebuie aplicat** (se aplică la publicare, `ensureWatermarkedPath`).
- Sute de poze × 25 per proprietate într-o singură cerere = sigur depășit.

## Rezumat și recomandare
**Se reutilizează:** tiparul de import din fișier al Nomenclatorului (text, 24 MB, superadmin, audit); `next_property_reference()`; `mediaPath` + bucketul `property-media` + rândul `property_images`; tiparul de job durabil claim/tick din `promotion_withdraw_jobs`; logica de idempotență din `market/ingest.ts`.

**Lipsesc:** clasa energetică, exclusivitate, bloc/scară/apartament, referința sursă (`ref`), indexul unic pe `(organization_id, source, external_id)`, cheia sursă pentru imagini (`property_images.source_url`), plus tabele de job pentru import (ex. `property_import_jobs` + `property_import_items`).

**Abordare recomandată pentru poze:**
1. Cererea de import (rapidă) validează fișierul, creează/actualizează doar proprietățile (fără poze) și înregistrează fiecare poză ca element în coadă (`pending`, URL, `ordering`).
2. Un worker cron procesează coada în loturi mici (ex. 10–20 poze/rulare, sub ~20 s): descarcă cu timeout și limită de dimensiune (doar `image/*`, ex. max 10 MB, host HTTPS), urcă în storage fără watermark, inserează în `property_images` cu `position = ordering`, marchează `done`/`failed` cu reîncercări limitate.
3. Superadmin vede progresul (proprietăți create/actualizate, poze descărcate/eșuate) și poate relua eșecurile. Proprietățile importate rămân `draft` până la verificare, ca nimic să nu ajungă automat pe portaluri.

Spune-mi dacă vrei un plan de implementare pe această bază.
