# SEO public — pasul 1a

## Contacte — sursă și consimțământ
- [x] Formular comun adăugare/editare, sursă automată, filtre, istoric acord/retragere și ghid actualizat
- [x] 7 teste reguli + 26 teste ghid trec; contact real de test creat, filtre sursă/acord verificate, editat cu sursă proprie, retras cu istoric păstrat pe desktop/telefon, apoi șters; 0 contacte de test rămase. Build OK. Portalurile/MAP creează în prezent lead-uri/proprietăți, nu contacte; la asocierea unui lead sursa lipsă este completată fără acord implicit.

## Ghiduri interactive — etapa 5
- [x] Completare 8 ghiduri Management; 50 implementate, fără planificate. Progres distinct per rol/AI: agent 38–44, admin 44–50
- [x] 67 teste trec pentru agent/admin și desktop/telefon; cele 8 ghiduri parcurse în contul admin pe ambele dimensiuni, fără erori și fără acțiuni de salvare/trimitere/ștergere; 101 proprietăți, 6 profiluri, 0 comisioane, 0 obiective, 1 cerere neschimbate
- [ ] Parcurgere în cont agent real: autorizarea sesiunii agentului existent nu este disponibilă; verificat prin teste motor agent/admin, fără schimbarea rolurilor sau crearea de conturi
- [x] Inventar final și 6 capturi Comisioane, Setări profil/agenție și Integrări în Files; colecția creată, sincronizarea membrilor pending

## Ghiduri interactive — etapa 4
- [x] Eliminare inventar SuperAdmin și completare 13 ghiduri MAP/import/ACP/AI/chat/bara de sus
- [x] 53 teste trec; toate cele 13 ghiduri parcurse desktop/telefon, fără generări/salvări/importuri/trimiteri; numerele proprietăților, ACP, comentariilor, chatului și consumului AI neschimbate; build OK
- [x] Inventar actualizat: 42 disponibile + 7 planificate și capturi ghiduri 1, 6, 9 desktop/telefon în Files

## Trimite unui colaborator — ofertă neutră
- [x] Cod aleator revocabil, pagină și fotografii originale fără watermark aplicat, metadate foto eliminate; noindex, fără identitate/ID-uri/adresă exactă/comision în DTO/HTML și previzualizare neutră
- [x] Dialog cu căutare trei agenți parteneri verificată, destinatar manual/canale/mesaj editabil, generare și dezactivare; butoane în detaliu/listă și activitate recitită în istoricul proprietății
- [x] 21 teste trec; fără cont desktop/telefon: 16 poze cu +10, vizualizator, HTML/head fără agenție/agent, fără JSON-LD, codul nu deschide /oferta; dezactivare manuală și media 404. WhatsApp interceptat, email simulat; nicio trimitere reală. Build OK
- [ ] Verificare vizuală pe proprietate inactivă: contul disponibil nu are proprietăți inactive; blocarea server/UI și revocarea ireversibilă la schimbarea statusului verificate izolat.

## Trimite oferta către client
- [x] Buton pe pagina proprietății și meniul listei, dialog mobil complet cu client/canale/mesaj
- [x] Eligibilitate activă/publicată și client din aceeași agenție pe server; email prin sendEmail existent, cheie stabilă, activitate/audit atomic; WhatsApp/SMS numai după confirmarea agentului
- [x] 27 teste trec (email simulat, eșec fără activitate, idempotență, SQL legături contact/lead/proprietate). Desktop/telefon: activ/inactiv, mesaj și URL WhatsApp interceptat; un link copiat real, activitate recitită în istoricul proprietății și legată la lead/agent. Fără emailuri sau mesaje reale; fără contacte în cont.

## Localități și zone multiple
- [x] Selector comun cu numere și listă pe tot ecranul pe telefon: MAP Habitoo/Facebook, Proprietăți și Oferte partenere
- [x] Filtrare OR parametrizată cu acces existent, totaluri exacte, URL și stare salvată, linkuri vechi inclusiv Sector 6
- [x] MAP desktop/telefon: Militari + Chiajna 111, plus Ilfov 520, fără alte zone; ștergere Militari 465, întoarcere păstrată. Proprietăți: Militari 88, ștergere/revenire corecte; Facebook și Colaborare aplică selecții. Eroare izolată Leaflet la navigarea din detaliu, filtrele fără erori.
- [ ] Test real Proprietăți Militari + Chiajna + Ilfov: contul agenției nu are Chiajna/Ilfov; fără creare sau mutare de date. Regula verificată SQL izolat.

