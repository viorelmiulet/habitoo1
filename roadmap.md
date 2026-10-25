# Anunțuri particulari — afișare pe rânduri, paginare și sortare

# Anunțuri particulari — zona de filtre după modelul Imobiliare.ro PRO

- [x] Taburi Apartamente / Case/Vile / Comerciale / Terenuri / Toate (înlocuiesc filtrul Tip proprietate; `tip` vechi încă acceptat)
- [x] Rând restrâns: Tranzacție, Județ, Zile în piață (după first_seen_at, ziua României), Preț de la–până la, Mai multe, Căutare
- [x] „Mai multe”: Localitate, Zonă, Sursă, ID anunț, Camere multiplu, Suprafață, Etaj (Parter = 0, coloană generată floor_num), An construcție cu bifa „Include an nespecificat”, Cuvinte cheie; „+N filtre” când e închisă
- [x] Filtrele se aplică la Căutare/Enter, rămân în URL, linkurile vechi (oras/zona/sursa) funcționează
- [x] Bara de rezultate: N rezultate · X anunțuri noi (clic = filtru De azi) · sortare
- [x] 15 teste pure + 15 teste handler (taburi, De azi, linkuri vechi, etaj, an, ID, intercalare neschimbată); build OK
- [ ] Verificare vizuală în cont — blocată: solicitantul nu are un cont asociat pentru sesiunea de test

# Anunțuri particulari — first_seen_at și surse intercalate

- [x] Coloană first_seen_at: momentul importului la insert, neschimbat la reimport; cele 1613 anunțuri existente preiau scraped_at
- [x] „Cele mai noi” sortează după ziua first_seen_at, cu sursele intercalate în zi (Storia, Romimo, OLX, Imoradar24); total și paginare corecte cu toate filtrele și căutarea
- [x] „Adăugat …” pe card și în pagina anunțului arată first_seen_at
- [x] 18 teste noi/actualizate (intercalare, pagini, filtru sursă, căutare); build OK
- [ ] Verificare vizuală în cont — blocată: solicitantul nu are un cont asociat pentru sesiunea de test

# hbsync — sursa Imoradar24

- [x] Acceptare imoradar în ambele importuri, cu sursele existente păstrate
- [x] Filtru și etichete Imoradar24; linkuri externe păstrate integral
- [x] 61 teste importuri, filtrare și compatibilitate; regula surselor verificată în date; build OK
- [ ] Verificare vizuală în cont — blocată: solicitantul nu are un cont asociat pentru sesiunea de test

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

# ACP — ofertele de piață intră în comparabile

- [x] Tipuri echivalente: apartment/studio/penthouse/duplex → apartament, house/villa → casă, land → teren, commercial → spațiu comercial, office → birou
- [x] „București Sector N" / „Bucureşti Sectorul N" / „Sector N" = București + Sector N
- [x] Cartierul nu mai elimină oferte (doar crește scorul); sub 8 oferte în sector → extindere la tot orașul
- [x] Aceleași reguli în blocul „Piața" din analiză
- [x] Teste: HB-1171 / HB-1260 / HB-1261 au comparabile din piață; build OK
