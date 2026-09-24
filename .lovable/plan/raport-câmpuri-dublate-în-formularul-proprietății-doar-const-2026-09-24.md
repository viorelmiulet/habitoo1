# Raport: câmpuri dublate în formularul proprietății (doar constatare)

Nimic de executat. Acest document este doar raportul cerut.

## 1. Componente, fișiere, coloane

Toate patru sunt în `src/components/app/PropertyDetailsFields.tsx` (folosit la adăugare și editare), listate și în `src/lib/property-detail-fields.ts`.

| Etichetă | Componentă | Coloană |
|---|---|---|
| Suprafață utilă (m²) | `NumberField` (l. 335) | `surface` |
| Utilă (m²) | `NumberField` (l. 336) | `usable_surface` |
| Etaj | `SelectField` (l. 312) | `floor_label` (text) |
| Etaj (număr) | `NumberField` (l. 313, min -5) | `floor` (int) |

Coloanele sunt diferite, nu aceeași coloană afișată de două ori.

## 2. Când a apărut dublura

- 06.09, commit `5beb0f10`: formularul avea doar „Etaj” (`floor_label`) și „Utilă” (`usable_surface`).
- 20.09, 04:59 UTC, commit `95a8e6f7` (mesaj generic „Changes”): s-au adăugat „Etaj (număr)” (`floor`) și „Suprafață utilă (m²)” (`surface`), împreună cu „Facilități”. Motivul probabil: `floor` și `surface` nu se puteau completa din formular, deși le citesc căutarea, pagina proprietății și mapperele (Romimo și PrimulAnunț.ro citesc etajul doar din `floor`). S-au adăugat câmpuri noi, fără să fie legate de cele existente. Motivul exact nu apare în commit.

## 3. Etaj: sincronizare și inconsecvențe

- Lista scrie doar `floor_label`; câmpul numeric scrie doar `floor`.
- Nu există sincronizare: nici în formular, nici în baza de date (trigger), nici la salvare. Singurul loc care le completează pe amândouă este importul IMMOFLUX.
- Situația azi (55 de proprietăți):
  - 1 contradicție: **HB-1008** — `floor=2`, `floor_label="Etaj 1"`.
  - 1 proprietate are doar număr, fără etichetă: **HB-1002** (`floor=1`).
  - 0 proprietăți au doar etichetă.
- Suprafețe:
  - 39 au doar `usable_surface` (`surface` gol, deci apar cu „—” în listă sau la sortare).
  - 1 are doar `surface` (fără referință).
  - 2 au valori diferite: **HB-1004** (450 / 250) și **RF-1001** (50 / 5, probabil o greșeală de tastare).

## 4. Ce citește fiecare consumator

| Consumator | Etaj | Suprafață |
|---|---|---|
| Romimo | doar `floor` (eticheta e ignorată intenționat) | `usable_surface`; `surface` doar ca ultimă variantă pentru teren/construită |
| PrimulAnunț.ro | doar `floor` | doar `usable_surface` |
| LaCheie | doar `floor` | `usable_surface` → `built_surface` → `surface` → `total_usable_surface` |
| Imobiliare.ro | doar `floor` | `usable_surface` → `surface` |
| Storia | întâi `floor_label`, apoi `floor` | doar `usable_surface` |
| HomePitch | întâi `floor_label`, apoi `floor` | `usable_surface` → `surface` |
| OferteImobiliare | ambele (eticheta are prioritate) | `usable_surface` → `surface` |
| Imove | `floor` | `usable_surface` → `surface` |
| Imospot | `floor` | `usable_surface` → `surface` → construită → teren |
| Properstar | `floor` | `usable_surface` → `built_surface` → `surface` |
| Clickimob | nu trimite nici etajul, nici suprafața | — |
| Feed site agenție | `etaj` = `floor` | `suprafatautila` = `usable_surface`; `suprafata_value` = `surface` |
| Ofertă publică (`/oferta/$id`) | `floor` | `surface`, `usable_surface` și teren (toate trei) |
| Listă / căutare CRM | filtru etaj pe `floor` | filtru, sortare și coloană pe `surface` |
| Pagina proprietății CRM | `floor` | `surface` |
| Contracte | `floor_label`, iar dacă lipsește, `floor` | `usable_surface`, `surface` |
| Verificări portal (cerințe) | — | `usable_surface` → `surface` |
| Import IMMOFLUX | scrie ambele (din același cod) | scrie doar `usable_surface` |

Consecință: la HB-1008, Romimo, PrimulAnunț.ro, LaCheie și Imobiliare.ro trimit etajul 2, iar Storia, HomePitch și OferteImobiliare trimit etajul 1.

## 5. Alte dubluri în același formular

- „Utilă” (`usable_surface`) și „Utilă totală” (`total_usable_surface`) sunt concepte diferite, deci nu sunt dubluri reale, dar se pot confunda.
- „Balcoane” (număr, `balconies`) și bifa „Balcon” (`balcony`) se suprapun ca sens.
- „Parcări” (`parking_spaces`) și „Tip parcare” (`parking`), respectiv „Garaje”: câmpuri diferite, nu dubluri.
- „Facilități” (`features`, adăugat tot pe 20.09) și „Diverse” (`misc_features`): liste separate; opțiunile se pot suprapune parțial — de verificat la o eventuală curățenie.

## Varianta recomandată

- **Etaj:** rămâne lista „Etaj”. La salvare, `floor` se calculează din ea: Demisol = -1, Parter și Parter înalt = 0, „Etaj N” = N. Pentru valorile care nu au un număr fix („Etaj 10+”, „Penultimul”, „Ultimul”, „Mansardă”), se afișează un număr cerut doar pentru acestea. „Etaj (număr)” dispare ca câmp separat.
- **Suprafață:** rămâne un singur câmp „Suprafață utilă (m²)”, care scrie `usable_surface`. `surface` devine o valoare derivată, folosită la căutare, sortare și afișare: `usable_surface`, altfel `built_surface`, altfel `land_surface`. Câmpul „Utilă (m²)” duplicat dispare.
- **Corectarea datelor existente** (după confirmare, o singură dată):
  - `surface` gol se completează automat din `usable_surface` (39 de proprietăți).
  - `floor_label` lipsă se completează din `floor` (HB-1002 → „Etaj 1”).
  - Cazurile contradictorii se hotărăsc manual de agent: HB-1008 (etaj 1 sau 2), HB-1004 (450 sau 250 m²), RF-1001 (5 sau 50 m²).
  - Proprietatea fără referință care are doar `surface`: se copiază valoarea în `usable_surface`.
