# Repararea legării mesajelor Storia

## Rezultat
- Folosim un singur identificator de legare pentru Storia: slugul alfanumeric din URL, stocat ca `ADSLUG:<slug>`.
- `data.ad_id` din notificările de mesaje este tratat ca slug, fără filtrare numerică.
- Păstrăm temporar citirea vechiului segment `AD:` doar pentru compatibilitate cu eventuale date istorice, dar nu mai scriem valori noi în el.
- Completăm slugul pentru anunțurile Storia care au URL public și nu au `ADSLUG:`.
- Reprocesăm evenimentele Storia nefinalizate, inclusiv mesajul real, fără a duplica efectele deja create.

## Verificări
- Confirmăm că mesajul este legat de proprietatea `RF-1001`.
- Confirmăm lead-ul cu sursa „Storia.ro” și agentul responsabil al proprietății.
- Verificăm starea celor 10 evenimente de publicare și a mesajului după reprocesare.
- Rulăm typecheck, testele și verificarea buildului, apoi publicăm.

## Detalii tehnice
- Actualizăm parserul, potrivirea și testele unitare pentru payloadul real `data.ad_id: "IwcT"`.
- Backfillul și reprocesarea rulează controlat pe datele existente după ce noul cod este disponibil.
- Nu schimbăm schema bazei de date și nu atingem date personale în raportare.
