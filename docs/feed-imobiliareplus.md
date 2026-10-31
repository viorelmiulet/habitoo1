# Feedul Habitoo pentru portaluri partenere — Imobiliare+

Documentație tehnică a implementării existente, verificată la 31 octombrie 2026. Versiunea indexului: `habitoo-imobiliareplus-index/1.0`. Versiunea feedului: `habitoo-site-feed/1.0`.

## 1. Modelul de integrare

Integrarea este **pull**, fără cereri de publicare trimise de Habitoo către Imobiliare+ și fără chei configurate de fiecare agenție:

1. Imobiliare+ citește indexul protejat al agențiilor.
2. Pentru fiecare agenție folosește exact `feed.base_url` și `feed.token` din index.
3. Citește **toate paginile** din `/properties`, iar pentru actualizări poate compara `datamodificare`; detaliul este disponibil separat.
4. Retragerea unei oferte este reprezentată prin **dispariția din lista completă**, nu printr-un obiect cu status de ștergere.

Feedul unui token este limitat la agenția respectivă și ofertele selectate explicit pentru Imobiliare+. Oferta trebuie să fie publicată și să aibă status `active`, `reserved` sau `negotiation`; ofertele șterse nu apar. Pentru Imobiliare+ este necesar și un agent responsabil cu telefon valid. O ofertă deselectată, nepublicată sau devenită neeligibilă dispare. Nu se expun proprietarul, notele interne ori comisioanele interne.

**Sincronizare sigură:** reconciliați retragerile numai după o citire integrală reușită. O eroare HTTP, o pagină lipsă ori o singură pagină goală nu reprezintă un inventar complet. Paginarea este după data modificării, descrescător, fără cursor sau snapshot de inventar; modificările concurente pot deplasa ofertele între pagini. `idstr` este o referință, nu o promisiune de identificator numeric global; `alias` și `url` includ identificatorul UUID al ofertei.

## 2. Indexul agențiilor

```http
GET https://crm.habitoo.ro/api/public/feed/imobiliareplus/index/{CHEIE}.json
```

`{CHEIE}` este un substituent, nu o cheie utilizabilă. Cheia indexului este furnizată separat, confidențial. Nu se transmite ca token al agenției. Nu există parametri query ori corp de cerere pentru index.

Răspuns **200**, `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-cache, must-revalidate`.

| Câmp | Tip | Semnificație |
| --- | --- | --- |
| `version` | string | `habitoo-imobiliareplus-index/1.0`. |
| `generated_at` | string | Momentul generării indexului, ISO 8601. |
| `agencies` | object[] | Agențiile prezente în index; poate fi []. |
| `agencies[].id` | string | Identificatorul agenției în index, cu prefix hb; tratați-l ca opac. |
| `agencies[].name` | string sau null | Numele agenției. |
| `agencies[].legal_name` | string sau null | Denumirea juridică. |
| `agencies[].cui` | string sau null | Identificatorul fiscal. |
| `agencies[].email` | string sau null | Emailul de contact pentru materialele publice, altfel emailul agenției. |
| `agencies[].phone` | string sau null | Telefonul pentru materialele publice, altfel telefonul agenției. |
| `agencies[].website` | string sau null | Website-ul completat pentru materialele publice. |
| `agencies[].county` | string sau null | În implementarea actuală, întotdeauna null. |
| `agencies[].city` | string sau null | Localitatea agenției. |
| `agencies[].address` | string sau null | Adresa completată pentru materialele publice. |
| `agencies[].logo_url` | string sau null | URL-ul logoului, dacă există; poate fi temporar. |
| `agencies[].status` | string | Numai active sau grace; nu este statusul proprietății. |
| `agencies[].inactive_since` | string sau null | ISO 8601 la grace; null la active. |
| `agencies[].updated_at` | string | Ultima modificare a agenției, ISO 8601; nu este ultima modificare a ofertelor. |
| `agencies[].feed` | object | Datele de acces la feedul acelei agenții. |
| `agencies[].feed.base_url` | string | În producție https://crm.habitoo.ro/api/public/sites/v1. |
| `agencies[].feed.token` | string | Token confidențial al agenției pentru feed; se folosește exact valoarea primită. |

Șirurile de contact goale sunt normalizate la null. `feed.token` nu trebuie afișat public, inclus în pagini ori logat.

### Activare și grație

- `active`: portalul este activat pentru agenție, iar agenția este eligibilă (activă sau în probă, nearhivată). Indexul mai cere să existe cel puțin o ofertă selectată pentru Imobiliare+; această condiție nu garantează că oferta trece toate filtrele feedului.
- `grace`: agenția a fost activă, dar a devenit inactivă. Rămâne vizibilă **7 zile**, cu `inactive_since`; tokenul încă este acceptat, dar `/properties` returnează **200 cu listă goală**, iar detaliile ofertelor **404**. Imobiliare+ trebuie să retragă ofertele acelei agenții.
- După mai mult de 7 zile de la `inactive_since`, agenția dispare. La exact 7 zile încă este în grație. Dacă nu mai există nicio ofertă selectată pentru Imobiliare+, agenția poate dispărea din index înainte de expirarea grației.
- O agenție care nu a fost niciodată activă nu este inclusă. O agenție redevenită activă are status active și inactive_since null.
- Absența agenției din index invalidează utilizarea tokenului ei la următoarea verificare. O citire integrală a indexului este necesară pentru a detecta agențiile dispărute.

## 3. Autentificarea feedului

Forma recomandată pentru toate cererile JSON:

```http
Authorization: Bearer {TOKEN_AGENTIE}
```

`{TOKEN_AGENTIE}` reprezintă `agencies[].feed.token`, nu cheia indexului. Tokenurile Imobiliare+ încep cu prefixul `hbip_`; tokenurile altor portaluri sunt refuzate. Sunt acceptate și:

