# Imobiliare.ro — Doar imoradar24

- [x] Alegere pe card, păstrare în coada existentă, mod cerut separat de cel confirmat, schimbări de mod și retragere ambele draft
- [x] Bonus și Doar imoradar24 fără verificare locală de disponibilitate; răspuns exact pe card și în jurnal; 183 teste fără publicări reale
- [x] Card izolat verificat pe calculator și telefon: mod exclusiv cu promovări dezactivate, Bonus selectabil fără locuri; aplicația fără erori
- [ ] Test real după Publish — utilizatorul îl rulează explicit; verificarea în cont nu este disponibilă fără conectare în previzualizare

# Integrare hbsync

- [x] Filtru sursă Storia / OLX / Romimo din registru și vechime min/max în ACP și statistici; durata de la prima observare afișată pe card, nu trafic sau vânzare confirmată; 63 teste trec, aplicație fără erori; verificarea în cont rămâne blocată de lipsa sesiunii solicitantului

- [x] Filtre ACP canonice București / Sector 3 / Titan în listă și statistici, compatibilitate localități vechi, sursa Portaluri disponibilă și particulari/agenții etichetați; 85 teste trec, aplicație fără erori; verificarea în cont rămâne blocată de lipsa sesiunii solicitantului

- [x] Publicare solicitată la 24 octombrie; URL public HTTP 200; batch real de 10 oferte Storia trimis la endpointul public ACP: created=10, reimport unchanged=10, fără duplicate; toate citite înapoi active cu proveniență hbsync
- [x] Endpoint PUSH separat pentru ACP, particulari și agenții, mapare canonică, clasificare necunoscută NULL și idempotență; 74 teste și import Storia real repetat HTTP 200
- [ ] Import periodic hbsync către noul endpoint — blocat: exportul extern hbsync trebuie configurat cu toate ofertele, nu numai particulari; PULL pe HTTP necriptat nu activat
- [ ] Verificare vizuală ACP cu datele hbsync — blocat: solicitantul nu are sesiune disponibilă și autentificarea --self nu găsește cont; necesară conectarea în previzualizare

- [ ] Activare colectare OLX în hbsync și verificare import cu sursa reală — blocat: codul/configurația și accesul de administrare hbsync nu sunt disponibile; importatorul Habitoo acceptă deja OLX
- [x] Documentație livrată cu 129 coloane properties și 19 contacts verificate live, relații, mapare și contract propuse (explicit neimplementate), permisiuni și colectori
- [x] Modul „Anunțuri particulari” în aplicație (oraș, zonă, camere, cuvinte cheie), acces doar conectat, import prin endpointul existent cu oraș/zonă
- [x] Import batch hbsync: câmpuri noi (cartier, etaje, an, mobilat etc.), imagini oglindite în storage privat cu URL stabil, perioada ca prefix în descriere, retenție 60 zile cu job zilnic, upsert idempotent; verificat live cu anunț trimis de două ori
- [ ] Cheia de import SCRAPER_SECRET de transmis către hbsync (setată de utilizator)

# Narațiune video AI

- [x] Funcție separată implicit oprită, MiniMax 2.8 Turbo cu română, text limitat și selector feminin/masculin
- [x] Audio privat legat de proprietate, limită atomică 20/zi (Europe/Bucharest), tracking AI și semnare cu accesul utilizatorului
- [x] 23 teste noi/video și 27 teste de regresie; previzualizare audio, mix și piste audio MP4 prin ambele randări verificate cu date simulate, calculator/telefon
- [ ] Test scurt MiniMax pentru alegerea finală a vocilor — Replicate răspunde 402, fără credit; necesară alimentarea contului
- [ ] Verificare completă autentificată cu generare reală și acces între agenții — lipsă credit Replicate și sesiune a solicitantului; conectare în previzualizare necesară

# Agent responsabil în editare și actualizare portaluri

- [x] Câmp editabil doar pentru administratori, utilizatori activi, salvare independentă de blocajul mutării
- [x] Mutare individuală/în bloc prin nucleul existent, actualizări durabile doar pentru perechi active; cererile concurente nu se pierd
- [x] Teste mock și formular verificat desktop/mobil: schimbare contact, blocaj cu păstrarea modificărilor, agent fără selector; fără publicări reale
- [ ] Verificare în contul solicitantului — sesiunea automată nu identifică un cont; necesară conectarea în previzualizare

# Promovări pe cardul Imobiliare.ro

