# Raport: dotări dublate în fila Prezentare (doar constatare)

Nimic modificat. Datele: 86 de proprietăți neșterse.

## 1. Grupuri, constante, coloane

Toate listele sunt în `src/lib/property-taxonomy.ts`, afișate de `CheckGroup` în `src/components/app/PropertyDetailsFields.tsx` (secțiunea „Dotări").

| Grup UI | Constantă | Coloană |
|---|---|---|
| Mobilat (radio) | `furnishingOptions` | `furnishing` |
| Spații adiționale | `additionalSpaceOptions` | `additional_spaces` |
| Bucătărie | `kitchenOptions` | `kitchen_features` |
| Contorizare | `meteringOptions` | `metering` |
| Electrocasnice | `applianceOptions` | `appliances` |
| Imobil | `buildingAmenityOptions` | `building_amenities` |
| Amenajare străzi | `streetArrangementOptions` | `street_arrangement` |
| Priveliște | `viewOptions` | `views` |
| Diverse | `miscFeatureOptions` | `misc_features` |
| Facilități | `generalFeatureOptions` | `features` |
| Climatizare / Sistem încălzire (Utilități) | `coolingOptions` / `heatingOptions` | `cooling_systems` / `heating_systems` |
| Bife/număr în Detalii | — | `balcony`, `balconies`, `terraces`, `parking_spaces`, `parking` |

## 2. Dubluri și variante apropiate

Toate dublurile reale vin din „Facilități” (`features`), lista veche adăugată pe 20.09.

| Opțiune „Facilități” | Dublează | Proprietăți: doar în `features` / doar în celălalt / în ambele |
|---|---|---|
| Lift | Imobil → Lift (`building_amenities`) | 6 / 7 / **2** |
| Grădină | Imobil → Grădină; și „Suprafață grădină” | 0 / 0 / 0 |
| Terasă | Spații adiționale → Terasă; număr „Terase” | 0 / 0 / 0 |
| Aer condiționat | Climatizare (`cooling_systems`) | 2 / 4 / 0 |
| Centrală proprie | Sistem încălzire (`heating_systems`) | 3 / 12 / **2** |
| Mobilat | radio „Mobilat” (`furnishing`) | 2 cu bifa; 12 cu `furnishing`; **1 contradicție** (bifat „Mobilat”, dar `furnishing` gol/„Nemobilat”) |
| Balcon | bifa „Balcon” (`balcony`) și „Balcoane” (număr) | 5 / 5 bool / 79 cu număr > 0 |
| Parcare | „Parcări” (număr) și „Tip parcare” | 2 / 4 |
| Boxă | Spații adiționale → „Boxă la subsol” | 0 / 0 |

Variante apropiate, nu chiar dubluri:
- „Curte” / „Curte comună” (ambele în Imobil): 0 proprietăți cu ambele.
- „Șemineu” (Diverse) / „Semineu” (Sistem încălzire, scris fără diacritice): 0 / 0 — aceeași noțiune, ortografii diferite.
- „Mobilată” (Bucătărie) se referă la bucătărie, nu la locuință — nu e dublură.
- „Terasă” (Spații adiționale) față de numărul „Terase” — suprapunere de sens.

## 3. Cum le folosesc consumatorii

| Consumator | Ce citește | Trimite de două ori? |
|---|---|---|
| Feed site agenție (`site-feed/mapper.ts`) | toate grupurile, unite | Nu — elimină dublurile exacte (`Set`); „Șemineu”/„Semineu” ar apărea ambele |
| Properstar | `features` + `building_amenities` + `additional_spaces` | Nu — `Set` |
| HomePitch | toate + bife, transformate în etichete | Nu — etichete unice |
| Imobiliare.ro | `features` în grupul „general”, `building_amenities` în „facilități imobil” | **Posibil**: „Lift” poate ajunge în două grupuri diferite ale portalului; de verificat în tabelul de corespondență |
| OferteImobiliare | `features` unit cu `misc_features` | Coduri nepotrivite sunt sărite (cu avertisment); „Lift” bifat în Facilități nu ajunge în grupul clădirii — se poate pierde |
| Storia | `building_amenities`, `cooling_systems`, `misc_features` (nu `features`) | Nu; dar „Lift”/„Aer condiționat” bifate doar în Facilități **nu se trimit** |
| LaCheie | doar `building_amenities` | Nu; „Lift” doar în Facilități se pierde |
| Romimo, PrimulAnunț.ro | nu citesc `features` | — |
| ClickImob | nu trimite dotări | — |
| Ofertă publică `/oferta/$id` | doar `features` | Nu; dar dotările din grupurile noi nu se văd |
| Descrieri AI (`marketing/facts.ts`) | toate grupurile unite | Fără eliminare de dubluri: „Lift” poate apărea de două ori în faptele trimise modelului |
| Potrivire cu cereri (`matching.ts`, `crm/matching.ts`) | doar `features` | Dotările din grupurile noi sunt ignorate la potrivire |

Concluzie: dublura nu produce valori trimise de două ori către majoritatea portalurilor; riscul real e invers — date bifate într-un singur loc care nu ajung la portalurile ce citesc celălalt loc. Excepție de verificat: Imobiliare.ro.

## 4. Propunere (neaplicată)

**UI:** se elimină grupul „Facilități” din formular. Fiecare opțiune rămâne într-un singur loc:

| Din Facilități | Rămâne în |
|---|---|
| Lift, Grădină | Imobil (`building_amenities`) |
| Terasă, Boxă | Spații adiționale („Terasă”, „Boxă la subsol”) |
| Aer condiționat | Climatizare (`cooling_systems`) |
| Centrală proprie | Sistem încălzire (`heating_systems`) |
| Mobilat | radio „Mobilat” (`furnishing`) |
| Balcon | bifa „Balcon” / „Balcoane” |
| Parcare | „Parcări” / „Tip parcare” |

Plus: o singură ortografie „Șemineu”; „Curte” și „Curte comună” rămân separate.

**Migrare date (o singură dată, după confirmare, fără ștergere):**
- se copiază valoarea din `features` în coloana țintă dacă lipsește (fără dubluri);
- „Balcon” → `balcony = true`; „Parcare” → `parking_spaces = 1` doar dacă e gol; „Mobilat” → `furnishing` doar dacă e gol (cazul contradictoriu se lasă agentului);
- `features` rămâne neatinsă ca arhivă (coloana se păstrează), apoi nu mai e scrisă de formular;
- audit cu numărul de proprietăți modificate.

**Adaptoare și alte locuri de ajustat:**
- Imobiliare.ro: scoate `features` din grupul „general” (sau verifică întâi corespondența „Lift”).
- OferteImobiliare: nu mai citi `features` în grupul „diverse”.
- Ofertă publică și potrivirea cu cereri: citesc dotările unite din toate grupurile (aceeași funcție ca feedul site), nu doar `features`.
- Descrieri AI: elimină dublurile din lista de fapte.
- Properstar, HomePitch, feed site: păstrează temporar și `features`, apoi se scoate după migrare.
- Teste pentru fiecare adaptor: aceeași dotare nu apare de două ori și nu se pierde.
