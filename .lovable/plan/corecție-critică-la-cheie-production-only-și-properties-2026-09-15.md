# Corecție critică La Cheie: production-only și `/properties`

## Obiectiv
Elimin complet configurația istorică de test pentru La Cheie, aliniez toate operațiile la API-ul production documentat și verific traseul real de publicare până în aplicația servită.

## Modificări
1. **Registru și configurare**
   - Simplific definiția La Cheie la cheia API, capabilitățile existente și unicul mediu Production.
   - Elimin câmpurile editabile pentru URL test/producție, activarea producției și calea ofertelor.
   - Fixez server-side baza `https://api.lacheie.ro/api/partners/v1` și calea `/properties`.
   - Normalizez setările vechi din baza de date: valorile `lacheie_environment`, `lacheie_test_base_url` și `lacheie_production_active` sunt ignorate.

2. **Conexiune și publicare**
   - Păstrez testarea conexiunii strict read-only prin `GET /account` în Production.
   - Urmăresc și corectez traseul proprietate → selecție portaluri → execuție → adaptor, astfel încât niciun guard La Cheie să nu solicite un mediu sau URL de test.
   - Schimb operațiile la `POST /properties`, `PUT /properties/{external_id}` și `DELETE /properties/{external_id}`.
   - Păstrez `allow_live` exclusiv ca protecție generică pentru scrieri, fără semnificație de mediu.
   - Păstrez payload-ul strict, versionarea, serializarea, retry/reconcile, catalogul și limitele existente.

3. **Interfață și regresii**
   - Elimin orice câmp sau text La Cheie care sugerează un mediu TEST ori un endpoint editabil.
   - Păstrez raportarea explicită a eșecurilor/parțialelor la publicare.
   - Nu modific alte integrări.

4. **Teste și verificare livrare**
   - Adaug teste pentru normalizarea setărilor vechi, absența mesajului vechi, registry production-only, `GET /account` și metodele exacte pe `/properties`.
   - Rulez toate testele, verificarea tipurilor și build-ul.
   - Verific preview-ul după build și caut din nou stringurile vechi în întregul repository.
   - Verific dacă domeniul public folosește aceeași versiune; dacă necesită actualizarea publicării, o fac și confirm separat preview-ul și producția.

## Detalii tehnice
- Nu se adaugă migrare: compatibilitatea cu rândurile vechi este realizată prin normalizare la citire.
- Nu se execută operații reale de creare/modificare/retragere în timpul testelor sau la încărcarea paginii.
- Endpointurile read-only pentru catalog rămân `/options`, `/counties` și `/cities?county_id=...`.
