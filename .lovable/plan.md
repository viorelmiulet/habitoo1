# Promovare Imobiliare.ro, direct din CRM

Adaug administrarea reală a serviciilor de promovare Imobiliare.ro pe pagina proprietății: câte locuri are agenția, câte sunt folosite, care anunțuri le consumă și activarea/dezactivarea per ofertă — totul citit și scris live la portal, fără valori inventate.

## Ce vede utilizatorul

O secțiune nouă „Promovare Imobiliare.ro”, sub rândul portalului, activă doar când oferta este publicată acolo:

```text
Promovat            [ ]     2 / 5     disponibile 3
Top Listing         [x]     8 / 8     ocupat — poate fi doar dezactivat
Top Listing S       [ ]     1 / 1     fără locuri libere
Bonus               [ ]     1 / 3     disponibile 2
Pole Position       [ ]     0 / 2
imoradar24          [ ]     —
Puncte Energy       [ 5 ]   5 / 5
```

- click pe contor → lista reală a anunțurilor care consumă locurile respective;
- „Sincronizează” reîncarcă cifrele; se arată momentul ultimei citiri;
- dacă un serviciu nu poate fi citit, restul rămân funcționale, iar acela arată eroarea lui;
- fără locuri libere, activarea este blocată cu explicație; dezactivarea rămâne mereu posibilă;
- Energy are câmp numeric, nu bifă, limitat la locurile disponibile plus valoarea curentă;
- „Vizionare prin apel video” NU intră aici (este caracteristică a ofertei, nu serviciu de promovare).

## Implementare

Endpointuri noi folosite (host existent, sesiune OAuth existentă, strict server-side):
- `GET /api/v3/promotions/slots/{slot_type}` — inventar (`data.total`, `data.used`);
- `GET /api/v3/promotions/listings/{slot_type}` — anunțurile care consumă locurile;
- `POST /api/v3/listings/{CUSTOM_REFERENCE}/promotions` — scriere parțială, doar câmpurile schimbate.

Fișiere:
- `src/lib/portals/imobiliare/promotions.ts` (nou, pur) — registrul unic de mapări: `promo→promo`, `tl→top_listing`, `tls→top_listing_s`, `energy→energy` (numeric), `bonus→bonus`, `pole_position→pole_position`, `promote_imoradar→promote_imoradar` (fără inventar), `similar→similar_properties`, `month→properties_of_the_month`; `starter` și `rotatii` doar inventar, fără câmp de scriere. Plus normalizarea `total/used/available` și parsarea listelor.
- `src/lib/portals/imobiliare/promotions.server.ts` (nou) — citirea inventarului pe fiecare slot în paralel cu izolarea erorilor, citirea listelor și scrierea parțială cu revalidare a inventarului înainte de activare.
- `src/lib/portals/imobiliare-promotions.functions.ts` (nou) — trei funcții de server: inventar + starea ofertei, activare/dezactivare, lista pe slot. Aceleași verificări de acces și izolare pe agenție ca la restul portalului; fiecare scriere intră în jurnalul de operațiuni.
- `src/lib/portals.functions.ts` — expun (fără schimbare de comportament) cele trei ajutoare interne deja folosite: resolvarea agenției, construirea contextului portalului, jurnalizarea.
- `src/components/app/PropertyImobiliarePromotionsCard.tsx` (nou) — secțiunea de UI.
- `src/components/app/PropertyPortalsCard.tsx` — o randează pentru rândul Imobiliare.ro, exact ca blocul Storia existent.
- `src/lib/portals/imobiliare/tests/promotions.test.ts` (nou) — mapări per serviciu, inventar total/folosit/disponibil, inventar indisponibil, zero locuri, serviciu activ cu locuri epuizate (dezactivare permisă), scriere parțială, listă pe slot, reînnoire token la 401, fără scurgeri de secrete, izolare pe agenții.

## Limite asumate

- Starea curentă a serviciilor pentru ofertă se deduce din listele reale pe slot; dacă un slot nu poate fi citit, starea lui apare „necunoscută”, nu „inactivă”.
- Cifrele nu se stochează local: sursa de adevăr rămâne portalul. În baza de date păstrez doar legătura ofertă ↔ referință Imobiliare.ro (deja existentă) și jurnalul operațiunilor.
- Nicio modificare reală de promovare nu se declanșează automat sau din teste — doar la acțiunea explicită a utilizatorului.
- Nu ating Stage 19, AI/ACP/Manager/Prospecting, La Cheie sau celelalte portaluri; nu adaug promovări plătite ca produs nou, doar administrarea serviciilor din contul agenției.

## Validare

Teste complete, verificare de tipuri și build.