## Oferta publică — galerie foto
- [x] PhotoViewer comun pe toate pozele publice, șase miniaturi și +N pe ultima; noindex și restul paginii neschimbate
- [x] Oferta cerută fără cont: 8 imagini distincte decodate desktop/telefon, +2 deschide 6/8, săgeți/taste și gesturi tactile reale în ambele direcții, Escape; fără erori. 17 teste trec, captură mobil în Files

## Ghiduri interactive — etapa 3
- [x] Implementarea celor 14 ghiduri Clienți și Activitate, maximum 8 pași, doar interacțiuni fără salvare
- [x] Inventar actualizat: ACP, Habitoo AI, Mesaje și bara de sus planificate; 29 disponibile + 38 planificate
- [x] 35 teste trecute; 11 ghiduri parcurse în cont desktop/telefon, fără salvări/trimiteri/ștergeri de date de lucru; inventar și capturi ghid 6 în Files
- [ ] Parcurgere reală și capturi ghiduri 2/8 + pagina cererii: lipsesc contacte, cereri și contracte în cont; fără creare de date pentru teste

## Ghiduri interactive — etapa 1
- [x] Fundație: progres per utilizator pe server, revendicare atomică între dispozitive, setare automată și bibliotecă filtrată după acces; inventarul viitor nu este executabil
- [x] Trei ghiduri complete, pași interactivi siguri, panou telefon fără suprapunere inclusiv ultimul buton; fără mutații de proprietăți în teste
- [x] Inventar grupat: 190 intrări viitoare plus trei disponibile, momente și acces, document și șase capturi în Files
- [x] 31 teste trec: utilizatori noi agent/admin desktop/telefon simulați + DB izolată; flux complet real în contul conectat desktop/telefon, progres 3/3 recitit, fără repornire după reload și fără erori; build OK
- [ ] Conturi noi reale agent și admin: sesiunea disponibilă este contul existent; nu s-au creat conturi sau schimbat roluri pentru verificare

## Fotografii pentru șase pagini publice
- [x] Fotografii generate coerente și versiuni WebP/JPG optimizate
- [x] Text stânga/foto dreapta, telefon sub text; OG unic, alte pagini neschimbate
- [x] Șase pagini HTTP 200 desktop/telefon, fără depășiri sau erori; WebP 69–113 KB, OG JPG 1200×630 116–155 KB; 12 capturi salvate; 23 teste trec, build OK; fără publicare

## Liste — păstrarea filtrelor
- [x] Stare persistentă per utilizator/listă, URL prioritar, resetare și MAP separat; Clienți, Lead-uri, Cereri și Oferte partenere
- [x] Întoarcere din detalii și Back cu pagina și poziția păstrate, verificată în cont desktop și telefon pe MAP/Proprietăți
- [x] 28 teste de stare/paginare/filtre; inventar: adăugate Contracte, Comisioane, Activități, Agenți și Date piață; listele administrative SuperAdmin rămân separate și neschimbate

## Studio AI — limite lunare pe agenție
- [x] Limite 50/30/10 configurabile de SuperAdmin; rezervări atomice și lună România, fără numărarea eșecurilor; rezultatele șterse păstrează consumul
- [x] Consum în Studio AI și mesaje de limită/resetare; consum real citit în cont desktop/telefon, fără generări reale
- [x] 40 teste Studio AI (inclusiv trigger SQL izolat) și 16 teste activare AI trec; build OK
- [ ] Verificare vizuală/salvare limite în cont SuperAdmin: contul conectat este administrator de agenție și este redirecționat corect; acces SuperAdmin indisponibil

## Oferte partenere — vizualizator foto comun
- [x] Vizualizator comun cu săgeți, taste, glisare și contor; poze clicabile și +N
- [x] Detaliile întorc toate pozele publicabile neconfidențiale, fără limita 12; ordinea existentă păstrată; X/Esc păstrează detaliile
- [x] HB-1265 în cont: 8 imagini distincte decodate pe desktop/telefon, săgeți/taste și glisare simulată; 15 teste trec, build OK