- `Authorization: Basic {BASE64(user:token)}`; tokenul poate fi parola, sau utilizatorul dacă parola este goală;
- unul dintre headerele `X-Habitoo-Feed-Token`, `X-API-Key`, `X-ApiKey`.

Numele headerelor nu disting majusculele de minuscule. Folosiți o singură metodă. Aceste endpointuri **nu acceptă tokenul în query string**. Tokenul nu poate schimba agenția sau destinația prin parametri. Drepturile tokenului din index permit citirea ofertelor și agenților.

## 4. Endpointuri și paginare

Toate căile din această secțiune sunt relative la `feed.base_url`.

| Cerere | Autentificare | Răspuns |
| --- | --- | --- |
| `GET /properties` | Tokenul agenției | Listă paginată de oferte. |
| `GET /properties/{id}` | Tokenul agenției | Obiect data cu o singură ofertă. |
| `GET /agents` | Tokenul agenției | Listă paginată de agenți activi. |
| `GET /media/{id}` | Fără token | Redirect 302 către imagine, sau eroare. |

### GET /properties — toți parametrii implementați

| Parametru query | Tip interpretat | Implicit | Reguli |
| --- | --- | --- | --- |
| `page` | număr | 1 | Valori finite ≥ 1 sunt rotunjite în jos; celelalte devin 1. |
| `per_page` | număr | 50 | Valori finite ≥ 1 sunt rotunjite în jos și plafonate la 200; celelalte devin 50. |

Nu există filtre implementate după dată, status, oraș, tranzacție, tip ori identificator. Parametrii suplimentari nu filtrează rezultatele. Nu există `since`, `updated_since`, cursor sau sortare configurabilă. Ordinea este descrescătoare după ultima modificare; egalitățile nu au un criteriu secundar explicit.

```http
GET {BASE_URL}/properties?page=1&per_page=200
Authorization: Bearer {TOKEN_AGENTIE}
```

| Câmp de răspuns | Tip | Reguli |
| --- | --- | --- |
| `total` | number | Numărul ofertelor eligibile în acel feed. |
| `per_page` | number | Mărimea normalizată a paginii. |
| `current_page` | number | Pagina normalizată solicitată. |
| `last_page` | number | Maximum dintre 1 și rotunjirea în sus a total/per_page. |
| `next_page_url` | string sau null | URL complet al paginii următoare, păstrând query-ul; null pe ultima pagină. |
| `prev_page_url` | string sau null | URL complet al paginii anterioare; null pe prima pagină. |
| `from` | number sau null | Poziția de început, indexată de la 1; null când total este 0. |
| `to` | number sau null | Poziția finală; null când total este 0. |
| `data` | object[] | Ofertele paginii, fiecare cu schema din secțiunea 5. |
| `api_version` | string | habitoo-site-feed/1.0. |

O pagină dincolo de `last_page` întoarce **200 cu data: []**, nu 404. La total nenul, `from` și `to` pot rămâne poziția de început calculată, chiar dincolo de total; nu le interpretați drept dovada prezenței unor oferte. La listă complet goală: total 0, last_page 1, from/to null.

### GET /properties/{id}

`{id}` acceptă UUID-ul ofertei sau referința exactă (`idstr`). Se elimină spațiile de la capete; identificatorul trebuie să aibă 1–64 caractere. Pentru identificatori non-UUID, căutarea se face după referință, nu după alias. Codificați URL-ul cu encodeURIComponent când construiți cererea.

Răspunsul este `{ "data": { ...oferta }, "api_version": "habitoo-site-feed/1.0" }`, fără metadate de paginare. Ofertele altei agenții, neselectate pentru Imobiliare+ ori neeligibile nu sunt returnate: **404**.

### GET /agents

Acceptă aceiași doi parametri `page` și `per_page`, cu aceleași limite și anvelopă paginată. Returnează agenții activi ai agenției tokenului, în ordine alfabetică după nume; nu numai agenții cu oferte în această pagină. Grația nu adaugă un filtru care să golească lista agenților.

| Câmp în data[] | Tip | Descriere |
| --- | --- | --- |
| `idstr` | string | Identificatorul agentului. |
| `nume` | string | Numele public. |
| `email` | string sau null | Emailul agentului. |
| `telefon` | string sau null | Telefonul agentului. |
| `functie` | string sau null | Funcția completată. |
| `poza` | string sau null | URL HTTPS existent ori URL public /media/agent/{id}; null fără fotografie. |
| `activ` | boolean | true pentru agenții returnați de lista activă. |

### GET /media/{id}

Folosiți `images[].src`. `{id}` trebuie să fie un UUID de imagine; sunt acceptate și sufixele `.jpg`, `.jpeg`, `.png`, `.webp` (nu garantează conversia imaginii în acel format).

Endpointul este public, **nu verifică tokenul sau selecția pentru Imobiliare+**. Servește numai imagini publicabile, neconfidențiale, ale unei proprietăți publicate cu status eligibil. Nu este un endpoint pentru enumerarea imaginilor.

- **302**, corp gol, header `Location` și `Cache-Control: public, max-age=3600`.
- Dacă imaginea este semnată, URL-ul țintă este valabil 24 h; când există doar un URL de imagine disponibil, acesta poate fi ținta redirectului. Nu presupuneți că orice redirect are neapărat o semnătură.
- Poate fi servită varianta cu watermark configurată de agenție; originalul nu este schimbat.
- Urmați redirectul pentru descărcare, dar nu transmiteți tokenul agenției la destinația imaginii. Păstrați URL-ul stabil images[].src, nu un URL temporar din Location.
- **404**, text Not found: ID invalid, imagine indisponibilă/nepublicabilă/confidențială ori proprietate neeligibilă. **500**, text Internal error: excepție la servire.

## 5. Schema completă a ofertei

Lista și detaliul folosesc aceeași schemă: **87 de câmpuri la primul nivel**. `null` înseamnă informație necompletată sau neexpusă; listele fără valori sunt []. Numele sunt case-sensitive și nu sunt traduse. Nu transformați null în 0 și nu considerați implicit false o valoare booleană nullable.

