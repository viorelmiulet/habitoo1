# SEO public — pasul 1a

## Comisioane — BNR
- [ ] Salvare independentă de BNR, completare tolerantă și zilnică
- [ ] Surse în ordine, parser, diagnostic anual și teste simulate

## SEO pasul 1b
- [x] Rescriere llms.txt, statistici agregate actuale și cache o oră
- [x] 21 teste trec; HTTP 200, 5267 anunțuri / 6 surse și 8056 oferte de piață; răspuns verificat, fără publicare

- [x] Datele firmei și linkuri oficiale în subsol/Contact
- [x] Un singur graph comun cu nodurile paginilor și autor organizație
- [x] Robots public/CRM; 30 teste trec, JSON-LD SSR și pagini reale verificate, subsol desktop/mobil fără depășire

# Anunțuri particulari — import în portofoliu

- [x] Confirmare Da/Nu pe card și detaliu; deschidere directă la Importat
- [x] Creare atomică fără dubluri per agenție, câmpuri și notă internă, poze copiate în ordine
- [x] Teste de acord, copiere foto, câmpuri, notă, dubluri și lipsa publicării; test tranzacțional executat și anulat prin instrumentul de date
- [ ] Verificarea fluxului pe ecran în cont — necesită autentificarea solicitantului în previzualizare (nu există cont asociat pentru sesiunea de test)

# Anunțuri particulari — filtre de localizare (model „Alege zone”)

- [x] Județ și Localitate: liste cu câmp de căutare (diacritice ignorate), numărul de anunțuri lângă fiecare
- [x] Zonă: fereastră „Alege zone” cu căutare, litere A–Z, bifa „Toate zonele”, grupare pe sectoare la București (cartierul stă la sectorul unde apare cel mai des), „Zone selectate” cu X, Anulează/Aplică; butonul arată „N zone”
- [x] Mai multe zone odată (OR pe zone_key/neighborhood_key); `zona` în URL acceptă listă; linkurile vechi cu o singură zonă funcționează
- [x] 37 teste (19 pure + 18 handler): „cl”→Cluj, Sector 6+Titan, litera M→Militari, link vechi, intercalare neschimbată; build OK
- [ ] Verificare vizuală în cont — blocată: solicitantul nu are un cont asociat pentru sesiunea de test

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

# Anunțuri particulari — sursa Anuntul.ro

- [x] Sursa anuntul acceptată la upsert, import piață (ACP), filtru, etichete și amestecarea surselor
- [x] Telefonul se salvează doar pentru anuntul; afișat ca link tel: pe card și în detaliu
- [x] 56 teste trec (upsert cu/fără telefon, import piață, filtru sursă); build OK
- [ ] Verificare vizuală în cont — blocată: solicitantul nu are un cont asociat pentru sesiunea de test

# ACP — caseta „Oferte disponibile în pool-ul de piață" eliminată

- [x] Casetea dispare din pagina „Analiză nouă"; importul de piață, sursele și comparabilele rămân neschimbate
- [x] 434 teste ACP și de piață trec; build OK
- [ ] Verificare în cont — blocată: solicitantul nu are un cont asociat pentru sesiunea de test

# ACP — „Date piață" doar pentru SuperAdmin

- [x] Intrarea „Date piață" din meniu apare doar pentru SuperAdmin; ceilalți utilizatori nu o mai văd
- [x] Ambele pagini (listă și detaliu) sunt închise în SuperadminGate; link direct → redirecționare la /app/acp
- [x] Importul hbsync, sursele și comparabilele ACP rămân neschimbate pentru toți (434 teste ACP/piață + 4 teste noi de acces; build OK)
- [ ] Verificare în cont — blocată: solicitantul nu are un cont asociat pentru sesiunea de test

# Integrare Argus — pasul 1: conectarea

- [x] Tabel `argus_connections` (cheie API criptată, last4, token server-side; RLS fără politici — doar serverul citește)
- [x] Client server: POST /v2.1/auth cu header `Application`, token refolosit, reautentificare doar la 401; 429 → așteaptă și reia o dată; 403 → „Cota lunară Argus a fost depășită"
- [x] Limite locale: /auth max 5/oră; restul 2/s, 60/min, 600/oră pe agenție
- [x] Funcții server fără interfață: filters, search, detail, images, contact, localizare (județe/orașe/zone), taxonomii; fiecare trimite client_ip
- [x] Setări → Integrări → Argus (doar admin): salvare cheie, „Conectat ••••last4", Testează conexiunea, Deconectează
- [x] Anunțurile Argus nu se salvează în baza de date
- [x] 20 teste cu răspunsuri simulate; build OK
- [ ] Secretul ARGUS_APPLICATION_TOKEN — vine mai târziu de la Argus (utilizatorul îl adaugă în Project Settings → Secrets)
- [ ] Pasul 2: interfața de căutare Argus

# Integrare Argus — pasul 2: tabul „Argus" în Anunțuri particulari

- [x] Tab „Argus" lângă lista actuală; agenții fără Argus conectat văd mesajul cu link spre Setări → Integrări
- [x] Filtre traduse în parametri Argus: județ/localitate/zone (localizare Argus), tranzacție, tip, camere, preț, suprafață; implicit listed_by = Proprietar, cu opțiunea „Toți"
- [x] Rezultate live în carduri ca în tabul principal (poză, titlu, preț, camere, suprafață, oraș/zonă, sursa last_source_name, dată, eticheta „Argus"); paginare cu page
- [x] Detaliu la click: descriere, toate pozele, detalii, hartă (position), „Anunțul original" (last_site_link)
- [x] Telefon doar la „Arată telefon" (/properties/contact)
- [x] Cache 5 minute pentru aceeași căutare
- [x] Fără salvare în DB; restul paginii neschimbat
- [x] Teste cu răspunsuri simulate
- [x] Comisioane pas 1: înregistrare + acces (fără rapoarte/export)

# Comisioane — pasul 3
- [x] Afișare EUR/RON pe baza cursului păstrat, inclusiv pentru comisioane EUR
- [x] Excel/CSV cu toate rândurile filtrate, coloane și totaluri
- [x] PDF cu perioadă, comparații, grafice și tabel pentru admin
- [x] Teste automate, formule Excel recalculate fără erori și verificare vizuală PDF lună/custom fără suprapuneri
- [ ] Verificarea descărcărilor în cont — solicitantul nu are cont asociat pentru sesiunea de test; necesită autentificarea în previzualizare
