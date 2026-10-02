# Comision standard pentru colaborare

## Implementare
- Adaug exclusiv coloana opțională `organizations.collab_default_commission_percent`, validată între 0 și 100, fără modificarea datelor existente.
- Extind formularul Setări → Agenție cu un câmp afișat doar când colaborarea este activă; gol înseamnă fără standard și salvarea rămâne pe traseul protejat existent.
- Extind citirea colaborării proprietății cu standardul agenției și aplic regula: valoarea proprietății are prioritate, altfel se copiază standardul la bifare; lipsa ambelor păstrează eroarea actuală. Valoarea `0` rămâne validă.
- Fac opțional câmpul din fila Publicare când există standard, cu textele și legătura către Setări → Agenție cerute, păstrând schimbările Publicat/Nepublicat.
- Aliniez numai celelalte validări și apeluri existente care folosesc acest comision; nu schimb ofertele, propunerile, vizibilitatea sau publicarea.

## Verificare
- Adaug teste pentru valoare explicită, standard 7, lipsa ambelor, zero explicit, intervalul 0–100 și interdicția pentru agent.
- Rulez testele țintite, verificarea tipurilor și buildul; testele nu fac apeluri la portaluri și nu modifică anunțuri reale.

## Detalii tehnice
- Migrarea este strict aditivă și nu face backfill; cele patru proprietăți existente rămân neschimbate.
- Permisiunea de actualizare rămâne cea existentă pentru `organizations`, inclusiv protecția server/bază de date pentru administratorul agenției.