| Câmp | Tip JSON | Descriere / valori |
| --- | --- | --- |
| `idnum` | number sau null | Componenta numerică a referinței, dacă este un întreg sigur; nu este identificatorul global al ofertei. |
| `idstr` | string | Referința ofertei; în lipsa ei, identificatorul UUID. Poate fi folosit pentru cererea de detaliu. |
| `alias` | string | Alias în forma oferta-{UUID}. Nu se transmite aliasul în locul identificatorului la detaliu. |
| `agent` | string sau null | Numele public al agentului responsabil. |
| `agent_id` | string sau null | Identificatorul agentului responsabil; corespunde idstr din /agents. |
| `dataadaugare` | string sau null | Data adăugării, ca șir de dată/oră. |
| `datamodificare` | string sau null | Data ultimei modificări, ca șir de dată/oră; utilă pentru detectarea actualizărilor, nu este un filtru de cerere. |
| `adresa` | string sau null | Adresa publicată a ofertei. |
| `titlu` | object | Obiect cu ro: string (titlul românesc), en: string | null (întotdeauna null în implementarea actuală). |
| `descriere` | object | Obiect cu ro: string | null (descrierea), en: string | null (întotdeauna null). |
| `vecinatati` | string[] | Întotdeauna []. |
| `utilitati` | string[] | Aceleași utilități, în format text; vezi nomenclatorul de mai jos. |
| `finisaje` | string[] | Concatenarea izolațiilor, finisajelor de pereți/podele, ferestrelor, jaluzelelor, rulourilor și ușilor; fără eliminarea duplicatelor. |
| `dotari` | string[] | Aceeași listă unică de dotări: dotări existente, spații suplimentare, bucătărie, contorizare, electrocasnice, dotări imobil, străzi, priveliște, diverse și climatizare. |
| `altedetaliizona` | string sau null | Denumirea zonei/cartierului. |
| `pretnegociabil` | boolean | Indică dacă prețul este negociabil; false când informația nu este activată. |
| `longitudine` | number sau null | Coordonată geografică publică. Exactă dacă agenția a ales locație precisă; altfel deplasare deterministă de maximum 300 m. null dacă lipsesc coordonatele. |
| `latitudine` | number sau null | Coordonată geografică publică. Exactă dacă agenția a ales locație precisă; altfel deplasare deterministă de maximum 300 m. null dacă lipsesc coordonatele. |
| `tiplocuinta` | string sau null | Tip rezidențial numai pentru apartment, studio, house sau villa; null pentru celelalte tipuri. |
| `tipimobil` | string sau null | Tipul proprietății, transmis textual fără remapare; vezi valorile cunoscute mai jos. |
| `tipteren` | string sau null | Categoria textuală a terenului, numai la tip land; aceeași valoare în ambele câmpuri. Nu există enumerare închisă în feed. |
| `clasificareteren` | string sau null | Categoria textuală a terenului, numai la tip land; aceeași valoare în ambele câmpuri. Nu există enumerare închisă în feed. |
| `nrfronturistradale` | number sau null | Întotdeauna null; nu este derivată o valoare. |
| `frontstradal` | number sau null | Întotdeauna null; nu este derivată o valoare. |
| `latimedrumacces` | number sau null | Întotdeauna null; nu este derivată o valoare. |
| `suprafatateren` | number sau null | Suprafața terenului. |
| `nrcamere` | number sau null | Numărul camerelor. |
| `nrdormitoare` | number sau null | Numărul dormitoarelor. |
| `nrbucatarii` | number sau null | Numărul bucătăriilor. |
| `etaj` | number sau null | Etaj numeric; nu este o etichetă textuală. |
| `tipcompartimentare` | string sau null | Compartimentare textuală; valorile curente din formular sunt enumerate mai jos. |
| `suprafatautila` | number sau null | Suprafața utilă. |
| `confort` | string sau null | Confort textual; valorile curente sunt 1, 2, 3 și Lux (șiruri). |
| `suprafataconstruita` | number sau null | Suprafața construită. |
| `anconstructie` | number sau null | Anul construcției. |
| `nrbai` | number sau null | Numărul băilor. |
| `nrnivele` | number sau null | Numărul etajelor/nivelurilor imobilului. |
| `nrbalcoane` | number sau null | Numărul balcoanelor. |
| `nrgaraje` | number sau null | Numărul garajelor. |
| `stadiuconstructie` | string sau null | Același stadiu textual al construcției. |
| `structurarezistenta` | string sau null | Structura de rezistență, textuală. |
| `status` | string | Enumerare efectivă în ofertele returnate: active, reserved, negotiation. |
| `localitate` | string sau null | Denumirea localității. |
| `judet` | string sau null | Denumirea județului. |
| `zona` | string sau null | Denumirea zonei/cartierului. |
| `strada` | string sau null | Denumirea străzii. |
| `numarstradal` | string sau null | Numărul stradal, ca text. |
| `cod_siruta_judet` | number sau null | Codul SIRUTA al județului, UAT-ului, respectiv localității, dacă este completat. |
| `cod_siruta_uat` | number sau null | Codul SIRUTA al județului, UAT-ului, respectiv localității, dacă este completat. |
| `cod_siruta_localitate` | number sau null | Codul SIRUTA al județului, UAT-ului, respectiv localității, dacă este completat. |
| `caroiaj` | string sau null | Întotdeauna null. Ortografia câmpului este exact caroiaj. |
| `devanzare` | boolean | Proprietatea este oferită spre vânzare. |
| `deinchiriere` | boolean | Proprietatea este oferită spre închiriere, independent de devanzare. |
| `monedavanzare` | string sau null | Moneda prețului de vânzare; null dacă vânzarea nu este activă. |
| `monedainchiriere` | string sau null | Moneda prețului de închiriere; null dacă închirierea nu este activă. |
| `pretvanzare` | number sau null | Prețul vânzării, fără conversie sau rotunjire în feed; null dacă vânzarea nu este activă ori prețul lipsește. |
| `pretinchiriere` | number sau null | Prețul închirierii, fără conversie sau rotunjire în feed; null dacă închirierea nu este activă ori prețul lipsește. |
| `pretfaratva` | number sau null | Întotdeauna null; nu se calculează un preț fără TVA. |
| `tvainclus` | boolean sau null | Valoarea explicită a includerii TVA; null când nu este specificată. Nu justifică derivarea automată a unui preț net. |
| `comisioncumparator` | string sau null | Întotdeauna null; nu este expus un comision intern. |
| `referintaexterna` | string sau null | Referință externă a ofertei, dacă există; diferită de idstr. |
| `images` | object[] | Galeria publicabilă. Schema completă a elementelor este mai jos. |
| `publicare` | boolean | true pentru ofertele eligibile returnate de aceste endpointuri. |
| `top` | boolean | Indicatori independenți determinați de marcajele top, respectiv pole ale ofertei; nu confirmă o promovare pe Imobiliare+. |
| `pole` | boolean | Indicatori independenți determinați de marcajele top, respectiv pole ale ofertei; nu confirmă o promovare pe Imobiliare+. |
| `custom1` | string sau null | Întotdeauna null. |
| `custom2` | string sau null | Întotdeauna null. |
| `portals` | string[] | Identificatori textuali ai destinațiilor de publicare și marcajelor de destinație existente; nu este o enumerare închisă și nu se folosește în locul filtrării feedului Imobiliare+. |
| `tip` | string sau null | Tipul proprietății, transmis textual fără remapare; vezi valorile cunoscute mai jos. |
| `suprafata_value` | number sau null | Suprafața generală completată la ofertă; poate diferi de suprafața utilă/construită. |
| `incalzire_value` | string sau null | Încălzirea textuală; în lipsa valorii principale se folosește prima valoare a sistemelor de încălzire. |
| `mobilare_value` | string sau null | Aceeași valoare textuală de mobilare; ambele denumiri sunt expuse. |
| `mobilat_value` | string sau null | Aceeași valoare textuală de mobilare; ambele denumiri sunt expuse. |
| `parcare_value` | string sau null | Tipul parcării, textual. |
| `balcon_value` | boolean sau null | Indicator explicit al balconului; independent de nrbalcoane. |
| `utilitati_values` | string[] | Aceleași utilități, în format text; vezi nomenclatorul de mai jos. |
| `dotari_values` | string[] | Aceeași listă unică de dotări: dotări existente, spații suplimentare, bucătărie, contorizare, electrocasnice, dotări imobil, străzi, priveliște, diverse și climatizare. |
| `stadiuconstructie_value` | string sau null | Același stadiu textual al construcției. |
| `tipconstructie_value` | string sau null | Tipul textual al clădirii. |
| `starefinisaje_value` | string sau null | Starea textuală a finisajelor. |
| `bucatarie_values` | string[] | Dotările/starea bucătăriei, textual. |
| `eficienta_energetica` | string sau null | Întotdeauna null. |
| `consum_specific` | number sau null | Întotdeauna null. |
| `indice_emisii` | number sau null | Întotdeauna null. |
| `consum_energie_regenerabila` | number sau null | Întotdeauna null. |
| `energy` | object | clasa: string | null, consum: number | null, emisii: number | null; toate cele trei valori sunt întotdeauna null. |
| `url` | string sau null | Linkul public al ofertei; în producție https://habitoo.ro/oferta/{UUID}. |