- [x] Publicare online și toate promovările bifate într-un singur POST, validări existente înainte, confirmare per serviciu și mesaj Bonus pentru locuri standard ocupate; teste fără publicări reale
- [x] Opțiuni pe card, contoare live, alocări și diferențe la salvare
- [x] Selecții durabile în coadă; promovări împreună cu online conform secțiunii 18; refuzurile per serviciu nu anulează publicarea
- [x] 183 teste mock; card desktop/mobil verificat vizual fără publicări reale
- [ ] Verificare în fișa contului solicitantului — sesiunea automată nu identifică un cont; necesară conectarea în previzualizare

# Imobiliare.ro — comision și etaj

- [x] Comision numeric; text ambiguu omis cu avertisment
- [x] Etaj verificat înainte de apeluri; case/vile fără blocare; mansardă fără valoare inventată (valoarea API v3 neconfirmată, mesaj explicit)
- [x] 109 teste fără apeluri sau republicări reale; compilare reușită

# Pagina publică /integrari

- [x] Ilustrație HTML/CSS, carduri unite și grupate, etichete din registru
- [x] ItemList, data sitemap și 31 teste pentru unicitate, linkuri și capabilități
- [x] Verificare desktop, telefon, tabletă și reducerea mișcării; 14 legături existente, imagini încărcate, fără erori sau modificarea detaliilor

# Cereri abonament

- [x] Email automat la cerere nouă către adresa operațională Habitoo, confirmare/conținut în cerere; 11 teste fără trimiteri reale și verificare locală a detaliilor expandabile
- [x] Alegere plan pentru administratorul agenției, benzi și acces când contul este suspendat
- [x] Cereri unice în așteptare, anulare/schimbare, notificări și rezolvare tranzacțională cu activarea existentă
- [x] SuperAdmin: listă, activare cu date editabile și respingere cu motiv
- [x] 19 teste automate, reguli tranzacționale cu rollback și dialoguri desktop/mobil fără emailuri sau activări păstrate
- [ ] Verificare completă în contul solicitantului — conectarea în previzualizare este necesară; sesiunea automată nu găsește contul

# Facebook Reel

- [x] Opțiune Reel, validare MP4 vertical 9:16 și 3–90 secunde, preselectare și creare verticală
- [x] Flux start/upload/finish, verificare status durabilă, istoric și piesă muzicală
- [x] 46 teste mock/metadate MP4 și dialog desktop/mobil verificat cu date simulate, fără postare reală
- [ ] Verificare în contul solicitantului — sesiunea automată nu găsește contul; conectarea în previzualizare este necesară

# VDI — agenți legați de cont

- [x] Cont VDI pe legătură, reset automat la schimbarea contului și recuperare agent negăsit o singură dată
- [x] Legăturile MRM 1000/1013 marcate nesincronizate, cont origine 720 păstrat; HB-1170/HB-1174/HB-1175 încă publicate pe 720, fără modificarea anunțurilor sau apeluri VDI
- [x] 59 teste mock trec; reset cont schimbat și păstrare cont identic verificate într-o tranzacție anulată; aplicația fără erori

# Galerie modele Poster

- [x] Șase modele pe toate formatele, toate opțiunile și fotografii publicabile
- [x] Miniaturi mici live cu imagini comune și model salvat cu stilul
- [x] 29 teste, 48 randări plus titluri lungi în browser; capturi Story/Pătrat pentru fiecare model, contrastul Editorial și suprapunerile ștampilei corectate
- [x] Dialog desktop/mobil cu fotografii simulate: alegere, salvare, redeschidere și descărcare PNG, fără erori
- [ ] Verificare în cont real — sesiunea solicitantului nu este disponibilă; nicio postare reală efectuată

# Fișă de proprietate PDF

## Modele PDF A4
- [x] Șase modele și paginare comună fără pierderi
- [x] Miniaturi live, preferință individuală și model implicit în Branding
- [x] 43 teste, 30 cazuri în browser și verificarea vizuală a tuturor paginilor celor șase PDF-uri: Clasic 4/0,88 MB; Elegant 4/0,87 MB; Panoramic 4/0,91 MB; Split 4/0,90 MB; Galerie 5/1,20 MB; Minimal 4/0,86 MB
- [ ] Verificare dialog și salvare Branding în contul solicitantului — conectarea în preview este necesară; sesiunea automată nu a găsit contul

