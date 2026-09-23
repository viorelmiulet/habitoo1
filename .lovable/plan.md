# Raport: pozele din importul IMMOFLUX nu s-au descărcat

Nimic nu a fost modificat. Mai jos: ce am găsit, apoi reparația propusă (se aplică doar după aprobare).

## Constatări

1. **Ultimul job** (`2c0632d5…`, creat 23.09 20:38:17): `processing`, `images_total = 354`, `images_done = 0`, `images_failed = 0`.
2. **Coada de poze:** toate cele 354 de rânduri sunt `pending`, cu `attempts = 0`. Nu există niciun `last_error`, deci nicio poză nu a fost încercată.
3. **Sarcina automată** `property-import-images-worker` există, rulează în fiecare minut și este activă (`select public.property_import_images_tick()`). Toate rulările, de la 20:39 până acum, au **eșuat** cu:
   `ERROR: function gen_random_bytes(integer) does not exist — encode(gen_random_bytes(32), 'hex')`. Nu există nicio rulare reușită.
4. **Apeluri HTTP:** `net._http_response` e gol. Worker-ul nu a fost apelat niciodată, pentru că eroarea apare înainte de trimiterea cererii.
5. **Versiunea publicată:** `crm.habitoo.ro/api/public/cron/property-import-images` răspunde `401` (există și cere autentificare), nu `404`. Ruta e publicată, deci nu ea e problema.
6. **`property_images` cu `source_url`:** 0 rânduri. Nu s-a salvat nimic, deci nu e o problemă de afișare.

## Concluzie

Pozele **nu s-au procesat deloc**. Sarcina care pornește descărcarea eșuează la fiecare minut, înainte să apeleze worker-ul. Ea generează un cod de unică folosință prin `cron_nonce_issue()`, iar funcția aceea folosește `gen_random_bytes`. Funcția există doar în schema `extensions`, dar `cron_nonce_issue` caută numai în `public`, așa că nu o găsește. Sursa pozelor, ruta și logica worker-ului nu au fost niciodată atinse.

## Reparația propusă

- O migrare nouă care redefinește `cron_nonce_issue()` cu `extensions.gen_random_bytes(32)`, sau cu `search_path = public, extensions`. Comportamentul rămâne același.
- După aplicare: verific că următoarea rulare apare `succeeded`, că în `net._http_response` apare un `200` și că `images_done` crește pentru jobul existent. Cele 354 de poze sunt încă în coadă, deci se descarcă fără reimport.
- Verific dacă alte funcții programate folosesc `cron_nonce_issue()` și, dacă da, confirm că merg și ele după reparație.