### Elementele images[]

| Câmp | Tip | Descriere |
| --- | --- | --- |
| `src` | string | URL public stabil /media/{UUID}; urmați redirectul. |
| `tip` | string | Enumerare exactă: principala sau galerie. |
| `pozitie` | number | Poziția completată; implicit 0. Nu este renumerotată de feed. |
| `modificata` | string sau null | Ultima modificare a imaginii. |
| `alt` | string sau null | Textul alternativ. |
| `width` | number sau null | Lățimea imaginii în pixeli, dacă este cunoscută. |
| `height` | number sau null | Înălțimea imaginii în pixeli, dacă este cunoscută. |

Imaginile principale sunt ordonate înaintea celor de galerie; în interiorul aceluiași grup ordinea este după pozitie crescător. De aceea o imagine principală cu pozitie 2 poate preceda imaginea de galerie cu pozitie 0. Nu există în mapper o limită numerică a fotografiilor returnate.

### Enumerări și valori textuale

Singurele enumerări restrânse efectiv în aceste răspunsuri sunt statusurile ofertei (`active`, `reserved`, `negotiation`), statusurile agenției (`active`, `grace`) și `images[].tip` (`principala`, `galerie`).

Tipurile cunoscute din selecția CRM sunt `apartment`, `studio`, `house`, `land`, `commercial`, `office`, `industrial`. Mapperul transmite tipul fără validare sau traducere și recunoaște suplimentar `villa` ca rezidențial pentru tiplocuinta. Nu confundați aceste coduri cu etichetele românești ale formularului.

Celelalte câmpuri textuale sunt **transmise ca atare**, nu transformate în coduri numerice și nu validate de feed împotriva unei enumerări închise. Următoarele sunt valorile exacte oferite de taxonomia curentă a formularului, nu o garanție că datele istorice/importate nu pot conține alte texte, alte majuscule sau alte forme:

