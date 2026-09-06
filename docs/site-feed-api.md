# Habitoo — API feed pentru site-uri și portaluri imobiliare

Fundație compatibilă cu modelul ImmoFlux. Habitoo este sursa de adevăr: feedul
expune **doar** ofertele marcate ca publicate și primește înapoi cereri de
contact și vizualizări.

- Versiune: `habitoo-site-feed/1.0`
- Bază: `https://crm.habitoo.ro/api/public/sites/v1`
- Autentificare: `Authorization: Bearer <token>` (acceptat și `Basic` sau
  `X-Habitoo-Feed-Token`, pentru compatibilitate)

Tokenul se generează din CRM: **Setări → Integrări**. Se afișează o singură
dată, se stochează doar ca hash SHA-256 și este legat de o singură agenție.
Fiecare cerere este logată (endpoint, metodă, status, număr de elemente).

## Ce intră în feed

O proprietate apare doar dacă: `publish_status = published`, nu este ștearsă și
are statusul `active`, `reserved` sau `negotiation`. Imaginile apar doar cu
`include_in_publish = true` și `is_confidential = false`. Notele interne,
proprietarul, comisioanele interne și datele altor agenții nu sunt expuse
niciodată.

## Endpointuri

| Metodă | Cale | Descriere |
| --- | --- | --- |
| GET | `/properties?page=1&per_page=50` | Listă paginată (max. 200/pagină) |
| GET | `/properties/{id}` | O ofertă, după UUID sau referință (`RF-1001`) |
| GET | `/agents` | Agenții activi, doar câmpuri publice |
| POST | `/contacts` | Lead din site → contact + lead în pipeline |
| POST | `/visits` | Raportare vizualizări externe |
| GET | `/visits` | Total vizualizări pe proprietate |
| GET | `/media/{imageId}` | Redirect 302 către URL semnat al imaginii |

Listele returnează `total`, `per_page`, `current_page`, `last_page`,
`next_page_url`, `prev_page_url`, `from`, `to`, `data`.

### POST /contacts

```json
{ "nume": "Ana Popa", "telefon": "0722000000", "email": "ana@example.com",
  "mesaj": "Doresc o vizionare", "id": "<property uuid>", "source": "habitoo.ro" }
```

Necesită telefon sau email. Contactul se deduplică pe email/telefon în agenție.
Leadul deschis este reutilizat **doar** pentru exact aceeași combinație
contact + proprietate (sau contact fără proprietate); un lead nu este niciodată
mutat pe altă proprietate. La reutilizare se actualizează `last_interaction_at`
și se adaugă mesajul nou în `notes` — datele existente ale contactului nu sunt
suprascrise. Sursa devine `website` / `website:<source>`, iar acțiunea este auditată.

### POST /visits

```json
{ "visits": [{ "id": "<property uuid>", "views": 12, "date": "2026-09-06", "source": "habitoo.ro" }] }
```

Vizualizările se agregă pe zi și sursă printr-o operație atomică în baza de date
(`INSERT ... ON CONFLICT DO UPDATE`), deci raportările simultane nu pierd
incrementări. `date` este validată ca dată calendaristică reală (`2026-99-99`
este respinsă) și acceptată doar în fereastra ultimelor 365 de zile, maximum o zi
în viitor. Proprietățile din altă agenție sunt respinse silențios (`rejected`).

## Paginare — comportament garantat

`page` și `per_page` sunt normalizate: valorile 0, negative sau nenumerice devin
`page=1` / `per_page=50`, iar `per_page` este plafonat la 200. O pagină peste
`last_page` returnează **200** cu `data: []` și metadata consistentă (fără 404),
ca integratorul să poată itera în siguranță.

## URL-uri canonice

În producție linkurile sunt independente de hostul cererii:

- imagine: `https://crm.habitoo.ro/api/public/sites/v1/media/{imageId}`
- ofertă: `https://habitoo.ro/oferta-{propertyId}`

Pe preview/local rămân same-origin, pentru testare.

## `/media/{imageId}` — public intenționat

Acest endpoint este **singurul fără token**, ca portalurile și browserele
vizitatorilor să poată încărca imaginile fără să trimită credențiale la fiecare
cerere. Este restrâns strict: ID-ul trebuie să fie UUID valid, imaginea trebuie
să aibă `include_in_publish = true` și `is_confidential = false`, iar
proprietatea-părinte trebuie să treacă aceeași verificare de eligibilitate ca în
feed. Orice altceva primește 404. Răspunsul este un redirect 302 către un URL
semnat, temporar; nu se expun căi interne de storage sau credențiale.

## Limitări cunoscute

- Rate limit-ul (120 cereri/minut pe token prefix + IP) este **best-effort**, în
  memoria instanței de server — nu este un limiter distribuit. IP-ul este folosit
  doar pentru limitare, nu este stocat.
- Logurile de acces păstrează doar prefixul tokenului și un motiv generic
  (`unauthorized`, `rate_limited`). Tokenul, secretul și headerul `Authorization`
  nu sunt niciodată salvate.
- `token_hash` nu este accesibil utilizatorilor autentificați (grant pe coloane);
  doar service role îl poate citi.
- Câmpurile fără echivalent real în Habitoo rămân `null`: `pretfaratva`
  (modelul nu garantează prețul fără TVA), `comisioncumparator` (comision
  intern, nepublic), `confort`, `nrbalcoane`, `nrgaraje`, `energy.*`.
  `portals` provine exclusiv din convenția de tag `portal:<nume>`.

## Sincronizare

Feedul este pull-based: site-ul citește `/properties` periodic și folosește
`datamodificare` pentru a detecta schimbările. Imaginile sunt servite prin
`/media/{imageId}`, deci URL-urile rămân stabile chiar dacă storage-ul rotește
semnăturile.
