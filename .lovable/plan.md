# Raport: ultima publicare PrimulAnunț.ro pentru HB-1009 (doar constatări)

Sursa: `portal_operation_logs`, `portal_listings`, `portal_connections` pentru agenția de test `04041622…`. Nicio modificare.

## 1. Cerere reală, nu simulare

- Conexiunea agenției la PrimulAnunț.ro: `status: connected`, `activated: true`, direcție `habitoo_to_portal`, `settings.allow_live: true`. Ultima sincronizare reușită: 23.09, 05:24 UTC.
- Dovadă directă că cererea a plecat live: jurnalul conține răspunsul real al portalului, HTTP 422 cu corp JSON de validare (imposibil de produs local).

## 2. Rezultatul publicării (23.09, 06:37:14 UTC, operație `publish`)

- **Cod HTTP:** 422.
- **Status întors de portal:** niciunul — portalul a respins cererea la validare, fără să creeze anunțul. Nu există `published`/`pending`/`rejected`, nici ID de anunț, nici URL public.
- **`portal_listings`:** înregistrarea HB-1009 stă `status: error`, `external_id` gol, `public_url` gol, eroare salvată: „PrimulAnunț.ro a respins datele: Date invalide."
- **Erorile de câmp raportate de portal** (`details.fieldErrors`):
  - `floor`: „Expected string, received number"
  - `property_type`: „Invalid enum value. Expected 'apartament' | 'casa' | 'teren' | 'spatiu_comercial' | 'birou' | 'garaj' | 'hala', received 'apartment'"

## 3. Pozele

- Nu există nicio operație media în jurnal pentru această proprietate: **0 trimise, 0 excluse, 0 eșuate**. Încărcarea pozelor nu a fost niciodată atinsă, deoarece crearea anunțului a eșuat la 422 — pozele se încarcă doar după ce anunțul există și are ID.

## 4. Payload-ul trimis

`portal_operation_logs` nu salvează corpul cererii (tabela păstrează doar răspunsul portalului), deci payload-ul exact nu există în jurnal. Confirmarea indirectă e fermă:
- Eroarea portalului „received 'apartment'" confirmă că s-a trimis `property_type: "apartment"` (codul intern englez).
- Eroarea „Expected string, received number" pe `floor` confirmă că s-a trimis `floor` ca număr (`1`).
- Datele din baza de date la acel moment (raportate la 23.09): `purpose: "sale"`, `price: 55000`, `currency: "EUR"`, `county: "Ilfov"`, `city: "Chiajna"`, `area: "militari"`, `rooms: 2`, `bathrooms: 1`, `surface_m2: 50`, `floor: 1`, `floors_total: 5`, `is_private: false`, fără cod poștal.

## Concluzie

Cererea a fost reală (live), portalul a respins-o la validare cu 422 pentru exact cele două câmpuri deja reparate în mapper (`property_type` în română, `floor` ca text). Anunțul nu există pe portal, iar pozele nu s-au încărcat deoarece fluxul se oprește la eșecul creării anunțului. O nouă publicare după publicarea aplicației ar trebui să treacă de validare.