- **tipcompartimentare**: `Decomandat`, `Semidecomandat`, `Nedecomandat`, `Circular`, `Vagon`, `Open space`.
- **confort**: `1`, `2`, `3`, `Lux`.
- **stadiuconstructie / stadiuconstructie_value**: `Finalizată`, `În construcție`, `La roșu`, `La cheie`, `Semifinisată`, `Proiect`.
- **tipconstructie_value**: `Bloc`, `Casă`, `Vilă`, `Imobil de birouri`, `Ansamblu rezidențial`, `Hală`.
- **structurarezistenta**: `Beton`, `Cărămidă`, `BCA`, `Lemn`, `Metal`, `Prefabricate`, `Mixtă`.
- **incalzire_value**: `Termoficare`, `Centrală proprie`, `Centrală imobil`, `Convectoare`, `Sobă teracotă`, `Centrală pe lemne`, `Încălzire pardoseală`, `Calorifere`, `Pompă de căldură`.
- **mobilare_value / mobilat_value**: `Complet`, `Parțial`, `Nemobilat`, `Lux`, `Modern`.
- **parcare_value**: `Fără`, `Loc de parcare`, `Garaj`, `Parcare subterană`, `Parcare supraterană`.
- **starefinisaje_value**: `Finisat`, `Semifinisat`, `Ultrafinisat`, `Bună`, `Necesită renovare`, `Renovat`.
- **bucatarie_values**: `Mobilată`, `Parțial mobilată`, `Utilată`, `Parțial utilată`, `Nemobilată`, `Neutilată`.
- **utilitati / utilitati_values**: `Curent electric`, `Apă`, `Canalizare`, `Gaz`, `Puț`, `Fosă septică`, `Curent trifazic`, `CATV`, `Telefon`, `Acces internet`, `Fibră optică`, `Utilități în zonă`, `Sistem irigație`.
- **finisaje — izolații**: `Exterior`, `Interior`, `Bloc izolat termic`.
- **finisaje — pereți**: `Vopsea lavabilă`, `Var`, `Faianță`, `Lambriu`, `Tapet`, `Marmură`, `Huma`, `Vinarom`.
- **finisaje — podele**: `Parchet`, `Gresie`, `Marmură`, `Mochetă`, `Dușumea`, `Linoleum`, `Nefinisat`, `Pardoseală flotantă`.
- **finisaje — ferestre**: `PVC`, `Lemn`, `Aluminiu`, `Termopan`.
- **finisaje — jaluzele**: `Verticale`, `Orizontale`.
- **finisaje — rulouri**: `Aluminiu`, `Lemn`, `PVC`.
- **finisaje — ușă intrare**: `Metal`, `Lemn`, `PVC`, `Pal`.
- **finisaje — uși interioare**: `Celulare`, `Lemn`, `Panel`, `PVC`, `Sticlă`, `Metal`.
- **dotari / dotari_values — spații suplimentare**: `Terasă`, `WC serviciu`, `Boxă la subsol`, `Debara`, `Pivniță`, `Dressing`.
- **dotari / dotari_values — bucătărie**: `Mobilată`, `Parțial mobilată`, `Utilată`, `Parțial utilată`, `Nemobilată`, `Neutilată`.
- **dotari / dotari_values — contorizare**: `Apometre`, `Contor căldură`, `Contor gaz`, `Contor curent electric`, `Contorizare separată`.
- **dotari / dotari_values — electrocasnice**: `Mașină de spălat rufe`, `Frigider`, `Aragaz`, `Mașină de spălat vase`, `Fier de călcat`, `TV`, `Cafetieră`, `Uscător păr`, `Toaster`, `DVD`, `Sandwich-maker`, `Cuptor microunde`, `Hotă`, `Robot bucătărie`, `Aspirator`, `HI-FI`, `Plită electrică`.
- **dotari / dotari_values — imobil**: `Interfon`, `Videointerfon`, `Supraveghere video`, `Lift`, `Spații agrement`, `Sauna`, `SPA`, `Acoperiș`, `Curte`, `Curte comună`, `Grădină`, `Piscină interioară`, `Piscină exterioară`, `Uscătorie`.
- **dotari / dotari_values — străzi**: `Asfaltate`, `Pietruite`, `Neamenajate`, `Betonate`, `Iluminat stradal`, `Mijloace de transport în comun`.
- **dotari / dotari_values — priveliște**: `Panoramică`, `Spre lac`, `Spre mare`, `Spre munte`, `Spre oraș`, `Spre pădure`.
- **dotari / dotari_values — diverse**: `Jacuzzi`, `Scară interioară`, `Șemineu`, `Senzor de fum`, `Sistem de alarmă`, `Telecomandă poartă garaj`, `Telecomandă poartă acces auto`.
- **dotari / dotari_values — climatizare**: `Aer condiționat`, `Ventiloconvectoare`, `Aeroterme`.

`dotari` poate conține și texte de dotări deja existente, nu doar aceste grupe. Pentru categoria terenului și identificatorii din portals nu există un nomenclator închis în acest feed. Pentru monede, mapperul păstrează șirul primit și nu restrânge valorile la o listă; exemplele reale de mai jos conțin EUR. Nu presupuneți o monedă implicită dacă valoarea este null.

## 6. Prețuri: vânzare și închiriere simultană

O proprietate apare **o singură dată**, chiar când `devanzare` și `deinchiriere` sunt ambele true. Cele două perechi de câmpuri sunt independente:

- vânzare: `pretvanzare`, `monedavanzare`;
- închiriere: `pretinchiriere`, `monedainchiriere`.

Un flag false produce preț și monedă null pentru tranzacția respectivă. Un flag true nu garantează un preț nenul. Înregistrările vechi sunt interpretate după tranzacția principală când flagurile independente lipsesc; prețul/moneda principale sunt fallback numai pentru tranzacția principală. Un false explicit nu este suprascris.

Feedul nu convertește monede, nu rotunjește prețul și nu impune pozitivitatea prețului. Nu expune un câmp pentru periodicitatea chiriei; nu deduceți contractual lună/zi/an numai din pretinchiriere. Dacă Imobiliare+ generează două anunțuri, trebuie să păstreze legătura cu aceeași proprietate și să retragă tranzacția al cărei flag devine false. TVA nu este recalculată; pretfaratva rămâne null.

## 7. Exemple JSON anonimizate

