# Raport: impactul erorii `gen_random_bytes` (nimic modificat)

## 1. De când eșuează
- **Prima rulare eșuată:** 23.09.2026, 05:20:00 UTC, la sarcina săptămânală a indicelui de prețuri (`market-price-indices-weekly`). Singura ei rulare din istoric și a eșuat.
- **Coada de poze** (`property-import-images-worker`): 22 de eșecuri între 20:39 și 21:00 pe 23.09. Prima rulare reușită a fost la 21:11, după reparație.
- **Abonamente** (`subscription-enforce-daily`): nicio rulare eșuată între 13.09 și 24.09. Funcția cere codul unic doar când există agenții în perioada de grație, iar lista a fost goală în fiecare zi.
- **Nicio altă sarcină** nu apare în istoric. Colectorul, LaCheie, locurile de portal și promovările nu au rulat niciodată.
- **Migrarea vinovată nu se poate identifica.** Istoricul migrărilor din baza de date se oprește la 11.09 (52 de intrări), iar niciun fișier de migrare din proiect nu conține `cron_nonce_issue`. Sigur e doar atât: funcția folosea `gen_random_bytes` necalificat, `pgcrypto` e instalat în schema `extensions`, iar funcția caută doar în `public`. Acum definiția folosește `extensions.gen_random_bytes(32)`.
- Istoricul sarcinilor începe abia pe 13.09. Ce s-a întâmplat înainte nu se poate verifica.

## 2. Cozile care depind de codul unic
| Coadă | Neprocesate | Mai vechi de 23.09 05:20 |
|---|---|---|
| `promotion_withdraw_jobs` | 0 (tabel gol) | 0 |
| `portal_slot_withdraw_jobs` | 0 (tabel gol) | 0 |
| `lacheie_resend_jobs` | 1 job `queued`, 5 oferte `queued` | 1 / 5 |
| Colector OLX | 1 sursă, dezactivată; 0 rulări | – |

Exemplu blocat: retrimitere LaCheie `ad9f95e6…`, agenția `04041622…` (cea de test, cu HB-1009), creată pe 18.09 la 04:45. Are 5 oferte, 0 trimise, nu a pornit niciodată și nu are nicio eroare.

**Acest job nu a fost blocat de `gen_random_bytes`.** Sarcina `lacheie-resend-worker` nu apare deloc în istoric. Nu a fost programată niciodată, deci nu a apucat să ceară codul. Jobul pare creat fără să fi fost armat worker-ul, sau înainte să existe armarea. Cauza exactă trebuie confirmată.

## 3. Promovări și locuri de portal
- `promotion_allocations`: 0 rânduri. `portal_slot_allocations` și `portal_slot_limits`: 0 rânduri.
- Nu există nicio promovare care trebuia încheiată și nici vreun loc de portal care trebuia eliberat. Nicio agenție nu a avut perioadă de grație, deci nici emailuri de abonament neexpediate.

## 4. Indicele săptămânal de prețuri
- Ultima sincronizare reușită: 18.09 (207 serii, toate neschimbate). A treia rulare de atunci a fost „sărită” pentru că nu apăruse nimic nou.
- Sincronizarea este idempotentă: dacă trimestrul e deja stocat, nu scrie nimic în serii și adaugă doar un rând de jurnal în `market_import_runs`.
- **Rularea manuală e sigură.** Nu există totuși nicio urgență: datele de pe 18.09 sunt la zi, iar Eurostat publică trimestrial. **Recomandare: așteptăm rularea programată de miercuri, 30.09, la 05:20.** Ea confirmă și reparația, fără nicio intervenție.

## Elemente rămase blocate
1. **Retrimiterea LaCheie `ad9f95e6…` (5 oferte, din 18.09).** Nu e legată de eroarea reparată. Ce trebuie făcut, după aprobarea ta:
   - verific de ce worker-ul nu a fost armat;
   - apoi fie îl armez, ca jobul să ruleze, fie anulez jobul, dacă retrimiterea nu mai e dorită (e agenția de test).
2. **Confirmarea indicelui de prețuri.** Verific rularea de miercuri, 30.09, 05:20.
3. **Nimic altceva.** Promovările, locurile de portal, colectorul, abonamentele și pozele nu au elemente restante.
