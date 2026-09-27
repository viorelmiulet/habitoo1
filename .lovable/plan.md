# FAQ randat pe server și date structurate

## Implementare
- Definirea celor 10 întrebări și răspunsuri exacte pentru pagina principală și afișarea lor înaintea îndemnului final, cu titluri `h3` și răspunsuri prezente integral în HTML-ul serverului.
- Înlocuirea comportamentului FAQ de pe pagina de prețuri cu markup randat integral pe server, păstrând neschimbate cele 6 texte existente.
- Adăugarea câte unui bloc JSON-LD `FAQPage` pe fiecare pagină, generat din aceeași listă de conținut afișată pentru a garanta identitatea textelor.

## Verificare
- Teste pentru numărul și conținutul întrebărilor, titlurile `h3` și JSON-LD valid.
- Verificare HTML cu `curl` pe mediul local și preview înainte/după; verificarea domeniului public va reflecta schimbarea numai după publicare.
- Rularea verificării TypeScript și a tuturor testelor proiectului.

## Limită
Nu se modifică alte secțiuni, texte, stiluri sau funcționalități ale paginilor.