**Proveniență:** lista și detaliul de mai jos provin din răspunsuri HTTP 200 ale implementării comune a feedului public, citite la 29 octombrie 2026. Contactele, referințele, identificatorii, textele, localizarea și tokenul sunt mascate; idnum este înlocuit cu 0, iar coordonatele/codurile de localizare cu null. Aceste înlocuiri nu descriu lipsa lor din răspunsul original.

Nu sunt prezentate ca răspunsuri live Imobiliare+: accesul autentificat la indexul Imobiliare+ nu a fost disponibil la redactare. Exemplul indexului folosește o intrare reală anonimizată din implementarea comună și valoarea version pentru Imobiliare+, verificată în cod. Nu certifică prezența acelei agenții în indexul Imobiliare+. Valoarea portals este mascată, fără schimbarea contractului câmpului. Nicio valoare mascată nu este o credențială sau un URL utilizabil.

### Index — structură Imobiliare+, intrare reală anonimizată

```json
{
  "version": "habitoo-imobiliareplus-index/1.0",
  "generated_at": "2026-10-29T14:12:29.843Z",
  "agencies": [
    {
      "id": "[MASCAT]",
      "name": "[MASCAT]",
      "legal_name": "[MASCAT]",
      "cui": "[MASCAT]",
      "email": "[MASCAT]",
      "phone": "[MASCAT]",
      "website": null,
      "county": null,
      "city": "[MASCAT]",
      "address": "[MASCAT]",
      "logo_url": null,
      "status": "active",
      "inactive_since": null,
      "updated_at": "2026-10-25T06:11:47.913Z",
      "feed": {
        "base_url": "https://crm.habitoo.ro/api/public/sites/v1",
        "token": "[TOKEN_MASCAT]"
      }
    }
  ]
}
```

### Listă — răspuns real anonimizat, per_page=1

```json
{
  "total": 2,
  "per_page": 1,
  "current_page": 1,
  "last_page": 2,
  "next_page_url": "https://crm.habitoo.ro/api/public/sites/v1/properties?per_page=1&page=2",
  "prev_page_url": null,
  "from": 1,
  "to": 1,
  "data": [
    {
      "idnum": 0,
      "idstr": "[MASCAT]",
      "alias": "[MASCAT]",
      "agent": "[MASCAT]",
      "agent_id": "[MASCAT]",
      "dataadaugare": "2026-10-25T10:53:00.806987+00:00",
      "datamodificare": "2026-10-28T17:02:02.291394+00:00",
      "adresa": null,
      "titlu": {
        "ro": "[TEXT_MASCAT]",
        "en": null
      },
      "descriere": {
        "ro": "[TEXT_MASCAT]",
        "en": null
      },
      "vecinatati": [],
      "utilitati": [
        "Curent electric",
        "Canalizare",
        "Apă"
      ],
      "finisaje": [],
      "dotari": [
        "Aer condiționat"
      ],
      "altedetaliizona": null,
      "pretnegociabil": false,
      "longitudine": null,
      "latitudine": null,
      "tiplocuinta": "apartment",
      "tipimobil": "apartment",
      "tipteren": null,
      "clasificareteren": null,
      "nrfronturistradale": null,
      "frontstradal": null,
      "latimedrumacces": null,
      "suprafatateren": null,
      "nrcamere": 2,
      "nrdormitoare": 1,
      "nrbucatarii": 1,
      "etaj": 1,
      "tipcompartimentare": "Decomandat",
      "suprafatautila": 58,
      "confort": null,
      "suprafataconstruita": 68,
      "anconstructie": 2022,
      "nrbai": 1,
      "nrnivele": 7,
      "nrbalcoane": 1,
      "nrgaraje": null,
      "stadiuconstructie": "Finalizată",
      "structurarezistenta": "Cărămidă",
      "status": "active",
      "localitate": "[MASCAT]",
      "judet": "[MASCAT]",
      "zona": null,
      "strada": null,
      "numarstradal": null,
      "cod_siruta_judet": null,
      "cod_siruta_uat": null,
      "cod_siruta_localitate": null,
      "caroiaj": null,
      "devanzare": true,
      "deinchiriere": false,
      "monedavanzare": "EUR",
      "monedainchiriere": null,
      "pretvanzare": 79000,
      "pretinchiriere": null,
      "pretfaratva": null,
      "tvainclus": false,
      "comisioncumparator": null,
      "referintaexterna": null,
      "images": [
        {
          "src": "https://crm.habitoo.ro/api/public/sites/v1/media/[ID_MASCAT]",
          "tip": "principala",
          "pozitie": 2,
          "modificata": "2026-10-25T10:53:41.957908+00:00",
          "alt": null,
          "width": 750,
          "height": 1000
        },
        {
          "src": "https://crm.habitoo.ro/api/public/sites/v1/media/[ID_MASCAT]",
          "tip": "galerie",
          "pozitie": 0,
          "modificata": "2026-10-25T10:53:41.961991+00:00",
          "alt": null,
          "width": 750,
          "height": 1000
        },
        {
          "src": "https://crm.habitoo.ro/api/public/sites/v1/media/[ID_MASCAT]",
          "tip": "galerie",
          "pozitie": 1,
          "modificata": "2026-10-25T10:53:41.968134+00:00",
          "alt": null,
          "width": 946,
          "height": 1000
        },
        {
          "src": "https://crm.habitoo.ro/api/public/sites/v1/media/[ID_MASCAT]",
          "tip": "galerie",
          "pozitie": 3,
          "modificata": "2026-10-25T10:53:41.973384+00:00",
          "alt": null,
          "width": 750,
          "height": 1000
        },
        {
          "src": "https://crm.habitoo.ro/api/public/sites/v1/media/[ID_MASCAT]",
          "tip": "galerie",
          "pozitie": 4,
          "modificata": "2026-10-25T10:53:41.967251+00:00",
          "alt": null,
          "width": 750,
          "height": 1000
        },
        {
          "src": "https://crm.habitoo.ro/api/public/sites/v1/media/[ID_MASCAT]",
          "tip": "galerie",
          "pozitie": 5,
          "modificata": "2026-10-25T10:53:41.95791+00:00",
          "alt": null,
          "width": 724,
          "height": 1000
        },
        {
          "src": "https://crm.habitoo.ro/api/public/sites/v1/media/[ID_MASCAT]",
          "tip": "galerie",
          "pozitie": 6,
          "modificata": "2026-10-25T10:53:41.980579+00:00",
          "alt": null,
          "width": 773,
          "height": 1000
        },
        {
          "src": "https://crm.habitoo.ro/api/public/sites/v1/media/[ID_MASCAT]",
          "tip": "galerie",
          "pozitie": 7,
          "modificata": "2026-10-25T10:53:41.961771+00:00",
          "alt": null,
          "width": 750,
          "height": 1000
        }
      ],
      "publicare": true,
      "top": false,
      "pole": false,
      "custom1": null,
      "custom2": null,
      "portals": [
        "[IDENTIFICATOR_MASCAT]"
      ],
      "tip": "apartment",
      "suprafata_value": 58,
      "incalzire_value": "Centrală proprie",
      "mobilare_value": null,
      "mobilat_value": null,
      "parcare_value": null,
      "balcon_value": false,
      "utilitati_values": [
        "Curent electric",
        "Canalizare",
        "Apă"
      ],
      "dotari_values": [
        "Aer condiționat"
      ],
      "stadiuconstructie_value": "Finalizată",
      "tipconstructie_value": "Bloc",
      "starefinisaje_value": "Finisat",
      "bucatarie_values": [],
      "eficienta_energetica": null,
      "consum_specific": null,
      "indice_emisii": null,
      "consum_energie_regenerabila": null,
      "energy": {
        "clasa": null,
        "consum": null,
        "emisii": null
      },
      "url": "https://habitoo.ro/oferta/[ID_MASCAT]"
    }
  ],
  "api_version": "habitoo-site-feed/1.0"
}
```

