# Investigație Romimo: anunțuri invizibile și promovare (doar citire)

Nu se publică, actualizează, retrage sau repostează nimic. Către Romimo se fac doar GET-uri. Cheile, tokenurile și parolele nu apar nicăieri; emailul contului e mascat.

## Pași

1. **Conexiunea „Imobiliare Bucuresti”**: se citește din baza de date conexiunea Romimo a organizației (ApiKey decriptat doar în memorie, emailul contului). Un script temporar în /tmp folosește clientul existent (`getToken`, host allowlist, timeout).
2. **`GET /api/Article`** pentru HB-1087, HB-1063, HB-1085, HB-1066 (după `externalid` salvat în `portal_listings`). Raportez răspunsul complet redactat: status, activ, promovat, url romimo/publi24, valabilitate, motivul respingerii. Compar cu `public_url`/`portal_offers` salvate.
3. **`GET /api/User/Package`** și **`GET /api/User/CompanyPackage`**: pachet, valabilitate, număr anunțuri și promovări incluse/folosite.
4. **Reconstrucție mapper pentru HB-1063** (fără trimitere): rulez `loadRomimoMapperInput` + `mapPropertyToRomimo` cu `promoted` salvat și afișez `ad.active`, `ad.promoted`, `validFrom`, `validTo`. Compar cu corpul/răspunsul din `portal_operation_logs` de la ultima actualizare.
5. **Linkul public HB-1087**: un singur GET pe pagina publi24 ca să confirm ce se afișează (redirect la categorie sau nu).

## Concluzie livrată
- Anunțurile sunt active pe Romimo/Publi24? (din GET Article)
- Promovarea e aplicată?
- Cauza probabilă, doar dacă datele o susțin: pachet expirat/epuizat, `validTo` depășit sau trimis greșit, `active=false`, respingere de moderare, sau alt motiv. Dacă datele nu arată cauza, o spun explicit.

## Tehnic
- Nimic nu se modifică în cod sau baza de date; scriptul temporar stă în /tmp și e șters după.
- Dacă `GET /api/Article` sau `CompanyPackage` nu există în API-ul oficial, raportez răspunsul (404/405) fără alte încercări.
