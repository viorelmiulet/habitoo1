# HomePitch.ro — feed dedicat (pull) + import instant (push)

Acest document descrie EXCLUSIV integrarea HomePitch. Feedul IMMOFLUX-compatibil
(`/api/public/portal/v1/*`, folosit de ClickImob și iMove) rămâne neschimbat.

## 1. Model

- **PULL (principal)** — HomePitch citește endpointurile Habitoo cu o cheie API
  **emisă de Habitoo** (Superadmin → Portaluri → HomePitch → emite cheie).
  Cheia este **agency-wide**: acoperă toți agenții organizației.
  Agentul o introduce în HomePitch la `/setari-crm`.
- **PUSH (opțional)** — la bifarea/actualizarea unei oferte, Habitoo notifică
  HomePitch să o importe imediat.
- **Webhook de status** — neimplementat; nu trimitem `callback_url`.

## 2. Autentificare

Cheia se acceptă în oricare din cele trei forme (HomePitch alege):

```
Authorization: <KEY>        # fără „Bearer”
X-Api-Key: <KEY>
?api_key=<KEY>
```

Scope-uri necesare: `feed:read` pentru proprietăți, `agents:read` pentru `/agents/me`
(ambele sunt implicite la emiterea cheii).

## 3. Endpointuri

Bază: `https://crm.habitoo.ro/api/public/homepitch/v1`

| Endpoint | Descriere |
| --- | --- |
| `GET /properties?limit=100&offset=0` | Listă paginată. Suportă `updated_since=ISO8601` (sincronizare incrementală) și `is_active=true`. |
| `GET /properties/{id}` | O ofertă completă. `422` cu `reasons[]` dacă oferta este exclusă din feed. |
| `GET /agents/me` | `{ email, first_name, last_name, phone, agency_name }` al agenției cheii. |

Răspunsul de listă:

```json
{ "api_version": "habitoo-homepitch/1.0", "total": 42, "limit": 100, "offset": 0, "properties": [ ... ] }
```

## 4. Schema unei proprietăți

Nume de câmpuri exact cele cerute de HomePitch:

`external_id`, `title` (max 200), `description`, `property_type`,
`transaction_type`, `price` (EUR), `city_name`, `zone_name`, `street`,
`lat`, `lng`, `rooms`, `bedrooms`, `bathrooms`, `surface_usable`,
`surface_built`, `surface_total`, `surface_land`, `floor` (număr sau `"P"`/`"D"`/`"M"`),
`building_floors`, `year_built`, `images[]` (URL absolut HTTPS, max 40),
`video_link`, `virtual_tour_link`, `tags[]`, `collab_commission_percent`,
`date_added`, `date_updated`, `agent { email, first_name, last_name, phone }`.

`video_link` și `virtual_tour_link` sunt `null`: Habitoo nu are încă aceste câmpuri.
`collab_commission_percent` se completează doar când oferta e marcată pentru
colaborare și textul comisionului conține explicit un procent.

## 5. Mapare `property_type`

| Habitoo | HomePitch |
| --- | --- |
| `apartment`, `studio` | `apartament` |
| `house` (casă / vilă) | `casa` |
| `office` | `birou` |
| `commercial` | `spatiu_comercial` |
| `land` | `teren` |
| `industrial` | `spatiu_industrial` |

## 6. Tranzacție dublă

O proprietate cu vânzare **și** închiriere active se expune **o singură dată**,
cu `transaction_type: "vanzare"` și prețul de vânzare; disponibilitatea pentru
închiriere (preț + monedă) se adaugă la finalul descrierii.

## 7. Reguli de excludere

O ofertă NU intră în feed și NU se împinge dacă îi lipsește oricare dintre:

- coordonate reale `lat` + `lng` (nu trimitem niciodată 0/0);
- agent asignat cu email valid (cheia de match la HomePitch);
- titlu, descriere;
- preț pozitiv **în EUR** (ofertele în RON sau altă monedă sunt excluse);
- tip de proprietate mapabil la cele 6 valori.

Motivul exact apare în diagnosticarea ofertei și în `422` pe `/properties/{id}`.
Descrierile sub 300 de caractere generează doar un avertisment.

## 8. Tag-uri

Mapate din dotările existente, doar unde corespondența e clară:
`aer-conditionat`, `centrala-proprie`, `lift`, `parcare`, `balcon`, `terasa`,
`gradina`, `piscina`, `boxa`, `mobilat`, `utilat`, `pet-friendly`.

## 9. Push punctual

```
POST https://bwfexvoapabfvkmmnxkg.supabase.co/functions/v1/crm-push-property
apikey: <HOMEPITCH_PUBLIC_ANON_KEY>
{ "provider": "custom", "external_id": "<id ofertă Habitoo>", "inline_api_key": "<cheia Habitoo a agenției>" }
```

- `HOMEPITCH_PUBLIC_ANON_KEY` este cheia publică a proiectului HomePitch și
  **trebuie completată în Project Settings → Secrets**. Fără ea, push-ul se
  dezactivează automat și publicarea rămâne prin feed.
- `inline_api_key` este cheia Habitoo salvată în conexiunea portalului
  (câmpul opțional din Superadmin → Portaluri).
- Coduri tratate: `200` (cu `property_url`), `402` limită de plan, `403` agent
  necunoscut, `404` ofertă negăsită, `422` payload invalid (`details`).