### Detaliu — răspuns real anonimizat pentru aceeași ofertă

```json
{
  "data": {
    "idnum": 0,
    "idstr": "[MASCAT]",
    "alias": "[MASCAT]",
    "agent": "[MASCAT]",
    "agent_id": "[MASCAT]",
    "dataadaugare": "2026-10-25T10:53:00.806987+00:00",
    "datamodificare": "2026-10-28T17:02:02.291394+00:00",
    "adresa": null,
    "titlu": {
      "ro": "[TEXT_MASCAT]",
      "en": null
    },
    "descriere": {
      "ro": "[TEXT_MASCAT]",
      "en": null
    },
    "vecinatati": [],
    "utilitati": [
      "Curent electric",
      "Canalizare",
      "Apă"
    ],
    "finisaje": [],
    "dotari": [
      "Aer condiționat"
    ],
    "altedetaliizona": null,
    "pretnegociabil": false,
    "longitudine": null,
    "latitudine": null,
    "tiplocuinta": "apartment",
    "tipimobil": "apartment",
    "tipteren": null,
    "clasificareteren": null,
    "nrfronturistradale": null,
    "frontstradal": null,
    "latimedrumacces": null,
    "suprafatateren": null,
    "nrcamere": 2,
    "nrdormitoare": 1,
    "nrbucatarii": 1,
    "etaj": 1,
    "tipcompartimentare": "Decomandat",
    "suprafatautila": 58,
    "confort": null,
    "suprafataconstruita": 68,
    "anconstructie": 2022,
    "nrbai": 1,
    "nrnivele": 7,
    "nrbalcoane": 1,
    "nrgaraje": null,
    "stadiuconstructie": "Finalizată",
    "structurarezistenta": "Cărămidă",
    "status": "active",
    "localitate": "[MASCAT]",
    "judet": "[MASCAT]",
    "zona": null,
    "strada": null,
    "numarstradal": null,
    "cod_siruta_judet": null,
    "cod_siruta_uat": null,
    "cod_siruta_localitate": null,
    "caroiaj": null,
    "devanzare": true,
    "deinchiriere": false,
    "monedavanzare": "EUR",
    "monedainchiriere": null,
    "pretvanzare": 79000,
    "pretinchiriere": null,
    "pretfaratva": null,
    "tvainclus": false,
    "comisioncumparator": null,
    "referintaexterna": null,
    "images": [
      {
        "src": "https://crm.habitoo.ro/api/public/sites/v1/media/[ID_MASCAT]",
        "tip": "principala",
        "pozitie": 2,
        "modificata": "2026-10-25T10:53:41.957908+00:00",
        "alt": null,
        "width": 750,
        "height": 1000
      },
      {
        "src": "https://crm.habitoo.ro/api/public/sites/v1/media/[ID_MASCAT]",
        "tip": "galerie",
        "pozitie": 0,
        "modificata": "2026-10-25T10:53:41.961991+00:00",
        "alt": null,
        "width": 750,
        "height": 1000
      },
      {
        "src": "https://crm.habitoo.ro/api/public/sites/v1/media/[ID_MASCAT]",
        "tip": "galerie",
        "pozitie": 1,
        "modificata": "2026-10-25T10:53:41.968134+00:00",
        "alt": null,
        "width": 946,
        "height": 1000
      },
      {
        "src": "https://crm.habitoo.ro/api/public/sites/v1/media/[ID_MASCAT]",
        "tip": "galerie",
        "pozitie": 3,
        "modificata": "2026-10-25T10:53:41.973384+00:00",
        "alt": null,
        "width": 750,
        "height": 1000
      },
      {
        "src": "https://crm.habitoo.ro/api/public/sites/v1/media/[ID_MASCAT]",
        "tip": "galerie",
        "pozitie": 4,
        "modificata": "2026-10-25T10:53:41.967251+00:00",
        "alt": null,
        "width": 750,
        "height": 1000
      },
      {
        "src": "https://crm.habitoo.ro/api/public/sites/v1/media/[ID_MASCAT]",
        "tip": "galerie",
        "pozitie": 5,
        "modificata": "2026-10-25T10:53:41.95791+00:00",
        "alt": null,
        "width": 724,
        "height": 1000
      },
      {
        "src": "https://crm.habitoo.ro/api/public/sites/v1/media/[ID_MASCAT]",
        "tip": "galerie",
        "pozitie": 6,
        "modificata": "2026-10-25T10:53:41.980579+00:00",
        "alt": null,
        "width": 773,
        "height": 1000
      },
      {
        "src": "https://crm.habitoo.ro/api/public/sites/v1/media/[ID_MASCAT]",
        "tip": "galerie",
        "pozitie": 7,
        "modificata": "2026-10-25T10:53:41.961771+00:00",
        "alt": null,
        "width": 750,
        "height": 1000
      }
    ],
    "publicare": true,
    "top": false,
    "pole": false,
    "custom1": null,
    "custom2": null,
    "portals": [
      "[IDENTIFICATOR_MASCAT]"
    ],
    "tip": "apartment",
    "suprafata_value": 58,
    "incalzire_value": "Centrală proprie",
    "mobilare_value": null,
    "mobilat_value": null,
    "parcare_value": null,
    "balcon_value": false,
    "utilitati_values": [
      "Curent electric",
      "Canalizare",
      "Apă"
    ],
    "dotari_values": [
      "Aer condiționat"
    ],
    "stadiuconstructie_value": "Finalizată",
    "tipconstructie_value": "Bloc",
    "starefinisaje_value": "Finisat",
    "bucatarie_values": [],
    "eficienta_energetica": null,
    "consum_specific": null,
    "indice_emisii": null,
    "consum_energie_regenerabila": null,
    "energy": {
      "clasa": null,
      "consum": null,
      "emisii": null
    },
    "url": "https://habitoo.ro/oferta/[ID_MASCAT]"
  },
  "api_version": "habitoo-site-feed/1.0"
}
```

