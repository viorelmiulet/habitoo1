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
- ofertă: `https://habitoo.ro/oferta/{propertyId}`

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
- Câmpurile ImmoFlux fără echivalent real în Habitoo rămân `null`/goale — nu se
  derivează și nu se inventează valori: `pretfaratva` (modelul nu garantează
  prețul fără TVA), `comisioncumparator` (comision intern, nepublic), `caroiaj`,
  `titlu.en`, `descriere.en`, `custom1`, `custom2`, `vecinatati`,
  `eficienta_energetica`, `consum_specific`, `indice_emisii`,
  `consum_energie_regenerabila`, `energy.*`, iar pentru terenuri
  `nrfronturistradale`, `frontstradal`, `latimedrumacces` (nu există coloane).
  `tipteren` / `clasificareteren` depind de `properties.category`, care în
  practică este încă necompletat.
  `portals` provine din publicările active plus convenția de tag `portal:<nume>`.


## Sincronizare

Feedul este pull-based: site-ul citește `/properties` periodic și folosește
`datamodificare` pentru a detecta schimbările. Imaginile sunt servite prin
`/media/{imageId}`, deci URL-urile rămân stabile chiar dacă storage-ul rotește
semnăturile.

## Portaluri imobiliare (model generic) — ClickImob

### Baza URL a feedului

Baza canonică rămâne `https://crm.habitoo.ro/api/public/sites/v1`. Prefixul
`/api/public/` este singurul care ocolește autentificarea site-ului publicat;
un alias `/api/sites/v1/*` ar fi blocat înainte de a ajunge la handler, deci nu
îl expunem. Structura răspunsurilor rămâne compatibilă cu modelul ImmoFlux
(`total`, `per_page`, `current_page`, `last_page`, `next_page_url`,
`prev_page_url`, `from`, `to`, `data`).

### Model generic de publicare

- `portal_integrations` — o configurare per agenție și portal: `portal_key`,
  `status` (`not_configured` | `ready` | `active` | `error`), `enabled`,
  `endpoint_url`, `external_agency_id`, `credential_prefix`,
  `credential_secret` (fără grant pentru `authenticated`), `last_sync_at`,
  `last_error`, `last_error_at`, `config`.
- `portal_publications` — publicarea unei oferte pe un portal: `property_id`,
  `portal_key`, `enabled`, `status`, `external_ref`, `last_synced_at`,
  `last_error`.
- Câmpul `portals` din feed provine din publicările active, unit cu tagurile
  legacy `portal:<nume>`. Nicio cheie de portal nu este presupusă în cod.

### Adaptorul ClickImob (doar pregătire)

`src/lib/portals/clickimob.ts` construiește notificarea documentată public:

```
POST https://www.clickimob.ro/api/public/crm-webhook
     ?agency=<agency_uuid>&token=<webhook_token>&provider=immoflux
body: {"id": "<property_id>"}
```

`notifyPropertyChanged` rulează implicit în dry-run: nu se face niciun request
real către ClickImob fără `allowLiveRequests: true`, integrare activă și
credențiale reale. Tokenul este mascat în orice URL folosit pentru diagnostic.
Dependențe externe rămase de confirmat de ClickImob: acceptarea Habitoo ca
provider (astăzi endpointul acceptă `provider=immoflux`), `agency` UUID și
tokenul de webhook.

### Pagina publică a ofertei

Fiecare ofertă publicată are o adresă stabilă pe site: `https://habitoo.ro/oferta/{propertyId}`
(`url` în feed). Pagina CRM rămâne pe `crm.habitoo.ro`; pagina publică citește
strict proprietăți publicate, nearhivate, cu status public, și doar fotografii
`include_in_publish = true` și `is_confidential = false`.

### Câmpuri noi în feed

`nrdormitoare`, `tvainclus`, `referintaexterna`, `strada`, `numarstradal`,
`cod_siruta_judet`, `cod_siruta_uat`, `cod_siruta_localitate`.

Extindere pentru compatibilitate maximă cu maparea ImmoFlux (nume exacte
documentate de ImmoFlux, aceleași în `/properties` și `/properties/{id}`):