## Studio AI — MiniMax și fal
- [x] Documentație oficială verificată; MiniMax image-01, Hailuo Fast 768P/6 s fără polling pe server și fal Kontext direct; Replicate eliminat
- [x] Un eveniment ai_media per generare, actualizat la final; erori sigure; fără schimbări de interfață, tabel, bucket sau limite
- [x] 28 teste trec; imagine, îmbunătățire și video reale succeeded în cont; usage success pentru fiecare; build OK. Două încercări inițiale de imagine eșuate (link HTTP și refresh concurent), cauze reparate și testate
- [x] Imagini afișate după reîncărcare; video descărcat HTTP 200, H264 768×768, durată efectivă 5,875 s pentru cererea de 6 s; decodarea confirmată ffmpeg, redarea Chromium indisponibilă în mediul de test

## Muzică AI — eșecuri în producție
- [x] Coada fal (submit + urmărire cu pauze setTimeout) înlocuită cu apel direct POST fal.run, timeout 110 s; fără node:*, Buffer sau pauze — compatibil cu runtime-ul de producție
- [x] Erori neprevăzute: extra_info primește error_name + mesaj sigur (150 caractere, fără chei/URL-uri); coduri scurte păstrate
- [x] 15 teste handler + 8 pure trec, build OK; generare reală 20 s prin apelul direct: WAV 3,85 MB în 9 s, usage success (DB/stocare dublate)
- [ ] Confirmare în producție după publicare: o generare reală din SuperAdmin → Muzică video

## AI pasul 4 — voce video MiniMax direct
- [x] Verificare Get Voice cu cheia existentă: Wise_Woman și Deep_Voice_Man nu apar în lista de 332 voci de sistem
- [x] Trecere directă la speech-2.8-turbo, consum usage_characters și 32 teste simulate trecute; toate cele patru voci românești selectabile; Studio neschimbat
- [x] O singură narațiune reală în cont, 4,26 s, redare efectivă confirmată fără eroare; minimax / speech-2.8-turbo, usage_characters 61, succes; build OK

## AI pasul 3 — interpretarea ACP
- [x] Registry MiniMax/Gemini fără gateway Lovable, JSON validat și o corectare, model și consum efective
- [x] 253 teste ACP trec; o singură generare reală pe analiza existentă 13694819, MiniMax-M3.1-Flash, 4410 tokeni intrare / 2216 ieșire, fără rezervă; vizibilă după reîncărcare, cifrele și hash-ul determinist neschimbate

## AI pasul 2 — citirea cărții de identitate
- [x] Registry MiniMax/Gemini, imagini high și consum cu furnizorul efectiv; limite și MRZ neschimbate
- [x] Teste simulate spate valid/decupaj și față JSON pe MiniMax și rezervă Gemini 529, inclusiv reluarea completă spate/față; fără acte reale

## Clipurile mele — muzică per clip
- [x] Înregistrarea fiecărui clip generat cu muzica folosită, fără publicare; snapshot pentru biblioteca muzicală și MP3 propriu
- [x] Pagină privată „Clipurile mele” în Portofoliu, 24/pagină; istoricul începe de la această schimbare
- [x] 31 teste trec; clip real de 9 s generat în cont, muzica și proprietatea citite în pagina nouă, fără publicare

## AI pasul 1 — MiniMax principal, Gemini rezervă
- [x] Furnizor MiniMax, istoric brut thinking/tool-use și poze base64
- [x] Reluare pe Gemini a buclelor complete de citire/generare, numai după erori tranzitorii; aprobările rămân în afara reluării
- [x] Furnizor/model efectiv, tokeni și rezervă în utilizare; stările în Setări AI; migrația 0183 aplicată
- [x] 374 teste simulate trec, inclusiv 14 MiniMax; build OK; ACP/contracte/Studio păstrate
- [x] MINIMAX_API_KEY salvată securizat; o singură cerere reală în cont prin Habitoo AI verificată la 26 octombrie 2026, 07:22 UTC: răspuns „Confirmat.”, MiniMax-M3.1-Flash, 5236 tokeni intrare / 5 ieșire, fără rezervă

# Meniul din stânga — Comisioane ca element separat

- [x] „Comisioane" scos din grupul „Clienți" și pus ca element separat, fără titlu, imediat după grup
- [x] Același drum /app/comisioane, aceeași iconiță, drepturi neschimbate (agent și administrator), titlu în breadcrumbs, pagina rămâne neindexabilă
- [x] 8 teste (structură + meniu randat: agent/administrator × desfășurat/restrâns); build OK
- [ ] Verificare în cont — autentificarea solicitantului în previzualizare este necesară (nu există cont asociat pentru sesiunea de test)

