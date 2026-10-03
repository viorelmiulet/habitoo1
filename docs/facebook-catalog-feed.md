# Feed Catalog Facebook (Home listings)

**URL:** `GET https://crm.habitoo.ro/api/public/catalog/v1/facebook.csv?token=<token feed agenție>`

**Autentificare:** același token de feed al agenției ca la `/api/public/sites/v1/*`
(Bearer, `X-Habitoo-Feed-Token` sau `?token=`). Agenția rezultă din token.
Fiecare cerere se loghează în `site_feed_access_logs` (`endpoint = catalog.facebook`,
`items` = anunțuri incluse, `detail` = excluderi pe motiv).

**Format:** `text/csv; charset=utf-8`, RFC 4180, antet pe primul rând, CRLF.

## Coloane
`home_listing_id, name, description, availability, price, url, image[0].url … image[19].url,
address.addr1, address.city, address.region, address.country, address.postal_code,
latitude, longitude, neighborhood[0], property_type, listing_type, num_beds, num_baths,
year_built, area_size, area_unit`

- `price`: `89900 EUR`. Vânzarea are prioritate față de închiriere (un rând per anunț).
- `availability`: active/negociere → `for_sale`/`for_rent`; rezervat (vânzare) → `sale_pending`.
- `property_type`: apartament/garsonieră → `apartment`, casă/vilă → `house`, teren → `land`, restul → `other`.
- `address.addr1` doar când locația e exactă; coordonatele sunt aproximate când locația e ascunsă.
- `address.region` = județ, `address.country` = `RO`, `area_unit` = `sq_m` (suprafața utilă, altfel suprafața).
- Imaginile: maximum 20, aceleași URL-uri publice `/api/public/sites/v1/media/{id}`.

## Excludere
Intră doar anunțurile publicate, nesterse, cu status activ/rezervat/negociere.
Un anunț e exclus dacă nu are preț, coordonate, cel puțin o fotografie publicabilă sau oraș.
Nu se inventează valori; câmpurile opționale lipsă rămân goale.
