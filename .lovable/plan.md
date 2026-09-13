# Modul Contracte — etapa 2

Înlocuim experiența generică pentru documentele noi cu un contract real de închiriere și o anexă opțională de inventar, păstrând contractele deja create și fluxul existent de PDF și semnare.

## 1. Modelul documentului

- Actualizez șablonul Habitoo de închiriere cu textul furnizat, fără reformulări și cu toate valorile dinamice completate din formular, proprietate și agenție.
- Documentul va avea două părți distincte: proprietar și chiriaș. Adaug cetățenia și câmpurile specifice contractului: destinație, durată în luni, data începerii, chirie, monedă și garanție.
- Câmpurile lipsă vor produce formulări corecte sau spații de completat; nu vor apărea niciodată `null` ori `undefined`. Linia actului va omite complet „seria” când seria lipsește.
- Șabloanele generice Habitoo vechi vor fi retrase din selectorul pentru documente noi, fără a afecta documentele istorice sau șabloanele personalizate deja copiate de agenții.

## 2. Formularul de creare

- Refac formularul pentru contractul de închiriere cu secțiuni separate pentru proprietar și chiriaș, fiecare cu completare manuală și scanare/verificare a actului.
- Proprietatea va precompleta adresa completă, numărul de camere, prețul și moneda când datele există; contactele CRM pot precompleta părțile.
- Adaug opțiunea „Include proces-verbal de predare-primire”, implicit debifată.
- La bifare, afișez tabelul de inventar precompletat cu lista standard cerută. Fiecare rând poate fi editat, adăugat sau șters, iar „Stare” este un selector cu cele patru valori cerute.

## 3. Configurarea inventarului agenției

- Adaug în Setări → Agenție o secțiune pentru lista implicită de inventar, disponibilă doar administratorului agenției.
- Lista se salvează la nivelul agenției și devine sursa pentru contractele create ulterior; contractele deja create păstrează propriul snapshot.
- Validarea și autorizarea salvării se fac și pe server, nu doar în interfață.

## 4. PDF și semnare

- Extind generatorul PDF pentru structură juridică lizibilă: titlu, subtitlu, secțiuni, corp, anexă tabelară și pagină finală de semnături în două coloane, PROPRIETAR / CHIRIAS.
- Anexa se include în același PDF și folosește aceleași părți și aceleași linkuri de semnare; nu creează document sau token separat.
- Adaug subsolul cerut pe fiecare pagină, cu datele agenției și numerotarea „Pagina X din Y”. Logo-ul agenției rămâne în antet.
- Regenerarea după fiecare semnătură va aplica semnăturile pe aceeași pagină finală și va păstra anexa inclusă.

## 5. Date, compatibilitate și verificare

- Adaug doar câmpurile necesare pentru cetățenie și configurația implicită de inventar, cu drepturi și politici conforme izolării pe agenție; datele contractului și inventarul se păstrează ca snapshot.
- Adaug teste pentru textul exact, valorile lipsă, linia de act fără serie, inventarul implicit/editat și structura PDF.
- Rulez verificarea de tipuri, toate testele și verificarea vizuală a PDF-ului generat, corectând orice suprapunere, tăiere sau problemă de diacritice.

## Presupunere de compatibilitate

„Înlocuiește șabloanele generice” înseamnă că retragem șabloanele Habitoo generice din crearea documentelor noi. Nu ștergem contracte istorice și nici șabloane personalizate ale agențiilor.

## Detalii tehnice

- Migrare aditivă pentru `contract_parties.citizenship` și `organizations.contract_inventory_defaults`, cu valoare implicită sigură și fără schimbări distructive.
- Snapshotul specific contractului rămâne în `contracts.data`; generatorul PDF citește exclusiv snapshotul și părțile contractului, astfel încât o schimbare ulterioară în Setări să nu modifice documente existente.
- Actualizarea șabloanelor platformei se face idempotent, iar lista de șabloane va folosi doar înregistrările active.