## 8. Erori, cache și limite

### Index

| HTTP | Situație | Corp |
| --- | --- | --- |
| 200 | Citire reușită, inclusiv agencies: []. | JSON index. |
| 401 | Cheie invalidă sau integrare fără cheia configurată. | Gol. |
| 429 | Limită de cereri depășită. | Gol. |
| 500 | Eroare la construirea indexului. | Gol. |

### Endpointuri JSON autentificate

| HTTP | Mesaj error / situație |
| --- | --- |
| 200 | Succes, inclusiv liste goale și pagini dincolo de ultima pagină. |
| 400 | Invalid property id. — identificator de detaliu gol sau mai lung de 64 caractere. |
| 401 | Missing API token. — token absent. |
| 401 | Invalid or revoked API token. — token invalid sau agenție absentă din index. |
| 403 | Missing scope: feed:read sau Missing scope: agents:read — drept insuficient. Tokenurile valide ale indexului au drepturile necesare acestor citiri. |
| 404 | Property not found. — ofertă inexistentă, neeligibilă, neautorizată ori agenție în grace. |
| 429 | Too many requests. |
| 500 | Internal error. — eroare în procesarea handlerului. |

Forma JSON a unei erori returnate de wrapper:

```json
{
  "error": "Invalid or revoked API token.",
  "api_version": "habitoo-site-feed/1.0"
}
```

Erorile /media au forma text descrisă în secțiunea 4. O excepție apărută în verificarea autentificării înaintea wrapperului de handler nu are în cod o garanție a aceleiași anvelope JSON; integratorul trebuie să trateze și răspunsuri de eroare non-JSON.

### Limitare și cache

- Index: **120 cereri în 60 secunde**, contor comun indexului Imobiliare+ pentru același IP.
- Endpointurile JSON autentificate: **120 cereri în 60 secunde**, contor comun pe prefixul tokenului și IP, nu câte 120 pentru fiecare endpoint.
- Limiterul este best-effort, local instanței de servire, nu distribuit. Nu este o garanție de debit și nu trebuie folosit ca țintă de trafic.
- /media/{id} nu trece prin acest limiter de autentificare; implementarea rutei nu declară o limită numerică proprie.
- La 429 nu există în acești handleri header Retry-After sau headere de cotă. Integrarea trebuie să trateze codul și să evite reluările în rafală; nu considerați eroarea drept retragere.
- Răspunsurile JSON reușite au Cache-Control: private, max-age=60 și X-Habitoo-API-Version: habitoo-site-feed/1.0. Erorile JSON folosesc no-store. Nu există implementare ETag/Last-Modified ori răspuns condițional 304 în aceste handleri.

## 9. Frecvența citirii

Integrarea este pull: Habitoo nu trimite cereri către Imobiliare+. Recomandăm citirea indexului și a feedului fiecărei agenții la cel mult 15 minute, folosind `datamodificare` pentru a procesa doar ofertele schimbate. Respectați cache-ul de 60 secunde și limita de cereri; folosiți `per_page` până la 200 și reconciliați disparițiile numai la sfârșitul unei citiri complete reușite.

## 10. Corespondența cu modelul vostru actual

| Modelul actual | Echivalentul în feedul Habitoo |
|---|---|
| Webhook insert / update / delete | Citirea indexului și a feedului la cel mult 15 minute; ofertele noi apar în listă, cele modificate au `datamodificare` mai nouă, iar cele retrase nu mai apar (detaliul răspunde 404). |
| Sincronizarea completă de noapte | O citire integrală a tuturor paginilor `/properties` pentru fiecare agenție din index; ofertele care nu mai apar se retrag la voi. |
| Nomenclatoare săptămânale | Nu sunt necesare: fiecare ofertă conține județul și localitatea ca text, plus codurile SIRUTA (`cod_siruta_judet`, `cod_siruta_uat`, `cod_siruta_localitate`) când sunt completate. |

Contact tehnic: contact@habitoo.ro.
