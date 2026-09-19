# Properstar — feed XML per agenție (model pull)

## 1. Ce există deja și se refolosește integral

Infrastructura de feed public este completă; Properstar se așează peste ea, fără o a doua schemă de autentificare.

- **Rute publice existente**: `src/routes/api/public/portal/v1/imove.feed.ts` (feed pull per agenție), `src/routes/api/public/sites/v1/*`.
- **Autentificare + logare + limitare**: `src/lib/site-feed/auth.server.ts` — `hashFeedToken` (SHA-256, cheia în clar nu ajunge în DB), căutare în `portal_api_keys` (cheie emisă de Habitoo per agenție și portal, cu `status`, `expires_at`, `scopes`, `request_count`), rate limit în memorie 120 cereri/minut pe prefix+IP, `logFeedAccess` → `site_feed_access_logs` (endpoint, status, număr de elemente, cine a citit), wrapper `withFeedAuth`.
- **Selecția pe portal**: `portal_publications` (`organization_id`, `property_id`, `portal_key`, `enabled`) — exact ce folosește iMove.
- **Eligibilitate**: `FEED_PUBLIC_STATUSES`, `isPropertyFeedEligible`, `feedImageUrl`, `offerUrl`, `publicCoords` din `src/lib/site-feed/mapper.ts` și `src/lib/geo.ts`.
- **URL-uri canonice**: `feedUrlsForRequest` din `src/lib/site-feed/config.ts` (media pe `crm.habitoo.ro`, oferta pe `habitoo.ro`).
- **Locuri de publicare**: `ensurePortalSlotAvailable` din `src/lib/portals/slots.server.ts`, apelat deja de `setPortalSelection` / salvarea în masă din `src/lib/portals.functions.ts`.
- **Registry**: `src/lib/portals/registry.ts` cu `feed_pull` și indicatorul `feedOnly` (feed_pull fără publish_listing) folosit deja în UI.

## 2. Ce se adaugă

### Registry
Portal `properstar`: `status: "available"`, direcție `habitoo_to_portal`, autentificare `habitoo_api_key`, capabilități `["feed_pull"]` (deci `feedOnly` în UI). Fără adaptor în `adapters/index.server.ts` → nicio publicare/retragere push. Selecția consumă un loc de publicare pe calea existentă.

### Endpoint
`GET /api/public/feed/properstar/{agencyKey}.xml` — fișier rută `src/routes/api/public/feed/properstar/$agencyKey[.]xml.ts`.
`agencyKey` este cheia emisă de Habitoo pentru portalul `properstar` (`portal_api_keys`), pusă în cale pentru că Properstar consumă un simplu URL. Autentificarea folosește exact aceeași funcție ca restul feedurilor; adaug în `authenticateFeedRequest` o opțiune `explicitToken` (cheia din cale) — nicio altă schemă. Agenția rezultă exclusiv din cheie. Cheie greșită/revocată → 401; prea multe cereri → 429; fiecare citire este logată în `site_feed_access_logs`.

### Generator XML (`src/lib/portals/properstar/`)
- `mapper.ts` — pur, fără DB: `mapPropertyToProperstar` + `buildProperstarXml`, cu toate nodurile cerute (`Adverts/Advert`, AdvertId, Reference, OriginalUrl, AdvertType Sale/Rent, SubType, PublicationDate, Rooms, Bedrooms, Bathrooms, LivingArea/LandArea, Titles/Title[@Language], Descriptions/Description[@Language], Photos/Photo, Price, PriceCurrency, ShowPrice, Address, PostalCode, City, State, Country="RO", ShowAddress, Geolocation, Floor, ConstructionYear, Amenities, Videos, VirtualTours, Status, Contact complet).
- `feed.server.ts` — citirea din DB (doar ofertele selectate pentru `properstar`, doar agenția din cheie), cache în memorie 5 minute per agenție, plafon 2000 adverts pe răspuns.
- Text liber: CDATA, HTML curățat la `ul ol li b strong i em p br`, o singură limbă `ro` (structura rămâne multi-limbă), fără traduceri generate.
- Foto: URL https absolut prin endpointul public de media, cu `?date=zz/ll/aaaa` din `updated_at`-ul imaginii.
- Adresă: `ShowAddress` urmează `location_precise`; ascuns → oraș + cod poștal, fără stradă; coordonatele rămân cele publicabile (`publicCoords`).
- Telefoane normalizate `+40…`; emailul agentului este cel real al agentului responsabil.

### Câmpuri obligatorii (gardă)
AdvertId, AdvertType, SubType, cel puțin o descriere cu limbă, Country, PostalCode, City, PriceCurrency, identificatorii de birou și de agent. O ofertă fără ele este EXCLUSĂ din feed (niciodată noduri obligatorii goale) și apare în raportul „De completat pentru Properstar", cu numele câmpurilor lipsă.

### Cod poștal (lipsește azi în date)
Nu există câmp de cod poștal nici pe proprietate, nici pe agenție, iar Properstar îl cere. Migrare: `properties.postal_code text`, `organizations.postal_code text` (ambele opționale), plus câmp de completat în editarea proprietății și în setările agenției. Nu inventăm valori: fără cod poștal, oferta apare în raport ca „de completat".

### Retrageri (Status Deleted 7 zile)
Migrare: `portal_publications.withdrawn_at timestamptz`, setat la `now()` de căile existente când selecția trece pe `enabled = false` (selecție individuală, salvare în masă, worker-ul de retragere la reducerea locurilor) și readus la `null` la reselectare. Feedul include încă 7 zile ofertele retrase sau vândute/închiriate cu `<Status>Deleted</Status>`, apoi dispar; restul sunt `Active`. Pentru vândut/închiriat momentul de referință este `properties.updated_at` (nu există istoric de status în date) — o spun explicit, ca să nu pară mai precis decât este.

### UI
Card nou `ProperstarFeedCard` în Setări → Portaluri (lângă catalogul de portaluri): numărul de oferte din feed, ultima citire a Properstar, URL-ul feedului și lista „De completat pentru Properstar" cu ofertele excluse și câmpurile lipsă. Server function nouă `getProperstarFeedReport` cu `requireActiveOrgAuth`.

## 3. Teste (vitest, comportamentale)
XML-ul respectă structura documentată; o ofertă fără un câmp obligatoriu este exclusă și raportată cu numele câmpului; URL-urile de poze au sufixul `?date=zz/ll/aaaa` din `updated_at`; o ofertă retrasă apare `Deleted` 7 zile și apoi dispare; adresa ascunsă nu conține strada; feedul conține doar ofertele selectate pentru Properstar și doar ale agenției din cheie; cheie greșită → 401; textul e în CDATA și HTML-ul nepermis e curățat. Apoi suita completă, verificarea de tipuri și build-ul.

## 4. Formatul URL-ului raportat la final
`https://crm.habitoo.ro/api/public/feed/properstar/<cheia-agenției>.xml`
