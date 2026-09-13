# Contract de reprezentare exclusivă

## Ce construiesc
- Adaug al treilea tip de document, „Contract de reprezentare exclusivă”, fără a modifica fluxurile existente pentru închiriere și proces-verbal.
- Reproduc integral textul furnizat, cu înlocuirea strictă a câmpurilor variabile și fără valori `null`/`undefined` vizibile.
- Păstrez citirea actului cu verificare, PDF-ul cu logo, linkurile cu token și semnarea comună.

## Formularul de generare
- Selector de tip document, apoi formularul specific șablonului ales.
- Beneficiar precompletabil din contacte și editabil integral.
- Proprietate opțională: dacă este selectată, precompletez localitatea, strada, numărul, județul, camerele, compartimentarea, etajul, confortul, băile, balcoanele, suprafața și prețul; toate rămân editabile.
- Comision implicit 3%, durată implicit 6 luni, negociabil DA/NU și monedă editabilă.
- Numărul contractului va fi generat automat, fără `max + 1`, într-un format stabil bazat pe o secvență; agentul poate introduce manual alt număr înainte de creare. Unicitatea este verificată în cadrul agenției.

## Setări agenție
- Adaug „Reprezentant legal” și „Funcția reprezentantului” la Setări → Agenție.
- Doar administratorul agenției le poate modifica; valorile sunt salvate și folosite automat în contract.

## Document și semnături
- PDF cu titlul și subtitlul cerute, corpul exact, listele cu marcatori și paginare.
- Regula actului fără serie produce doar „nr. …”.
- Pagina finală are PRESTATOR în stânga, cu denumirea agenției, și BENEFICIAR în dreapta, cu numele persoanei.
- Subsolul păstrează datele agenției și „Pagina X din Y”.

## Detalii tehnice
- Extind schema doar aditiv pentru setările agenției și numărul contractului, cu politici și drepturi existente păstrate.
- Salvez în document un snapshot al datelor editate, astfel încât modificările ulterioare ale proprietății sau agenției să nu schimbe contractul existent.
- Adaug randare testabilă separat și verificări pentru text, câmpuri lipsă, numerotare, semnături și PDF.

## Verificare
- Typecheck și toate testele automate.
- Generez un PDF complet și inspectez vizual fiecare pagină pentru tăieri, suprapuneri și pagina de semnături.
