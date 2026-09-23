# PrimulAnunț.ro a respins HB-1009: raport și corecțiile necesare

## 1. Ce a răspuns portalul (jurnal, 23.09.2026, 06:37:14)

Operație `publish`, cod HTTP **422**, corp complet (nu conține nicio cheie API):

```json
{
  "error": "Date invalide.",
  "details": {
    "formErrors": [],
    "fieldErrors": {
      "floor": ["Expected string, received number"],
      "property_type": ["Invalid enum value. Expected 'apartament' | 'casa' | 'teren' | 'spatiu_comercial' | 'birou' | 'garaj' | 'hala', received 'apartment'"]
    }
  }
}
```

Datele trimise pentru HB-1009 (din baza de date, exact cum le construiește mapper-ul): `property_type: "apartment"`, `purpose: "sale"`, `price: 55000`, `currency: "EUR"`, `county: "Ilfov"`, `city: "Chiajna"`, `area: "militari"`, `rooms: 2`, `bathrooms: 1`, `surface_m2: 50`, `floor: 1` (număr), `floors_total: 5`, `features` gol, `is_private: false`. Codul poștal este gol, deci nu s-a trimis.

## 2. Câmpurile respinse

- **`property_type`** — portalul acceptă numai valori în română, fără diacritice: `apartament`, `casa`, `teren`, `spatiu_comercial`, `birou`, `garaj`, `hala`. Noi trimitem codul intern englez `apartment`.
- **`floor`** — portalul îl vrea **text**, nu număr. Noi trimitem `1` ca număr.

Restul câmpurilor au trecut: `purpose` („sale"), `currency` („EUR"), `county`, `city`, `area`, `rooms`, `bathrooms`, `surface_m2`, `features`, `is_private`. `floors_total: 5` nu a fost reclamat, deci acolo numărul e acceptat.

## 3. Comparație cu documentația oficială

Pagina oficială arată în exemplu `"property_type": "apartament"` — deci cerința de română era vizibilă, doar lista completă a valorilor nu e publicată (o știm acum din mesajul de eroare). Documentația nu precizează tipul lui `floor`; în realitate validatorul portalului îl cere ca text. Pentru `currency`, `purpose` și `features` nu există contradicție: `EUR`, `sale`/`rent` și lista liberă de dotări sunt acceptate.

## 4. De ce nu s-a extras lista câmpurilor

Parsarea 422 caută lista în `fields`, `errors` sau `error.fields`. Răspunsul real o pune în `details.fieldErrors` (obiect câmp → listă de mesaje), iar `error` este un **text**, nu un obiect, deci ramura `error.fields` se oprește imediat. Rezultat: listă goală și mesajul generic „Date invalide.".

## Corecțiile necesare

**În mapper (`src/lib/portals/primulanunt/mapper.ts`)**

1. Tabel de corespondență tip proprietate → valorile portalului:
   `apartment`/`studio` → `apartament`, `house` → `casa`, `land` → `teren`,
   `commercial` → `spatiu_comercial`, `office` → `birou`, `industrial` → `hala`;
   `garaj` rămâne disponibil dacă apare un cod echivalent.
   Un tip necunoscut devine motiv de respingere explicit, în română, înainte de orice apel la portal.
2. `floor` se trimite ca text (`"1"`), nu ca număr. `floors_total` rămâne număr.

**În parsarea erorilor (`src/lib/portals/primulanunt/client.server.ts`)**

3. `invalidFieldsFrom` citește și `details.fieldErrors` / `details.formErrors` (și `details.errors`), pe lângă formele existente.
4. Mesajul de eroare include, pe lângă numele câmpurilor, explicația portalului pentru fiecare câmp (ex. „property_type: valoare neacceptată"), ca utilizatorul să vadă imediat cauza.
5. Când `error` este text, el rămâne mesajul de bază, dar nu mai blochează extragerea listei.

**Teste**

6. Mapper: apartament/casă/teren etc. produc valorile românești; tip necunoscut → respingere; `floor` este text.
7. Client: răspunsul real (`details.fieldErrors`) produce lista `floor, property_type` și mesajul cu explicații.
