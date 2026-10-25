# Anunțuri particulari — afișare pe rânduri, paginare și sortare

# hbsync — sursa Imoradar24

- [ ] Acceptare imoradar în ambele importuri, cu sursele existente păstrate
- [ ] Filtru și etichete Imoradar24; linkuri externe păstrate integral
- [ ] Teste importuri, filtrare și compatibilitate; verificare disponibilă

- [x] Rânduri orizontale (poză stânga, detalii, acțiuni dreapta) în locul grilei de carduri
- [x] 24 de anunțuri pe pagină (în loc de 9)
- [x] Paginare numerotată cu prima/ultima pagină și paginile din jurul celei curente
- [x] Sortare: cele mai noi, preț crescător/descrescător, suprafață descrescătoare
- [x] Teste rulate (11 trec) și build verificat fără erori

# hbsync — blocări scurte și așteptare

- [x] Expirare 120 secunde doar pentru hbsync partial
- [x] Reîncercare la fiecare 2 secunde, maximum 20 secunde
- [x] Teste: blocare abandonată, cereri simultane, refuz după 20 secunde (22 teste trec)

# Anunțuri particulari — localizare

- [x] Normalizare la import și corectarea celor 1394 de anunțuri existente
- [x] Filtre Județ → Localitate → Zonă cu număr de anunțuri și linkuri vechi păstrate
- [x] 17 teste și 6 verificări SQL; Sector 1 = 184, Titan = 49; build OK
- [ ] Verificarea filtrelor în cont — blocată: nu există cont asociat solicitantului pentru sesiunea de test

# Anunțuri particulari — fără telefoane

- [x] Ignorarea telefoanelor la import și eliminarea din răspunsuri/listă/detaliu
- [x] Ștergerea celor 231 telefoane existente fără schimbarea descrierilor
- [x] 27 teste trec; verificat 0 telefoane salvate din 1394 anunțuri; build OK
- [ ] Verificare vizuală în cont — blocată: solicitantul nu are un cont asociat pentru sesiunea de test
