# Raport: „Subcategorie neacceptată” la importul IMMOFLUX (doar investigație, nimic modificat)

## 1. Unde și ce regulă
- Fișier: `src/lib/property-import/immoflux/mapper.ts`, funcția `mapImmofluxItem`.
- Mesajul vine din câmpul `subcategory_id` din JSON. Regula, aplicată pe rând:
  - `category_id === 0`, titlu sau oraș lipsă: anunțul e sărit ca ciornă goală, fără să se mai verifice subcategoria.
  - `transaction_id`: 1 = vânzare, 2 = închiriere; orice altă valoare e respinsă.
  - `subcategory_id`: doar 101 = apartament și 102 = garsonieră sunt acceptate. Orice altă valoare dă „Subcategorie neacceptată (X)”.
  - `price_currency` trebuie să fie 1 (EUR).
- Valorile vin din JSON-ul IMMOFLUX, câmpul `subcategory_id` al fiecărui anunț. 201 și 0 nu sunt definite nicăieri în cod.
- Ipoteză, nedocumentată în proiect: codurile par să urmeze tiparul „categorie × 100 + număr”. După ea, 201 ar fi probabil prima subcategorie a categoriei 2 (case/vile), iar 0 înseamnă subcategorie necompletată.

## 2. De ce exact aceste două
- Previzualizarea nu salvează JSON-ul. Tabelul joburilor de import are doar contoare și raport, nu datele trimise, așa că nu pot vedea fișierul.
- #292765 „Casa individuala Chiajna”: are `subcategory_id = 201`, deci este o casă, iar mapperul acceptă doar apartamente.
- #292768 „Hala de inchiriat…”: are `subcategory_id = 0`. `category_id` este diferit de 0, altfel ar fi fost sărit ca ciornă.
- De verificat în JSON, pentru fiecare dintre cele două: `category_id`, `subcategory_id`, `transaction_id`, `price_currency`. Ajută să comparați cu alte anunțuri din export care au aceeași `category_id`, ca să vedeți dicționarul codurilor.

## 3. Ce putem face
Nu este o eroare a datelor: mapperul a fost construit intenționat doar pentru apartamente. Ca să le importăm, extindem maparea pe baza codurilor reale din export:
- Casă (201 și restul subcategoriilor categoriei 2): în Habitoo `house` (sau `villa`, dacă IMMOFLUX are o subcategorie distinctă pentru vilă).
- Hală: în Habitoo `industrial`. Pentru că subcategoria e 0, maparea trebuie făcută pe `category_id`: categoria de spații industriale/comerciale duce la `industrial`, `commercial` sau `office`.
- Alte valori posibile în nomenclatorul Habitoo: `land` pentru terenuri.
- Atenție: câmpurile specifice apartamentului (etaj, compartimentare, confort) trebuie tratate ca opționale la case și hale. În plus, la case ar trebui citite suprafața terenului și numărul de niveluri, dacă există în JSON.
- Înainte de extindere avem nevoie de dicționarul codurilor IMMOFLUX (`category_id` și `subcategory_id`), din documentația lor sau dedus din export.

## 4. Alte categorii care ar cădea la fel
Da. Orice anunț care nu e apartament sau garsonieră ar fi sărit cu același motiv: case, vile, terenuri, spații comerciale, birouri, hale. Lista exactă se poate scoate numărând valorile `category_id`/`subcategory_id` din JSON-ul MRM. Fără fișier nu o pot confirma.

## Pas propus, dacă vreți implementare
Trimiteți JSON-ul sau lista codurilor. Extind apoi `mapImmofluxItem` cu tabela de mapare, cu teste, fără să rulez importul.