- [x] Redenumire în aplicație și verificarea tuturor textelor
- [x] Descărcare PDF A4 în browser, progres și protecție la apăsări repetate
- [x] Teste și verificarea PDF-ului generat cu date de test: A4, 4 pagini, 1,29 MB, fără tăieri
- [ ] Verificare în cont real și pe telefon fizic — sesiunea solicitantului și dispozitivul nu sunt disponibile

# Structura utilităților, finisajelor și dotărilor

- [x] Panouri cu căutare, Carduri/În linie și selecții existente
- [x] Aceeași structură pentru valorile afișate doar pentru citire
- [x] Teste comportamentale și verificare vizuală cu date locale, fără modificări de date
- [ ] Verificare în fișa unui cont real — sesiunea solicitantului nu poate fi obținută automat

# Email vizual pentru chat

# Lista publică de agenții

- [x] Listare automată a agențiilor eligibile și logo-uri, cu profil opțional
- [x] Teste și publicare; verificare live a celor patru agenții

# Oferte partenere unificate

- [x] Carduri/Listă fără grupare, sortare, filtru Agenție și loturi de 24
- [x] Teste mock și verificare vizuală desktop/mobil
- [ ] Verificare completă Oferte partenere în cont real — lipsă sesiune autorizată; autentificarea automată nu identifică un cont al solicitantului

- [x] Șablon reutilizabil și integrare în notificările de chat, fără schimbarea regulilor de trimitere
- [x] Acces direct la conversație și teste mock
- [x] Previzualizări cu/fără poză și capturi desktop/mobil, fără emailuri reale
- [ ] Verificare acces direct în cont real — blocată de lipsa unei sesiuni autorizate în preview

# Descoperire SEO blog Habitoo

- [x] Sitemap dinamic cu URL-urile publice și articolele publicate
- [x] robots.txt pentru motoare de căutare și AI, cu zonele private blocate
- [x] llms.txt și RSS generate din articolele publicate
- [x] Meta, canonical, RSS și JSON-LD pe blog și articole
- [x] Verificare ciornă → publicat → ciornă și teste automate

# Imagini social media pentru proprietăți

- [x] Generator PNG Story și Postare cu previzualizare live
- [x] Selectare fotografie, tranzacție, logo, telefon și preț
- [x] Preferințe memorate individual în browser
- [x] Verificare vizuală pe trei anunțuri reale și ambele formate

# Răspuns plutitor SuperAdmin Email

- [x] Fereastră nemodală cu minimizare, maximizare, confirmare și atașamente existente
- [x] Teste mock pentru destinatar, păstrarea textului și trimitere unică
- [x] Verificare vizuală desktop și mobil cu conversație simulată, fără emailuri reale

# Promovări Imobiliare.ro (HB-1262)

- [x] `promotion_warnings` = eșec cu textul portalului, bifă nebifată, jurnal success=false
- [x] Stare locală `imobiliare_promotion_states` după scrieri fără avertizări; prioritate portal > local
- [x] Citire stare la deschidere: corpul anunțului + prezența în lista slotului; „Oprește” disponibil la stare necunoscută
- [x] Teste: avertizare → eșec; fără `promotions` → stare salvată; slot list → bifat; oprire trimite doar serviciul
- [ ] Citire live GET /listings/HB-1262 și /promotions/listings/tl — blocat: sesiunea de browser nu poate fi generată fără aprobare

# Filtru „Promovare” în lista Proprietăți

- [x] Promovări integrate sub portaluri, fără filtru separat; selecție multiplă și URL vechi păstrate; 46 teste trec
- [x] Listă verificată izolat pe calculator și telefon, selecție/resetare corecte, fără depășirea lățimii; compilare reușită

- [x] Opțiuni din registru, doar portaluri conectate: servicii Imobiliare.ro gestionabile + flag „Promovat” (Romimo/Publi24)
- [x] Sursa: `imobiliare_promotion_states` (doar pornite) + `portal_publications.promoted`, doar anunțuri publicate
- [x] Selecție multiplă în URL, combinabilă cu celelalte filtre; filtrare pe server (id-uri) + RLS pe interogarea listei
- [x] Etichete „Portal · Serviciu” pe rândurile din listă; pastilă de filtru activ
- [x] 35 teste noi + 58 teste înrudite, build OK
- [ ] Verificare live pe cont real — blocat: sesiunea de browser nu poate fi generată fără aprobare

# Eliminare OferteImobiliare.ro

- [ ] Eliminare integrare, carduri, filtre, logo și pagini publice, fără apeluri externe sau ștergerea istoricului
- [ ] Teste pentru indisponibilitate și verificarea paginilor publice