| Câmp ImmoFlux | Sursa Habitoo |
| --- | --- |
| `tip` | `properties.property_type` |
| `mobilat_value` | `properties.furnishing` (același ca `mobilare_value`) |
| `utilitati_values` | `properties.utilities` (același ca `utilitati`) |
| `dotari_values` | `properties.features` (același ca `dotari`) |

Câmpurile fără echivalent real rămân expuse explicit ca `null`/listă goală, ca
integratorul să vadă contractul complet: `stadiuconstructie_value`,
`tipconstructie_value`, `starefinisaje_value`, `bucatarie_values`,
`eficienta_energetica`, `consum_specific`, `indice_emisii`,
`consum_energie_regenerabila`, `nrfronturistradale`, `frontstradal`,
`latimedrumacces`, plus cele listate în „Limitări cunoscute”.



## Câmpuri alimentate din secțiunile de detalii ale anunțului

Formularul proprietății are secțiunile Detalii, Suprafețe, Clădire, Utilități,
Finisaje și Dotări (taxonomie apropiată de ImmoFlux, cu denumiri text în
română). Din ele se alimentează:

| Câmp ImmoFlux | Sursa Habitoo |
| --- | --- |
| `confort` | `properties.comfort` |
| `nrbucatarii` | `properties.kitchens` |
| `nrbalcoane` | `properties.balconies` |
| `nrgaraje` | `properties.garages` |
| `stadiuconstructie`, `stadiuconstructie_value` | `properties.construction_stage` |
| `structurarezistenta` | `properties.building_structure` |
| `tipconstructie_value` | `properties.building_type` |
| `starefinisaje_value` | `properties.finish_state` |
| `bucatarie_values` | `properties.kitchen_features` |
| `mobilat_value` / `mobilare_value` | `properties.furnishing` |
| `incalzire_value` | `properties.heating` sau prima valoare din `heating_systems` |
| `finisaje` | izolații + pereți + podele + ferestre + jaluzele + rulouri + ușă intrare + uși interior |
| `dotari`, `dotari_values` | `features` + spații adiționale + bucătărie + contorizare + electrocasnice + imobil + amenajare străzi + priveliște + diverse + climatizare |
| `utilitati`, `utilitati_values` | `properties.utilities` |

Restul câmpurilor colectate în formular (destinație, orientare, an renovare,
parcări, geam la baie, bucătărie deschisă, pet friendly, cheia în agenție,
suprafețe pe balcoane/terase/grădină, risc seismic, înălțime S+/D+/P+/M/Pod,
etaje retrase) se stochează în Habitoo, dar nu au un câmp ImmoFlux documentat,
deci nu sunt inventate în feed.


## Tranzacție: vânzare, închiriere sau ambele

O proprietate poate fi listată simultan de vânzare și de închiriere. În formular
există două bife independente („De vânzare”, „De închiriere”), fiecare cu preț și
monedă proprii (`properties.for_sale`, `sale_price`, `sale_currency`,
`for_rent`, `rent_price`, `rent_currency`). `transaction_kind`, `price` și
`currency` rămân sincronizate cu tranzacția principală, pentru compatibilitate
cu filtrele și matching-ul existente.

În feed:

| Câmp | Regulă |
| --- | --- |
| `devanzare` | true doar dacă „De vânzare” este bifat |
| `deinchiriere` | true doar dacă „De închiriere” este bifat |
| `pretvanzare`, `monedavanzare` | completate doar când vânzarea e activă |
| `pretinchiriere`, `monedainchiriere` | completate doar când închirierea e activă |

Feedul trimite ambele seturi pe **aceeași** intrare din `/properties` — nu
duplicăm proprietatea. Portalul (ex. ClickImob, prin `mapImmofluxProperty`)
generează din același payload rândurile de care are nevoie. `status` (`active`,
`reserved`, `negotiation`) este independent de tipul de tranzacție.

Feedul iMove rămâne mono-tranzacție (`SALE|RENT`, conform documentației iMove) și
folosește tranzacția principală a proprietății.
