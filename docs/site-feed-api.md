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

Necesită telefon sau email. Contactul se deduplică pe email/telefon în agenție;
leadul deschis existent este reutilizat când cererea nu vizează o proprietate.
Sursa devine `website` / `website:<source>`, iar acțiunea este auditată.

### POST /visits

```json
{ "visits": [{ "id": "<property uuid>", "views": 12, "date": "2026-09-06", "source": "habitoo.ro" }] }
```

Vizualizările se agregă pe zi și sursă. Proprietățile din altă agenție sunt
respinse silențios (numărate în `rejected`).

## Sincronizare

Feedul este pull-based: site-ul citește `/properties` periodic și folosește
`datamodificare` pentru a detecta schimbările. Imaginile sunt servite prin
`/media/{imageId}`, deci URL-urile rămân stabile chiar dacă storage-ul rotește
semnăturile.