## Anunțuri particulari — MAP Habitoo / MAP Facebook / Argus
- [x] Separare server pentru rezultate, totaluri, anunțuri noi și localizări
- [x] Trei file cu iconițe, URL Facebook și întoarcere din detaliu; Argus neschimbat; iconița oficială de pe argus.me salvată
- [x] 65 teste trec fără date reale; build OK
- [ ] Verificare desktop/telefon în cont — autentificarea solicitantului în previzualizare este necesară; pagina redirecționează la login

## Sursa Facebook — doar Anunțuri particulari
- [x] Acceptare în baza de date și endpoint, telefon anuntul/facebook, poze neschimbate
- [x] Filtru, URL, etichete și intercalare la final; link spre postare
- [x] Excludere din cifrele publice și ACP; 91 teste trec cu endpoint/date/stocare simulate, nicio dată de test în baza reală; schema confirmată și build OK
- [x] Anunțuri proprietari, ACP și llms.txt: HTTP 200 fără Facebook în surse/cifre
- [ ] Verificare vizuală a filtrului în cont — solicitantul nu are cont asociat pentru sesiunea de test

## SEO pasul 4 — Colaborare între agenții
- [x] Pagină publică SSR, FAQ și graful comun, fără cifre live
- [x] Linkuri în subsol, Funcționalități, sitemap (26 octombrie) și generator llms.txt; fără meniul de sus
- [x] Reguli verificate; teste trec, HTTP 200 fără JavaScript, un H1, cinci FAQ identice, sitemap, navigare și desktop/telefon fără depășire; build OK, fără publicare
- [x] Citire llms.txt prin HTTP — reverificat la adăugarea Facebook: HTTP 200

## SEO pasul 3 — Analiză comparativă de piață
- [x] Pagină publică SSR cu agregate live, ponderi din configurația ACP și FAQ în graful comun
- [x] Meniu public, Funcționalități, sitemap cu data de azi și llms.txt
- [x] 15 teste trec; fără JavaScript: HTTP 200, un H1, FAQ valid, 8071 oferte la 25 octombrie; desktop/telefon și navigare verificate, build OK; fără publicare

## SEO pasul 2 — Anunțuri de la proprietari
- [x] Pagină publică SSR, cifre agregate live și FAQ în graful comun
- [x] Linkuri din Funcționalități/subsol, sitemap cu data schimbării și llms.txt; vechiul link CRM păstrat prin redirecționare
- [x] 26 teste trec; HTTP 200 fără JavaScript, un H1, FAQ valid cu aceleași cifre (5268 / 6 surse, 25 octombrie), desktop/telefon verificate; build OK, fără publicare

## Comisioane — BNR
- [x] Salvare independentă de BNR, completare tolerantă și zilnică (job creat; noua adresă devine disponibilă după publicare)
- [x] Surse în ordine, parser, diagnostic anual (HTTP 200 HTML, zero cursuri) și 39 teste simulate trec
- [x] Surse noi: curs.bnr.ro (curent/10 zile/anual) → www.bnr.ro → BCE prin Frankfurter; sursa (BNR/BCE) pe fiecare curs și comision, în Excel/CSV/PDF
- [x] Cache populat o dată cu cele 204 cursuri BNR 2026 (ultimul: 23 oct, 5.3495); 0 comisioane fără curs; 43 teste trec
- [ ] Salvare verificată în cont — solicitantul nu are cont asociat pentru sesiunea de test

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

## Muzică video generată cu AI (SuperAdmin)
- [x] Migrația 0184: stil liber pe piese (1–120 caractere), organization_id opțional în jurnalul AI
- [x] Generare fal.ai ACE-Step pe server (coadă → descărcare → stocare → rând inactiv), limită 30/zi, cost afișat, erori în română
- [x] Buton „Generează cu AI” + formular în SuperAdmin → Muzică video; WAV acceptat la ascultare și mixare video
- [x] 26 teste (8 handler cu răspunsuri simulate + 18 reguli pure); build OK
- [x] O generare reală de 15 s cu FAL_KEY: piesa „Test AI Habitoo" (Calm, WAV ~2,9 MB) apare inactivă, se ascultă, eveniment fal/ace-step/music cu succes; lat ~9 s
- [x] Reverificare reală după mărirea limitei de stocare: „Test AI Energic 60 secunde”, stil Energic, 60 s (~0,012 $), generată o singură dată; apare inactivă și redarea din listă este confirmată.
