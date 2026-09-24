# Raport: cele 5 eșecuri LaCheie din jobul `ad9f95e6…` (doar constatări)

Nu am modificat nimic și nu am apelat LaCheie.

## 1. Cele 5 oferte

| Ofertă (property_id) | Ora (UTC) | Eroare salvată | Cod HTTP / răspuns portal | Versiune rezervată |
|---|---|---|---|---|
| fb38eb61… (…-SALE) | 03:58:02 | „Portalul a returnat o eroare. Reîncearcă mai târziu.” | lipsă / lipsă | 3 (acceptată: 1), `pending` |
| f0b28888… | 03:58:03 | la fel | lipsă / lipsă | 4 (acceptată: 2), `pending` |
| edde9ba5… | 03:58:05 | la fel | lipsă / lipsă | 11 (acceptată: 9), `pending` |
| 2c6d7bf3… | 03:58:06 | la fel | lipsă / lipsă | 14 (acceptată: 9), `pending` |
| 1564cc61… | 03:58:08 | la fel | lipsă / lipsă | 32 (acceptată: 27), `pending` |

- Pentru toate: cod intern `PORTAL_ERROR`, o singură încercare, operația `agency_resend`. Aceeași eroare apare în `portal_listings` și în jurnalul de operații.
- `http_status`, `portal_response`, `duration_ms` și `external_id` sunt goale în jurnal pentru toate cele 5.
- Mesajul nu are prefixul „La Cheie:”, deci nu vine din blocul de eroare generic al fluxului de publicare. Vine din blocul de eroare al adaptorului LaCheie.
- Cererea ar fi trebuit să fie un `PUT /properties/HBT-<id>-SALE` cu versiunea rezervată. Versiunea a fost rezervată (`pending`), dar nu există niciun rezultat înregistrat, nici reușită, nici respingere. Asta indică faptul că cererea nu a plecat către LaCheie.

## 2. Unde se pierde codul HTTP

Adaptorul LaCheie, funcția `sendOffer`:

```text
l.248  const offerBody = ...   // corpul ofertei, fără external_id
l.256  laCheieRequest(config, { method: "PUT", path, body, sourceVersion })
                                                     ^^^^ folosește `body`, nu `offerBody`
l.355  const body = (response.body ?? {})  // declarat mai jos, în aceeași funcție
```

- La primul apel, `body` referă variabila declarată la linia 355, care încă nu există. Rezultatul este o eroare JavaScript („Cannot access 'body' before initialization”), aruncată înainte de orice cerere către portal.
- Eroarea ajunge în `catch` de la liniile 455–462 din `push`. Acolo, `toPortalError` nu o recunoaște ca timeout sau problemă de rețea și o transformă în `PORTAL_ERROR` generic, fără `httpStatus` și fără `portalResponse`.
- Codul HTTP nu se pierde de fapt: nu a existat niciun răspuns HTTP. Mesajul real al erorii nu este păstrat nicăieri.
- Redenumirea în `offerBody` a fost introdusă pe 17.09 la 18:13 (commit `064cfcdf`), fără actualizarea liniei 256. Aceeași eroare apare și la oferta 76b1d2a2…, pe 20.09 la 17:56.
- Verificarea de tipuri nu a semnalat problema, pentru că folosirea înainte de declarare are loc într-o funcție internă.
- Retragerile (DELETE) nu trec prin această linie. Ele au reușit pe 20.09.

## 3. Conexiunea LaCheie a agenției de test

- Conexiune: `connected`, agenție `active` la LaCheie, `allow_live=true`, mediu production.
- Nu există erori de agenție sau de catalog. Catalogul a fost sincronizat pe 19.09 la 10:30:35, iar agenția pe 19.09 la 10:30:37.
- Ultimul test de conexiune reușit: 19.09 la 10:30:41 UTC. Testele din 15.09 și 17.09 au reușit și ele.
- Cheia de furnizor CRM există pe server. Fără ea, eroarea ar fi fost `CONFIG_ERROR`, nu `PORTAL_ERROR`.
- Credențialele sunt deci valide, iar conexiunea nu este cauza.

## Cauza probabilă

Eroarea este în codul Habitoo, nu la portal și nici la conexiune. În adaptorul LaCheie, cererea de creare/actualizare (`PUT`) folosește variabila `body` înainte ca aceasta să existe, în loc de `offerBody`. Orice publicare sau actualizare către LaCheie aruncă deci o eroare internă înainte de trimitere, începând cu 17.09 la 18:13. Eroarea este raportată generic drept „Portalul a returnat o eroare”, fără cod HTTP. Nicio ofertă nu a ajuns la LaCheie. Pe fiecare ofertă a rămas doar o versiune rezervată, neconfirmată.
