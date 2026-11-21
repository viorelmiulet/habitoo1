import type { BlogFaq } from "@/lib/blog";

/** Articole editoriale publicate pe blog la 21 noiembrie 2026 (inserate prin migrare în blog_posts). */
export type SeedBlogArticle = {
  slug: string; title: string; excerpt: string; category: string; seo_title: string; seo_description: string;
  content: string; faq: BlogFaq[]; legalNote: boolean;
};

export const BLOG_ARTICLES_PUBLISHED_AT = "2026-11-21T20:00:00.000Z";
export const BLOG_ARTICLES_REVISION = "2026-11-21";
export const BLOG_ARTICLES_AUTHOR = "Echipa Habitoo";
export const LEGAL_NOTE = "Acest articol are scop informativ și nu reprezintă consultanță juridică. Pentru situația ta, consultă un avocat.";

const legal = `\n\n---\n\n> **Notă:** ${LEGAL_NOTE}\n`;

export const BLOG_ARTICLES_2026_11: SeedBlogArticle[] = [
{
  slug: "publicare-anunt-pe-mai-multe-portaluri",
  title: "Cum publici același anunț pe mai multe portaluri fără să-l introduci de fiecare dată",
  excerpt: "Scrii anunțul o singură dată, într-un singur loc, și îl trimiți de acolo pe portalurile alese. Vezi ce trebuie pregătit, cum alegi portalurile și cum ții anunțurile la zi.",
  category: "Portaluri",
  seo_title: "Același anunț pe mai multe portaluri, introdus o dată",
  seo_description: "Cum scrii un anunț imobiliar o singură dată și îl publici pe mai multe portaluri: date complete, fotografii, portaluri alese și actualizări fără muncă dublă.",
  legalNote: false,
  content: `Ca să publici același anunț pe mai multe portaluri fără să-l introduci de fiecare dată, îl scrii o singură dată într-un CRM conectat la portaluri și alegi de acolo unde apare. Datele, fotografiile și prețul pleacă din aceeași fișă, iar orice modificare făcută în fișă ajunge pe portalurile bifate. Tu verifici doar ce cere fiecare portal în plus.

## De ce introducerea manuală pe fiecare portal te costă

Fiecare portal are formularul lui, cu câmpuri, liste și limite proprii. Când copiezi același anunț de mână în trei sau patru locuri, repeți aceeași muncă de fiecare dată. Mai grav, anunțurile încep să difere între ele: prețul schimbat pe un portal rămâne vechi pe altul, o fotografie lipsește, descrierea are o greșeală într-un singur loc.

Problemele apar mai ales după publicare:

- prețul se negociază și trebuie schimbat peste tot;
- proprietatea se vinde, iar anunțurile rămân active și aduc telefoane inutile;
- un coleg preia proprietatea și nu știe pe ce portaluri e publicată;
- nu mai știi care este varianta corectă a descrierii.

Un singur loc de adevăr rezolvă aceste probleme. Anunțul există o dată, iar portalurile primesc copii ale aceleiași fișe.

## Pasul 1: o fișă de proprietate completă

Calitatea anunțului de pe portal depinde de fișa din care pleacă. Înainte să publici, verifică:

- **tipul proprietății și tranzacția** (vânzare sau închiriere);
- **prețul și moneda**;
- **localizarea**: localitatea, județul, zona sau sectorul, pentru că multe portaluri le cer obligatoriu;
- **suprafețele, camerele, etajul și anul construcției**;
- **dotările**, alese din liste, nu scrise liber;
- **descrierea**, clară și fără date de contact puse în text.

În [fișa de proprietate din Habitoo](/functionalitati/proprietati) completezi aceste date o singură dată. Câmpurile sunt aceleași indiferent de portal, iar Habitoo le transformă în formatul cerut de fiecare.

### Fotografiile

Alege fotografiile care merg pe portaluri și pune-le în ordinea dorită. Prima fotografie contează cel mai mult, pentru că apare în listele de rezultate. Fotografiile pe care nu vrei să le arăți public, de exemplu cele cu acte sau cu proprietarul, rămân doar în fișă.

## Pasul 2: alegi portalurile

În fila Publicare a proprietății vezi portalurile disponibile pentru agenția ta. Unele se conectează prin contul agenției pe portal, altele primesc anunțurile automat, printr-un flux de date. Lista completă și felul în care se leagă fiecare sunt pe pagina [Integrări](/integrari).

Câteva lucruri de știut când alegi:

- **Fiecare portal are reguli proprii.** De exemplu, la unele etajul este obligatoriu pentru apartamente, la altele sectorul este obligatoriu în București. Habitoo îți arată ce lipsește înainte de trimitere.
- **Unele portaluri au limite de anunțuri** în contul agenției. Dacă limita este atinsă, vezi asta înainte să publici.
- **Promovările plătite** se aleg separat, acolo unde portalul le oferă, de exemplu pe [Imobiliare.ro](/integrari/imobiliare-ro). Habitoo nu cumpără nimic în locul tău.

Bifezi portalurile dorite și salvezi. Trimiterea se face în fundal, deci poți continua lucrul cât timp anunțurile pleacă.

## Pasul 3: urmărești starea pe fiecare portal

După trimitere, fiecare portal răspunde: anunțul este activ, este în procesare sau a fost respins. Dacă un portal refuză anunțul, motivul trebuie să fie vizibil, nu ascuns într-un email. În Habitoo vezi pe fiecare proprietate logo-ul portalurilor, starea lor și linkul spre anunțul publicat.

Când un anunț este respins, de obicei motivul este unul dintre acestea:

1. lipsește un câmp obligatoriu pentru acel portal;
2. fotografiile nu respectă cerințele portalului;
3. contul agenției pe portal nu mai este conectat;
4. s-a atins limita de anunțuri a contului.

Corectezi în fișă și retrimiți. Nu rescrii anunțul pe portal.

## Pasul 4: modificările se fac într-un singur loc

Aici se vede cel mai bine avantajul. Schimbi prețul în fișă, salvezi, iar portalurile bifate primesc actualizarea. Același lucru pentru descriere, fotografii sau suprafață. Nu mai ai variante diferite ale aceluiași anunț.

### Când proprietatea se vinde sau se închiriază

Marchezi proprietatea ca vândută, închiriată sau arhivată, iar Habitoo retrage anunțurile de pe portaluri prin același flux ca la debifarea manuală. Retragerea nu înseamnă republicare automată mai târziu: dacă proprietatea revine pe piață, o publici din nou, conștient.

## Greșeli frecvente la publicarea pe mai multe portaluri

- **Descrieri cu telefonul agentului în text.** Datele de contact se trimit separat. Un număr scris în descriere rămâne acolo și după ce agentul pleacă din agenție.
- **Fotografii prea multe, fără ordine.** Alege imaginile care arată proprietatea, nu toate pozele din telefon.
- **Localizare incompletă.** Un anunț fără zonă apare mai greu în căutările clienților.
- **Același anunț publicat de doi colegi.** Un CRM comun arată dacă proprietatea există deja în agenție.
- **Anunțuri uitate după vânzare.** Retragerea automată la schimbarea stării previne telefoanele inutile.

## Site-ul agenției și alte canale

Pe lângă portaluri, aceeași fișă poate alimenta și alte canale: pagina publică a ofertei, linkul trimis unui client sau prezentarea în PDF. Toate pleacă din aceleași date. Dacă lucrezi cu alte agenții, poți oferi proprietatea și la colaborare, cu comisionul stabilit de tine. Despre asta scriem în articolul [Colaborarea între agenții: cum împărțiți comisionul](/blog/colaborare-intre-agentii-impartirea-comisionului).

Pentru proiecte rezidențiale noi, unitățile se publică după reguli puțin diferite, de exemplu ca investiție pe portalurile care au această secțiune. Detaliile sunt în [Cum vinzi unitățile dintr-un ansamblu rezidențial nou](/blog/cum-vinzi-unitatile-unui-ansamblu-rezidential).

## Ce verifici înainte de primul anunț publicat așa

1. Conturile agenției pe portaluri sunt conectate în Setări.
2. Datele agenției (nume, logo, telefon) sunt completate.
3. Fișa proprietății are localizarea completă.
4. Fotografiile pentru portaluri sunt alese și ordonate.
5. Știi limitele de anunțuri ale fiecărui cont.

După aceste verificări, publicarea devine o bifă, nu o oră de copiat date.

## Cât costă

Publicarea pe portaluri face parte din aplicație, pe toate planurile. Costurile portalurilor, cum ar fi abonamentele sau promovările, rămân separate și se plătesc direct portalului. Prețurile Habitoo sunt pe pagina [Prețuri](/preturi), iar orice agenție nouă începe cu o perioadă de probă gratuită.

## Cum scrii o descriere care merge pe toate portalurile

Aceeași descriere ajunge pe mai multe portaluri, deci trebuie să funcționeze peste tot. Câteva reguli simple:

- **Începe cu ce contează pentru client**: tipul, numărul de camere, zona și un avantaj clar, de exemplu lumina naturală sau apropierea de transport.
- **Scrie în fraze scurte.** Pe telefon, un paragraf lung devine un bloc greu de citit.
- **Nu repeta ce apare deja în câmpuri.** Suprafața și etajul se văd în caracteristici. Folosește descrierea pentru ce nu se vede acolo: compartimentarea, starea, vecinătatea.
- **Evită literele mari și semnele de exclamare repetate.** Unele portaluri le resping, iar clienții le ignoră.
- **Verifică diacriticele și greșelile.** Un text corect transmite seriozitate.

Dacă vrei, Habitoo te poate ajuta să corectezi textul, dar tu aprobi fiecare modificare înainte de salvare. Faptele din anunț, cum ar fi prețul sau suprafața, nu se schimbă fără acordul tău.

## Cine răspunde de publicări în agenție

Când toată echipa lucrează în același sistem, e bine să fie clar cine publică și cine retrage. În multe agenții, agentul responsabil de proprietate se ocupă de publicare, iar administratorul urmărește conturile de pe portaluri și limitele lor. Dacă proprietatea trece la alt agent, publicările active se actualizează cu noul agent, fără să fie șterse și refăcute.

### Republicarea în masă

Uneori trebuie să retrimiți mai multe anunțuri deodată, de exemplu după ce ai reconectat un cont de portal. Republicarea rulează în fundal, iar progresul se vede pe buton. La final primești un raport cu anunțurile trimise și cu cele care au avut probleme.

## Pe scurt

Scrie anunțul o singură dată, într-o fișă completă. Alege portalurile din același loc. Urmărește starea fiecărui portal și corectează în fișă, nu pe portal. Lasă retragerea să se facă automat când proprietatea nu mai este disponibilă. Așa ai aceleași informații peste tot și mai mult timp pentru clienți.`,
  faq: [
    { q: "Pot publica același anunț pe mai multe portaluri fără să-l copiez manual?", a: "Da. Scrii anunțul o singură dată în fișa proprietății din Habitoo și bifezi portalurile dorite în fila Publicare. Fiecare portal primește aceleași date, în formatul cerut de el." },
    { q: "Ce se întâmplă pe portaluri când schimb prețul?", a: "Schimbi prețul în fișa proprietății și salvezi. Portalurile bifate primesc actualizarea, fără să intri pe fiecare portal în parte." },
    { q: "Anunțurile se retrag singure când vând proprietatea?", a: "Da. Când marchezi proprietatea ca vândută, închiriată sau arhivată, anunțurile sunt retrase de pe portaluri. Ele nu se republică automat mai târziu." },
    { q: "De ce a respins un portal anunțul meu?", a: "De obicei lipsește un câmp obligatoriu pentru acel portal, fotografiile nu respectă cerințele lui sau contul agenției a atins limita de anunțuri. Motivul apare pe proprietate, iar corectura o faci în fișă." },
    { q: "Habitoo cumpără promovări pe portaluri?", a: "Nu. Promovările le alegi tu, acolo unde portalul le oferă, iar costul lor se plătește direct portalului. Habitoo nu face cumpărări în locul tău." },
  ],
},
{
  slug: "ce-contine-contractul-de-intermediere-imobiliara",
  title: "Ce trebuie să conțină contractul de intermediere imobiliară",
  excerpt: "Un contract de intermediere clar spune cine sunt părțile, ce proprietate se intermediază, ce face agenția, cât și când se plătește comisionul și cât durează înțelegerea.",
  category: "Contracte",
  seo_title: "Ce conține contractul de intermediere imobiliară",
  seo_description: "Elementele unui contract de intermediere imobiliară: părțile, proprietatea, serviciile agenției, comisionul, durata, exclusivitatea și încetarea contractului.",
  legalNote: true,
  content: `Contractul de intermediere imobiliară trebuie să identifice clar părțile și proprietatea, să descrie ce servicii face agenția, să stabilească comisionul, momentul plății și durata contractului. La acestea se adaugă, după caz, exclusivitatea, condițiile de încetare și felul în care sunt folosite datele personale. Cu cât aceste elemente sunt scrise mai precis, cu atât apar mai puține neînțelegeri la final.

## De ce contează un contract bine scris

Intermedierea imobiliară se bazează pe încredere, dar comisionul se discută de obicei abia la finalul tranzacției. Atunci, fiecare parte își amintește altfel ce s-a stabilit. Un contract scris clar mută discuția la început, când e ușor de purtat, și lasă la final doar verificarea.

Un contract bun ajută în trei situații:

- clientul știe exact ce primește și ce plătește;
- agenția poate arăta ce s-a convenit dacă apare o dispută;
- agenții din echipă lucrează după aceleași reguli, nu după obiceiuri personale.

## 1. Părțile contractului

Contractul începe cu identificarea părților. Pentru o persoană fizică se trec de obicei numele, datele din actul de identitate și adresa. Pentru o firmă se trec denumirea, datele de înregistrare și persoana care o reprezintă. De partea agenției apar datele firmei și, de regulă, agentul care se ocupă de client.

Greșelile de copiere sunt frecvente aici: un nume scris greșit sau o serie de act incompletă. Datele se pot completa din actul de identitate, pentru a evita retranscrierea de mână.

## 2. Proprietatea sau cererea clientului

Dacă agenția vinde sau închiriază o proprietate, contractul o descrie suficient cât să nu existe confuzie: adresa sau localizarea, tipul, suprafața și, unde este cazul, datele din actele proprietății. Dacă agenția caută o proprietate pentru un cumpărător, contractul descrie cererea: tipul căutat, zona, bugetul aproximativ.

## 3. Ce face agenția

Aceasta este partea cel mai des scrisă vag. Formulări precum „agenția se ocupă de vânzare” lasă loc de interpretări. Mai util este să enumerați concret serviciile, de exemplu:

- prezentarea proprietății și publicarea anunțurilor;
- organizarea vizionărilor;
- selectarea clienților interesați;
- sprijin în negociere;
- sprijin la pregătirea documentelor pentru tranzacție.

Contractul poate spune și ce nu face agenția, de exemplu dacă nu oferă servicii juridice sau de evaluare.

## 4. Comisionul

Comisionul are nevoie de cele mai multe detalii:

- **cât este**: procent din preț sau sumă fixă, cu sau fără taxe;
- **cine îl plătește**: vânzătorul, cumpărătorul sau amândoi;
- **când devine datorat**: de exemplu la semnarea unui antecontract sau a contractului final;
- **cum se plătește**: termenul și modalitatea;
- **ce se întâmplă dacă tranzacția se face direct**, cu un client prezentat de agenție, după încheierea contractului.

Ultimul punct este sursa multor dispute. Merită formulat clar și discutat cu clientul la semnare. Despre cum se împarte comisionul când lucrează două agenții pe aceeași tranzacție scriem în [Colaborarea între agenții: cum împărțiți comisionul](/blog/colaborare-intre-agentii-impartirea-comisionului).

## 5. Durata și exclusivitatea

Contractul spune cât timp este valabil și dacă se prelungește. Dacă există exclusivitate, ea trebuie scrisă explicit, împreună cu ce înseamnă în practică: proprietarul nu lucrează cu alte agenții, dar poate sau nu să vândă singur, după cum stabiliți. Exclusivitatea fără o durată clară și fără obligații clare pentru agenție este greu de apărat.

### Reprezentare exclusivă sau intermediere simplă

În practică, agențiile folosesc mai multe tipuri de documente: un contract de reprezentare exclusivă, unul de comision pentru o tranzacție, un contract pentru vizionare. Fiecare are un scop diferit. Nu le amesteca într-un singur text lung, greu de citit.

## 6. Obligațiile clientului

Și clientul are obligații, de exemplu:

- să ofere informații corecte despre proprietate;
- să permită vizionările stabilite;
- să anunțe agenția dacă vinde sau retrage proprietatea;
- să plătească comisionul în condițiile convenite.

## 7. Încetarea contractului

Contractul trebuie să spună cum se încheie: la expirarea duratei, la finalizarea tranzacției sau înainte, prin acordul părților ori prin notificare. Scrieți și ce se întâmplă cu comisionul dacă tranzacția are loc la scurt timp după încetare, cu un client prezentat de agenție.

## 8. Datele personale

Contractul conține date personale, iar agenția le folosește și după semnare, în CRM. Este util să precizați pentru ce sunt folosite datele, cât timp sunt păstrate și cum poate clientul să-și exercite drepturile. Pe larg, în articolul [GDPR pentru agențiile imobiliare: cum păstrezi datele clienților în CRM](/blog/gdpr-agentii-imobiliare-date-clienti-crm).

## 9. Semnătura și data

Contractul se semnează de ambele părți, cu data semnării. Dacă semnați pe ecran, păstrați dovada momentului semnării și varianta semnată a documentului.

## Cum ajută un CRM la contracte

Un contract bun pierde din valoare dacă e greu de găsit sau dacă fiecare agent folosește alt model. În Habitoo, [modulul Contracte](/functionalitati/contracte) oferă cinci tipuri de documente: închiriere, reprezentare exclusivă, comision, comodat și vizionare. Datele agenției, ale agentului, ale clientului și ale proprietății intră automat în text, iar datele clientului se pot completa fotografiind actul de identitate.

Fiecare parte primește un link de semnare pe ecran, iar în aplicație vezi cine a semnat și când. Contractele primesc numere pe fiecare an și tip și stau într-o listă comună. Totuși, textul contractului rămâne responsabilitatea agenției: verifică-l cu un avocat înainte să-l folosești ca model.

## Listă de verificare înainte de semnare

1. Datele părților sunt complete și corecte.
2. Proprietatea sau cererea este descrisă fără ambiguități.
3. Serviciile agenției sunt enumerate concret.
4. Comisionul are valoare, plătitor, moment și termen.
5. Durata și exclusivitatea sunt scrise explicit.
6. Condițiile de încetare sunt clare.
7. Clientul a primit informațiile despre datele personale.
8. Ambele părți au semnat și au primit o copie.

## Cum prezinți contractul clientului

Un contract bun poate speria un client dacă îl primește fără explicații. Câteva obiceiuri ajută:

- **Trimite contractul înainte de întâlnire**, ca clientul să aibă timp să-l citească.
- **Explică pe scurt fiecare secțiune**, mai ales comisionul și durata.
- **Răspunde la întrebări în scris** când clientul cere clarificări, ca să rămână o urmă.
- **Nu grăbi semnarea.** Un client care semnează sub presiune va contesta mai ușor la final.

### Modificările cerute de client

Uneori clientul vrea alt termen sau alt procent. Notează modificarea direct în contract, nu într-un mesaj separat. Un document semnat care nu reflectă înțelegerea reală creează mai multe probleme decât rezolvă.

## Cum păstrezi contractele

Contractele semnate trebuie să poată fi găsite oricând, de oricine din agenție are dreptul să le vadă. Un dosar pe calculatorul unui agent nu e suficient: agentul poate pleca, calculatorul se poate strica. Păstrează contractele într-un loc comun, cu acces limitat la cei care lucrează cu clientul respectiv.

Este util ca fiecare contract să aibă un număr și o dată, ca să poată fi citat ușor într-o discuție sau într-o factură. Numerotarea pe ani și tipuri de contract face evidența mai ușor de urmărit.

## Pe scurt

Un contract de intermediere bun răspunde la cinci întrebări: cine, ce proprietate, ce face agenția, cât și când se plătește, cât durează. Restul sunt detalii care protejează ambele părți. Scrie-le la început, nu la final.${legal}`,
  faq: [
    { q: "Ce trebuie să conțină obligatoriu un contract de intermediere imobiliară?", a: "Identificarea părților și a proprietății, serviciile agenției, comisionul cu momentul plății și durata contractului. Pentru cerințele aplicabile situației tale, verifică textul cu un avocat." },
    { q: "Când devine datorat comisionul agenției?", a: "Momentul se stabilește în contract, de exemplu la semnarea antecontractului sau a contractului final. Important este să fie scris clar, nu presupus." },
    { q: "Ce înseamnă exclusivitatea într-un contract de intermediere?", a: "De regulă, proprietarul lucrează doar cu o agenție pe o perioadă stabilită. Ce poate face proprietarul în acest timp și ce obligații are agenția trebuie scrise explicit în contract." },
    { q: "Pot semna contractul de intermediere pe ecran?", a: "În Habitoo poți trimite fiecărei părți un link de semnare pe ecran și vezi cine a semnat și când. Dacă semnătura pe ecran este potrivită pentru situația ta, verifică cu un avocat." },
    { q: "Habitoo oferă modele de contract verificate juridic?", a: "Habitoo oferă cinci tipuri de documente completate automat din datele clientului și ale proprietății. Textul rămâne responsabilitatea agenției și este bine să fie verificat de un avocat." },
  ],
},
{
  slug: "gdpr-agentii-imobiliare-date-clienti-crm",
  title: "GDPR pentru agențiile imobiliare: cum păstrezi datele clienților în CRM",
  excerpt: "Păstrezi datele clienților în CRM doar pentru un scop clar, cu acces limitat la cine are nevoie, cu sursa și acordul notate și cu posibilitatea de a le corecta sau șterge.",
  category: "Date și confidențialitate",
  seo_title: "GDPR în agenția imobiliară: datele clienților în CRM",
  seo_description: "Cum păstrezi datele clienților în CRM-ul agenției imobiliare conform GDPR: scop clar, date minime, acces pe roluri, sursa și acordul, retragerea și ștergerea.",
  legalNote: true,
  content: `Ca agenție imobiliară, păstrezi datele clienților în CRM conform GDPR atunci când le colectezi pentru un scop clar, păstrezi doar ce îți trebuie, limitezi accesul la colegii care au nevoie de ele și notezi de unde vin și ce acord ai. Clientul trebuie să poată afla ce date ai despre el și să ceară corectarea sau ștergerea lor. Un CRM bine folosit face aceste reguli mai ușor de respectat decât fișierele împrăștiate.

## De ce contează GDPR într-o agenție imobiliară

O agenție lucrează zilnic cu date personale: nume, telefoane, emailuri, adrese, uneori date din actele de identitate, preferințe de cumpărare și bugete. Aceste date circulă între agenți, ajung în contracte, în mesaje și în tabele. Fiecare copie necontrolată este un risc.

GDPR nu interzice folosirea datelor. Cere ca folosirea lor să aibă un temei, să fie transparentă și să fie protejată. Pentru o agenție, asta se traduce în câteva obiceiuri de lucru.

## Principiile, pe înțelesul agenției

### Scop clar

Strângi datele unui client pentru că vrei să-l ajuți să cumpere, să vândă sau să închirieze. Acesta este scopul. Folosirea acelorași date pentru altceva, de exemplu pentru campanii de marketing, are nevoie de un temei separat, de obicei de un acord explicit.

### Date minime

Notează doar ce îți trebuie. Pentru un cumpărător sunt utile numele, un mod de contact și cerințele lui. Nu ai nevoie de date din actul de identitate până când nu semnezi un contract cu el.

### Acces limitat

Nu toți colegii au nevoie de toate datele. Un agent nou nu trebuie să vadă automat toți clienții agenției, iar datele proprietarului nu trebuie să ajungă la agențiile partenere.

### Păstrare limitată

Datele nu se țin la nesfârșit. Stabilește în agenție cât timp păstrezi clienții inactivi și ce faci cu ei apoi.

### Securitate

Datele stau într-un sistem cu cont personal pentru fiecare agent, nu în fișiere trimise pe email sau în grupuri de mesaje.

## Unde se pierd de obicei datele

- **Tabele partajate** copiate pe mai multe calculatoare.
- **Telefoane personale** ale agenților, cu clienții salvați doar acolo.
- **Agenți care pleacă** și iau cu ei lista de clienți.
- **Mesaje cu poze ale actelor** trimise între colegi.
- **Anunțuri cu datele proprietarului** scrise direct în descriere.

Un CRM comun nu rezolvă singur aceste probleme, dar îți oferă un loc unde datele pot fi controlate.

## Cum organizezi datele clienților în CRM

### 1. Notează sursa și acordul

Pentru fiecare contact este util să știi de unde vine: a sunat la un anunț, a completat un formular, a fost recomandat. Dacă ai acordul lui pentru comunicări de marketing, notează când l-ai primit, de la ce agent și în ce mod. Dacă își retrage acordul, istoricul trebuie să arate asta.

În [modulul Contacte din Habitoo](/functionalitati/contacte), sursa contactului se completează automat, iar acordul se înregistrează cu dată, agent și mod de obținere. Retragerea acordului rămâne în istoric. O ofertă cerută explicit de client poate fi trimisă în continuare, pentru că face parte din serviciul solicitat.

### 2. Stabilește roluri

Agenții, managerii și administratorii au nevoi diferite. Rolurile din [Echipă și roluri](/functionalitati/echipa-si-roluri) stabilesc cine vede și cine poate modifica date. Un agent lucrează cu clienții și proprietățile lui, iar administratorul agenției are o imagine de ansamblu.

### 3. Ține actele de identitate separat

Datele din actul de identitate sunt necesare la contracte, nu la fiecare discuție. În Habitoo, datele de identificare ale clienților din contracte sunt păstrate criptat, iar contractele sunt vizibile doar celor care au acces la ele. Fotografia actului nu trebuie să circule prin mesaje.

### 4. Nu expune proprietarul

Când oferi o proprietate la colaborare altor agenții, partenerii nu văd proprietarul, telefonul lui sau notele interne. La fel, pe pagina publică a ofertei nu apar date ale proprietarului. Detalii despre colaborare găsești în [Colaborarea între agenții: cum împărțiți comisionul](/blog/colaborare-intre-agentii-impartirea-comisionului).

### 5. Șterge ce nu mai trebuie

Când un client cere ștergerea datelor sau când termenul de păstrare a trecut, îl ștergi. În Habitoo, ștergerea unui lead se face controlat: lead-ul dispare din listele agenției, iar refacerea sau ștergerea definitivă este o operație separată, rezervată administratorului platformei.

## Drepturile clientului, în practică

Un client poate întreba ce date ai despre el, poate cere corectarea lor, poate cere ștergerea sau poate să se opună folosirii lor pentru marketing. Pregătește-te dinainte:

1. Știi în ce locuri se află datele lui: CRM, contracte, emailuri.
2. Poți găsi rapid fișa lui după nume, telefon sau email.
3. Ai o persoană în agenție care răspunde la astfel de cereri.
4. Notezi cererea și răspunsul dat.

## Când schimbi CRM-ul

Mutarea datelor dintr-un sistem în altul este un moment sensibil. Exportul cu toți clienții ajunge în fișiere care trebuie protejate și șterse după import. Mai multe despre mutare în [Cum treci la un CRM nou fără să pierzi anunțurile și clienții](/blog/cum-treci-la-un-crm-nou-fara-sa-pierzi-date).

## Furnizorul de CRM

Când folosești un CRM, furnizorul prelucrează datele în numele agenției. Citește [politica de confidențialitate](/politica-de-confidentialitate) și termenii furnizorului și află unde sunt păstrate datele și cine are acces la ele.

## Listă de verificare pentru agenție

- Fiecare agent are cont propriu, fără conturi comune.
- Sursa fiecărui contact este notată.
- Acordul de marketing are dată, agent și mod de obținere.
- Rolurile limitează accesul la ce are nevoie fiecare.
- Actele de identitate nu circulă prin mesaje.
- Datele proprietarului nu apar în anunțuri sau la parteneri.
- Există o regulă pentru ștergerea clienților inactivi.
- Cineva răspunde la cererile clienților despre datele lor.

## Informarea clientului

Clientul trebuie să afle, pe înțelesul lui, ce date îi folosești și de ce. Nu ai nevoie de un text lung citit la telefon. Ajută:

- o informare scurtă trimisă după primul contact;
- un link spre politica de confidențialitate a agenției;
- o secțiune despre date personale în contractele semnate.

Informarea trebuie să spună cine este agenția, pentru ce folosește datele, cât timp le păstrează și cum poate fi contactată pentru întrebări.

## Formulare și anunțuri

Mulți clienți ajung la agenție prin formulare de pe site sau prin anunțuri. Fiecare formular trebuie să spună scurt ce se întâmplă cu datele trimise. Dacă formularul are o bifă pentru noutăți sau oferte, ea trebuie lăsată nebifată, iar clientul o bifează singur.

### Agenții care pleacă

Când un agent pleacă din agenție, contul lui se dezactivează, iar clienții și proprietățile lui se mută la alt coleg. Datele rămân la agenție, nu pleacă pe telefonul agentului. Planifică această mutare dinainte, ca să nu rămână clienți fără agent.

## Pe scurt

GDPR, pentru o agenție imobiliară, înseamnă obiceiuri de lucru: scop clar, date puține, acces limitat, sursa și acordul notate, ștergere când nu mai e nevoie. Un CRM comun te ajută să le aplici la fel pentru toți agenții.${legal}`,
  faq: [
    { q: "Pot păstra datele unui client după ce tranzacția s-a încheiat?", a: "Poți păstra datele cât timp ai un temei și un scop, de exemplu obligații legale sau un serviciu în curs. Stabilește în agenție o perioadă de păstrare și verifică cu un avocat ce se aplică situației tale." },
    { q: "Am nevoie de acordul clientului ca să-l trec în CRM?", a: "Pentru a-l ajuta la cererea lui, de obicei temeiul este chiar serviciul cerut. Pentru comunicări de marketing ai nevoie, de regulă, de un acord separat, pe care este bine să-l notezi cu dată și mod de obținere." },
    { q: "Cum notez acordul de marketing în Habitoo?", a: "În fișa contactului, acordul se înregistrează cu data, agentul și modul în care a fost obținut. Dacă clientul îl retrage, retragerea rămâne în istoric." },
    { q: "Agențiile partenere văd datele proprietarului?", a: "Nu. La colaborarea din Habitoo, partenerii văd datele de prezentare ale proprietății, nu proprietarul, telefonul lui sau notele interne." },
    { q: "Ce fac dacă un client cere ștergerea datelor?", a: "Găsești fișa lui, verifici unde mai apar datele lui și le ștergi, cu excepția celor pe care trebuie să le păstrezi legal. Notează cererea și răspunsul dat." },
  ],
},
{
  slug: "cum-vinzi-unitatile-unui-ansamblu-rezidential",
  title: "Cum vinzi unitățile dintr-un ansamblu rezidențial nou",
  excerpt: "Unitățile dintr-un ansamblu se vând mai ușor când ansamblul are o fișă proprie, fiecare unitate are anunțul ei și alegi portalurile potrivite proiectului.",
  category: "Ansambluri rezidențiale",
  seo_title: "Cum vinzi unitățile unui ansamblu rezidențial nou",
  seo_description: "Cum organizezi vânzarea unităților dintr-un ansamblu rezidențial nou: fișa proiectului, unități cu anunț propriu, portaluri alese per ansamblu și stări la zi.",
  legalNote: false,
  content: `Unitățile dintr-un ansamblu rezidențial nou se vând mai ușor când proiectul are o fișă proprie, fiecare apartament disponibil are anunțul lui, iar disponibilitatea este ținută la zi pe toate canalele. Alegi portalurile potrivite proiectului, publici unitățile împreună cu ansamblul și retragi imediat ce se vinde sau se rezervă. Așa clienții văd o ofertă corectă, iar echipa nu pierde timp cu unități deja vândute.

## De ce vânzarea unui ansamblu e diferită

O proprietate obișnuită are un singur anunț. Un ansamblu are zeci de unități, cu planuri, etaje și prețuri diferite, care se vând pe parcursul mai multor luni. În plus, clientul nu cumpără doar un apartament, ci și proiectul: locația, dezvoltatorul, termenul de finalizare, facilitățile.

Asta aduce provocări specifice:

- multe unități de publicat și de ținut la zi;
- prețuri care se schimbă pe etape de vânzare;
- unități rezervate care trebuie scoase repede din ofertă;
- portaluri care au o secțiune separată pentru proiecte noi;
- mai mulți agenți care lucrează pe același proiect.

## 1. Fișa ansamblului

Începe cu o fișă a proiectului, separată de unități. Aici pui ce este comun tuturor apartamentelor:

- numele și localizarea ansamblului;
- descrierea proiectului și facilitățile;
- stadiul construcției și termenul estimat;
- fotografiile și randările proiectului;
- datele dezvoltatorului, dacă sunt publice.

În Habitoo, [fișa ansamblului](/functionalitati/ansambluri-rezidentiale) adună aceste date într-un singur loc, iar unitățile se leagă de ea.

## 2. Unitățile, fiecare cu anunțul ei

Fiecare unitate disponibilă primește o fișă proprie, cu suprafețe, camere, etaj, preț și fotografii sau planuri. Clientul caută după criteriile lui: număr de camere, buget, etaj. O singură listă generică „apartamente de la 2 la 4 camere” nu răspunde la aceste căutări.

### Unitățile ca copii, nu ca mutări

O regulă utilă: când aloci un anunț existent unui ansamblu, creezi o copie nouă a lui, cu referință proprie. Originalul rămâne neschimbat, cu portalurile și publicările lui. În Habitoo, alocarea la ansamblu funcționează exact așa: selectezi anunțurile din lista de proprietăți și alegi „Alocă la ansamblu”. Se creează copii noi, cu fotografii proprii, legate de ansamblu.

La volume mari, alocarea rulează în fundal, iar la final primești o notificare cu numărul de copii create și cele sărite. Aceeași unitate nu se copiază de două ori în același ansamblu.

## 3. Alegi portalurile pentru proiect

Nu orice portal este potrivit pentru orice proiect. Unele portaluri au o secțiune dedicată proiectelor noi, unde ansamblul apare ca investiție, cu unitățile sub el. Altele primesc unitățile ca anunțuri obișnuite.

În Habitoo, fiecare ansamblu are lista lui de portaluri, aleasă în fila Publicare. Pe [Storia](/integrari/storia), unitățile se publică în contul de dezvoltator, ca unități ale investiției, nu ca anunțuri separate în contul agenției. Unitățile noi alocate ansamblului primesc doar portalurile bifate pentru el. Când debifezi un portal la nivel de ansamblu, unitățile sunt retrase de pe el printr-o operație în fundal.

## 4. Ține disponibilitatea la zi

Cel mai mare risc la vânzarea unui ansamblu este oferta veche: clientul sună pentru un apartament deja vândut. Stabilește o regulă simplă în echipă: unitatea rezervată sau vândută se marchează în ziua respectivă.

Când marchezi o unitate ca vândută, anunțurile ei sunt retrase de pe portaluri. Pentru situațiile temporare, cum ar fi o rezervare care poate cădea, poți retrage unitatea de pe portaluri fără să o scoți din ansamblu. În tabul „Unități” al ansamblului, selectezi mai multe unități și alegi „Retrage de pe portaluri”. Unitățile retrase nu se republică automat, iar când revin în ofertă folosești „Republică”.

### Vezi dintr-o privire ce e publicat

O coloană de publicare pe fiecare unitate îți arată dacă este publicată, pe câte portaluri, sau dacă a fost retrasă. Nu mai trebuie să verifici fiecare portal.

## 5. Prețurile pe etape

Mulți dezvoltatori schimbă prețurile pe etape de vânzare. Dacă prețul se modifică în fișa unității, portalurile bifate primesc actualizarea. Pentru schimbări pe multe unități, lucrează pe rând dar din același loc, nu pe fiecare portal.

## 6. Echipa pe același proiect

Când mai mulți agenți vând același ansamblu, e important ca fiecare client să fie notat o singură dată și ca fiecare să știe ce unități mai sunt disponibile. Cererile clienților se pot potrivi automat cu unitățile disponibile, iar activitățile rămân notate pe fiecare client. Despre organizarea echipei pe proiect vezi și [Cum publici același anunț pe mai multe portaluri](/blog/publicare-anunt-pe-mai-multe-portaluri).

## 7. Prezentarea către client

Clientul vrea să compare unitățile între ele. Trimite-i un link cu unitățile potrivite cererii lui sau o prezentare a unității, cu planul și prețul. Contractele de rezervare sau de intermediere se pot genera din aceleași date. Ce ar trebui să conțină un astfel de contract găsești în [Ce trebuie să conțină contractul de intermediere imobiliară](/blog/ce-contine-contractul-de-intermediere-imobiliara).

## Greșeli frecvente

- **Un singur anunț pentru tot proiectul.** Clientul nu găsește apartamentul care i se potrivește.
- **Unități vândute rămase publicate.** Telefoanele inutile consumă timpul echipei.
- **Publicarea proiectului pe portaluri nepotrivite.** Un proiect premium nu arată bine lângă anunțuri vechi și incomplete.
- **Modificarea anunțului original.** Mutarea unui anunț existent în proiect îi schimbă istoricul și publicările.
- **Fotografii comune pe toate unitățile.** Măcar planul fiecărei unități ar trebui să fie al ei.

## Listă de verificare pentru lansare

1. Fișa ansamblului este completă, cu fotografii și descriere.
2. Fiecare unitate disponibilă are fișă proprie cu plan și preț.
3. Portalurile ansamblului sunt alese.
4. Contul de dezvoltator pe portalurile care îl cer este conectat.
5. Echipa știe cine marchează rezervările și vânzările.

## Scoaterea unităților din ansamblu

Uneori o unitate nu mai face parte din ofertă: proiectul se schimbă, dezvoltatorul retrage apartamentul sau unitatea a fost adăugată greșit. În tabul „Unități” poți selecta unitățile și alege „Scoate din ansamblu”. Copia se șterge și se retrage de pe portaluri, iar anunțul original rămâne neatins.

## Lista de proprietăți rămâne curată

Când ai zeci de unități în ansambluri, lista obișnuită de proprietăți se poate aglomera. În Habitoo, unitățile din ansambluri nu apar implicit în lista de proprietăți. Le afișezi când ai nevoie, cu bifa „Afișează anunțuri din ansambluri”, și poți filtra un ansamblu anume. Căutarea după referința exactă găsește oricum unitatea.

### Legătura dintre original și copie

Pe copie vezi din ce anunț provine, iar pe original vezi în ce ansamblu a fost copiat, cu link spre copie. Astfel nu se pierde legătura dintre cele două, chiar dacă sunt publicate diferit.

## Comunicarea cu dezvoltatorul

Agenția și dezvoltatorul trebuie să aibă aceeași imagine asupra disponibilității. Stabiliți cum vă anunțați rezervările, cât de des verificați lista de unități și cine confirmă prețurile noi. O listă de unități ținută la zi într-un singur loc este baza acestei comunicări.

## Pe scurt

Tratează ansamblul ca proiect și unitățile ca anunțuri separate. Alege portalurile pentru proiect, nu pentru fiecare unitate. Retrage repede ce nu mai e disponibil. Detaliile despre planuri și costuri sunt pe pagina [Prețuri](/preturi).`,
  faq: [
    { q: "Fiecare apartament dintr-un ansamblu trebuie să aibă anunțul lui?", a: "Este recomandat. Clienții caută după camere, buget și etaj, iar un anunț separat pentru fiecare unitate disponibilă răspunde mai bine acestor căutări decât un anunț general al proiectului." },
    { q: "Ce se întâmplă cu anunțul original când îl aloc unui ansamblu în Habitoo?", a: "Rămâne neschimbat. Alocarea creează o copie nouă, cu referință și fotografii proprii, legată de ansamblu. Originalul își păstrează portalurile și publicările." },
    { q: "Cum apar unitățile pe Storia?", a: "Unitățile din ansambluri se publică în contul de dezvoltator Storia, ca unități ale investiției, nu ca anunțuri separate în contul agenției." },
    { q: "Pot alege pe ce portaluri apare un ansamblu?", a: "Da. Fiecare ansamblu are lista lui de portaluri în fila Publicare, iar unitățile noi primesc doar portalurile bifate pentru el." },
    { q: "Cum scot temporar o unitate rezervată din ofertă?", a: "În tabul Unități selectezi unitatea și alegi Retrage de pe portaluri. Rămâne în ansamblu, nu se republică automat, iar când revine în ofertă folosești Republică." },
  ],
},
{
  slug: "colaborare-intre-agentii-impartirea-comisionului",
  title: "Colaborarea între agenții: cum împărțiți comisionul",
  excerpt: "Comisionul dintr-o colaborare se împarte după o înțelegere stabilită înainte de vizionare: cine are proprietatea, cine aduce clientul, ce procent primește fiecare și când se plătește.",
  category: "Colaborare",
  seo_title: "Colaborarea între agenții: cum împărțiți comisionul",
  seo_description: "Cum împart două agenții comisionul într-o colaborare imobiliară: înțelegerea de dinainte de vizionare, procentul oferit, cine încasează, protecția clientului.",
  legalNote: false,
  content: `Două agenții care colaborează împart comisionul după o înțelegere stabilită înainte de prima vizionare: agenția care are proprietatea spune ce comision oferă, iar agenția care aduce clientul acceptă sau negociază. Înțelegerea trebuie să precizeze procentul sau suma, cine încasează de la client și când se face plata către partener. Scrisă la început, ea previne cele mai multe dispute.

## De ce colaborează agențiile

O agenție are proprietatea, alta are cumpărătorul. Fără colaborare, fiecare așteaptă să găsească singură perechea lipsă. Cu colaborare, proprietatea ajunge la mai mulți clienți, iar clientul vede mai multe proprietăți. Proprietarul vinde mai repede, clientul cumpără mai repede, iar ambele agenții câștigă un comision, chiar dacă mai mic decât întregul.

## Cine e cine într-o colaborare

- **Agenția care are proprietatea** a semnat cu proprietarul și încasează de obicei comisionul de la el.
- **Agenția care aduce clientul** lucrează cu cumpărătorul sau chiriașul și poate avea propria înțelegere cu el.

Împărțirea comisionului depinde de cine încasează de la cine. Situațiile cele mai întâlnite:

1. Fiecare agenție încasează de la clientul ei și nu se împarte nimic.
2. Agenția proprietății încasează de la proprietar și oferă partenerului un procent din acest comision.
3. Ambele agenții încasează și își împart o parte după o regulă stabilită.

Nu există o regulă unică. Contează ca ambele părți să știe care variantă se aplică, înainte de vizionare.

## Ce trebuie stabilit înainte

### Comisionul oferit

Agenția care are proprietatea spune ce oferă partenerului: un procent din preț, un procent din comisionul ei sau o sumă fixă. Formularea trebuie să fie fără ambiguitate. „2%” poate însemna 2% din preț sau 2% din comision, iar diferența e mare.

### Momentul plății

Partenerul primește comisionul când agenția proprietății îl încasează, la o anumită etapă a tranzacției sau la o dată fixă? Scrieți asta clar.

### Ce se întâmplă dacă tranzacția cade

Dacă tranzacția nu se finalizează, de obicei nu se plătește nimic. Dar dacă un avans rămâne la agenție, cum se împarte? Puțini se gândesc la asta până nu se întâmplă.

### Protecția clientului

Agenția care aduce clientul vrea să fie sigură că acesta nu va fi „preluat” de cealaltă agenție. Agenția proprietății vrea să fie sigură că proprietarul nu va fi contactat direct. O regulă simplă: fiecare își păstrează clientul și nu îl contactează pe al celuilalt.

## Cum arată colaborarea în Habitoo

În Habitoo, [colaborarea între agenții](/colaborare-intre-agentii) funcționează ca un spațiu comun al agențiilor din platformă care au colaborarea pornită.

- **Agenția proprietății alege comisionul.** În fila Publicare, colaborarea apare ca un portal: o activezi, scrii comisionul oferit ca procent și, opțional, condițiile.
- **Comision standard pe agenție.** Agenția poate avea un comision implicit, folosit când agentul nu scrie altul. Administratorul poate activa colaborarea automat pentru proprietățile active, iar dacă un agent o oprește pe o proprietate, alegerea lui este respectată.
- **Partenerul vede doar ce trebuie.** Agențiile partenere văd datele de prezentare, fotografiile marcate pentru publicare, comisionul și condițiile. Nu văd proprietarul, telefonul lui sau notele interne.
- **Clientul rămâne al tău.** Când trimiți o propunere, partenerul vede doar ce scrii în ea, nu fișa clientului. Propunerea are o stare și o discuție proprie între cele două agenții.

Colaborarea din Habitoo nu încasează și nu împarte comisionul. Procentul afișat este oferta agenției, iar înțelegerea finală rămâne între cele două agenții.

### O ofertă neutră pentru partener

Uneori vrei să trimiți unui coleg din altă agenție o ofertă fără să arăți numele agenției tale. Habitoo poate genera un link neutru pentru colaborator, cu un cod care poate fi revocat. Comisionul apare doar în mesajul trimis, nu pe pagina ofertei.

## Evidența comisioanelor în agenție

După tranzacție, comisionul trebuie împărțit și în interiorul agenției, între agenți. [Comisioanele din Habitoo](/comisioane-agenti-imobiliari) se trec manual, cu moneda dorită și cursul de la data tranzacției. Administratorul agenției poate aloca sume agenților, iar alocările lui rămân doar de citit pentru agenți. Rapoartele și exporturile respectă filtrele și drepturile fiecăruia.

## Greșeli care strică o colaborare

- **Comision discutat doar verbal**, după vizionare.
- **Procent fără bază** de calcul: din preț sau din comision.
- **Datele proprietarului trimise partenerului**, care apoi îl contactează direct.
- **Clientul prezentat fără propunere scrisă**, iar mai târziu nu se știe cine l-a adus primul.
- **Lipsa unui contract de colaborare** când tranzacțiile sunt frecvente între aceleași agenții.

## Un contract de colaborare

Dacă lucrezi des cu aceeași agenție, merită un contract-cadru de colaborare, care stabilește regulile o singură dată. Ce elemente ar trebui să aibă un contract imobiliar găsești în [Ce trebuie să conțină contractul de intermediere imobiliară](/blog/ce-contine-contractul-de-intermediere-imobiliara). Pentru partea juridică, consultă un avocat.

## Datele clienților între agenții

Colaborarea înseamnă că date despre proprietăți și clienți trec dintr-o agenție în alta. Trimite doar ce e necesar. Mai multe despre asta în [GDPR pentru agențiile imobiliare](/blog/gdpr-agentii-imobiliare-date-clienti-crm).

## Listă de verificare pentru o colaborare

1. Știi cine încasează de la cine.
2. Comisionul are bază de calcul clară.
3. Momentul plății către partener este stabilit.
4. Ce se întâmplă dacă tranzacția cade este discutat.
5. Fiecare agenție își păstrează clientul.
6. Înțelegerea este scrisă, chiar și pe scurt.

## Cum găsești oferte de la parteneri

În secțiunea Colaborare vezi ofertele agențiilor participante, cu filtre după oraș, tip, vânzare sau închiriere, preț, camere, suprafață și agenție. Poți sorta după cele mai noi, după preț sau după comisionul cel mai mare. Apar doar proprietăți active, rezervate sau în negociere, deci nu pierzi timp cu oferte închise.

Când găsești o proprietate potrivită pentru clientul tău, trimiți o propunere. Agenția parteneră o acceptă, programează vizionarea sau o refuză, iar starea se vede de ambele părți.

## Comunicarea pe durata colaborării

O colaborare durează de la prima propunere până la semnarea tranzacției. Pe acest drum apar întrebări despre vizionări, documente sau negociere. Păstrați discuția legată de propunere, nu împrăștiată în mesaje personale. Astfel oricine din agenție poate vedea ce s-a stabilit, chiar dacă agentul inițial lipsește.

### Când negocierea schimbă comisionul

Dacă prețul scade în negociere și comisionul este un procent din preț, suma pentru partener scade și ea. Dacă ați stabilit o sumă fixă, ea rămâne aceeași. Discutați această situație la început, ca să nu apară surprize la final.

## Colaborarea și analiza de piață

Ofertele deschise colaborării de partenerii tăi pot intra ca sursă în [analiza comparativă de piață](/analiza-comparativa-de-piata), alături de proprietățile agenției și de ofertele de piață. Astfel, colaborarea te ajută și când stabilești prețul unei proprietăți, nu doar când cauți un client. O agenție care oprește colaborarea nu își mai arată proprietățile și nu mai vede nici ofertele celorlalte.

## Pe scurt

O colaborare bună începe cu o înțelegere clară: cine are proprietatea, cine aduce clientul, ce primește fiecare și când. Scrie-o înainte de vizionare și păstrează datele proprietarului și ale clientului la agenția care le are. Planurile Habitoo sunt pe pagina [Prețuri](/preturi).`,
  faq: [
    { q: "Cum se împarte de obicei comisionul între două agenții?", a: "Nu există o regulă unică. Agenția care are proprietatea spune ce comision oferă partenerului, iar cele două agenții stabilesc înainte de vizionare baza de calcul și momentul plății." },
    { q: "Cine stabilește comisionul de colaborare în Habitoo?", a: "Agenția care are proprietatea: un procent pe fiecare proprietate sau un comision standard al agenției, folosit când agentul nu scrie altul." },
    { q: "Habitoo încasează sau împarte comisionul între agenții?", a: "Nu. Procentul afișat este oferta agenției, iar înțelegerea finală și plata rămân între cele două agenții." },
    { q: "Agenția parteneră vede datele proprietarului?", a: "Nu. Partenerii văd datele de prezentare ale proprietății, fotografiile marcate pentru publicare, comisionul și condițiile, nu proprietarul, telefonul lui sau notele interne." },
    { q: "Am nevoie de un contract de colaborare între agenții?", a: "Dacă lucrați des împreună, un contract-cadru stabilește regulile o singură dată și reduce disputele. Pentru conținutul lui, consultă un avocat." },
  ],
},
{
  slug: "cum-treci-la-un-crm-nou-fara-sa-pierzi-date",
  title: "Cum treci la un CRM nou fără să pierzi anunțurile și clienții",
  excerpt: "Treci la un CRM nou fără pierderi dacă faci inventarul datelor, exporți tot din sistemul vechi, imporți într-o previzualizare, verifici și abia apoi oprești vechiul sistem.",
  category: "Organizare",
  seo_title: "Cum treci la un CRM nou fără să pierzi date",
  seo_description: "Pașii pentru a trece la un CRM imobiliar nou fără să pierzi anunțuri și clienți: inventar, export, import cu previzualizare, verificare și tranziție.",
  legalNote: false,
  content: `Treci la un CRM nou fără să pierzi anunțurile și clienții dacă faci întâi un inventar al datelor, exporți tot ce poți din sistemul vechi, imporți într-o previzualizare și verifici înainte să confirmi. Păstrezi sistemul vechi accesibil o perioadă, până te asiguri că nimic nu lipsește. Publicările pe portaluri le pornești abia după verificare.

## De ce agențiile amână schimbarea

Mutarea pare riscantă: anunțuri cu fotografii, clienți cu istoric, publicări pe portaluri. Agenții se tem că vor pierde ce au construit în ani. Riscul real nu e mutarea, ci mutarea făcută în grabă, fără plan.

## Pasul 1: inventarul datelor

Înainte de orice export, notează ce ai în sistemul actual:

- **proprietăți**: active, vândute, arhivate, cu fotografii;
- **clienți și contacte**: proprietari, cumpărători, chiriași;
- **cereri**: ce caută fiecare client;
- **activități**: vizionări, apeluri, notițe;
- **documente**: contracte, acte;
- **publicări**: pe ce portaluri apare fiecare anunț.

Decide ce mută și ce nu. Proprietățile vândute de mult timp sau clienții inactivi pot rămâne în arhiva sistemului vechi.

## Pasul 2: exportul

Află ce formate de export oferă sistemul vechi și ce conțin. Unele exporturi includ fotografiile, altele doar linkuri. Unele includ proprietarii, altele nu. Verifică:

1. dacă exportul conține toate câmpurile importante;
2. dacă fotografiile sunt incluse sau accesibile;
3. dacă fiecare proprietate are un cod unic;
4. dacă poți exporta din nou, mai târziu, pentru actualizări.

Fișierele exportate conțin date personale. Păstrează-le într-un loc protejat și șterge-le după import. Detalii în [GDPR pentru agențiile imobiliare](/blog/gdpr-agentii-imobiliare-date-clienti-crm).

## Pasul 3: importul, cu previzualizare

Un import bun începe cu o previzualizare: vezi câte proprietăți vor intra, ce câmpuri s-au potrivit și ce trebuie completat de mână. Nu confirma un import fără să vezi rezultatul.

În Habitoo, [importul de proprietăți](/import-proprietati) se face de echipa Habitoo pentru agenția ta, dintr-un format de export acceptat. Proprietățile sunt atribuite agentului ales și intră cu fotografii, caracteristici și locație. Înainte de confirmare există o previzualizare.

### Fără dubluri

Fiecare proprietate e recunoscută după codul ei din sistemul vechi. Dacă importi din nou același export, proprietățile existente se actualizează în loc să fie create a doua oară, iar fotografiile deja preluate nu se mai adaugă. Poți deci face un prim import, să lucrezi în paralel o perioadă și să actualizezi apoi.

### Ce nu se preia automat

Importul nu preia proprietarii și datele lor de contact. Contactele le treci în Habitoo cu sursa și acordul lor, ca să știi de unde vine fiecare.

## Pasul 4: verificarea

După import, verifică pe un eșantion de proprietăți:

- prețul și moneda;
- localizarea: localitate, județ, zonă sau sector;
- suprafețele și camerele;
- ordinea fotografiilor;
- tipul de tranzacție.

Unele câmpuri pot rămâne necompletate, de exemplu un etaj cu un cod necunoscut. Proprietățile fără județ sau, în București, fără sector trebuie completate înainte de publicarea pe portalurile care le cer.

## Pasul 5: publicările pe portaluri

Importul nu publică nimic pe portaluri. Asta e intenționat: vrei să verifici întâi. Conectezi conturile agenției pe portaluri, apoi publici proprietățile din fila Publicare. Cum funcționează publicarea pe mai multe portaluri din același loc găsești în [Cum publici același anunț pe mai multe portaluri](/blog/publicare-anunt-pe-mai-multe-portaluri).

Atenție la anunțurile deja publicate din sistemul vechi. Dacă publici din nou din Habitoo fără să le retragi pe cele vechi, același anunț poate apărea de două ori pe portal. Stabilește proprietate cu proprietate cine o publică.

## Pasul 6: echipa

Un CRM nou e util doar dacă îl folosește toată echipa. Planifică:

1. **Conturi pentru fiecare agent**, cu rolul potrivit. Vezi [Echipă și roluri](/functionalitati/echipa-si-roluri).
2. **O zi de început** după care noile proprietăți și clienți se trec doar în sistemul nou.
3. **O persoană de contact** pentru întrebări în primele săptămâni.
4. **Ghidurile din aplicație**, care arată pașii principali în context.

## Pasul 7: perioada de tranziție

Nu închide sistemul vechi a doua zi. Păstrează-l accesibil, doar pentru consultare, până te asiguri că:

- toate proprietățile active sunt în noul CRM;
- clienții activi sunt trecuți;
- anunțurile de pe portaluri sunt publicate din noul sistem;
- echipa lucrează doar în sistemul nou.

## Greșeli frecvente

- **Importul fără previzualizare**, cu date amestecate.
- **Publicarea automată după import**, cu anunțuri incomplete.
- **Anunțuri duble pe portaluri** din cele două sisteme.
- **Fișiere de export uitate** pe calculatoare.
- **Echipa lăsată să lucreze în ambele sisteme** fără o dată clară de trecere.

## Ce poți compara înainte de schimbare

Dacă încă alegi, pagina [Comparație](/comparatie) are o listă de criterii de verificat la orice CRM imobiliar, iar [Alternative](/alternative) descrie pașii mutării. Prețurile și perioada de probă sunt pe pagina [Prețuri](/preturi): orice agenție nouă primește 90 de zile de acces gratuit, fără card bancar.

## Anunțurile de la proprietari

Pe lângă portofoliul agenției, poți aduce în CRM și anunțuri găsite de la proprietari, dar doar după ce confirmi că ai acordul proprietarului. Se creează o ciornă cu datele anunțului, iar fotografiile se copiază în proprietate. Un anunț de la proprietar poate fi importat o singură dată în agenție: dacă un coleg l-a importat deja, primești proprietatea existentă, nu una nouă.

## Clienții și cererile lor

Clienții sunt adesea mai valoroși decât anunțurile. Când îi treci în noul CRM, începe cu cei activi: cumpărătorii care caută acum și proprietarii cu care ai contracte în derulare. Pentru fiecare, notează cererea: tipul căutat, zona, bugetul. Cererile se pot potrivi apoi automat cu proprietățile din portofoliu, iar agentul vede imediat ofertele potrivite.

### Istoricul activităților

Istoricul vechi al apelurilor și vizionărilor este util, dar rareori e nevoie să fie mutat complet. Notează în fișa clientului un rezumat al ultimelor discuții, iar istoricul complet rămâne de consultat în sistemul vechi pe perioada de tranziție.

## Calendarul mutării

O mutare bine organizată poate arăta așa:

1. **Prima săptămână**: inventar și export.
2. **A doua săptămână**: import, previzualizare și verificare.
3. **A treia săptămână**: conturi pentru echipă, publicări din noul CRM.
4. **După aceea**: sistemul vechi doar pentru consultare, până la închidere.

Durata reală depinde de mărimea portofoliului și de cât de curate sunt datele, dar ordinea pașilor rămâne aceeași.

## Datele agenției și ale echipei

Înainte să publici primul anunț din noul CRM, completează datele agenției: numele, logo-ul, telefonul și datele firmei. Ele apar pe portaluri, în contracte și pe paginile publice ale ofertelor. Fiecare agent își completează profilul cu fotografie și telefon, iar telefonul apare public doar dacă agentul alege asta.

## Pe scurt

Inventar, export, import cu previzualizare, verificare, publicare, perioadă de tranziție. În această ordine, mutarea la un CRM nou devine o muncă de câteva zile bine organizate, nu un risc pentru portofoliu.`,
  faq: [
    { q: "Pot muta proprietățile din alt CRM în Habitoo?", a: "Da, dintr-un format de export acceptat. Importul îl face echipa Habitoo pentru agenția ta, cu previzualizare înainte de confirmare, iar proprietățile intră cu fotografii, caracteristici și locație." },
    { q: "Importul publică automat anunțurile pe portaluri?", a: "Nu. După import verifici proprietățile și pornești tu publicarea din fila Publicare a fiecărei proprietăți." },
    { q: "Ce se întâmplă dacă import de două ori același export?", a: "Proprietățile se recunosc după codul lor din sistemul vechi, așa că cele existente se actualizează în loc să fie create din nou, iar fotografiile deja preluate nu se mai adaugă." },
    { q: "Se preiau și proprietarii la import?", a: "Nu. Importul nu preia proprietarii și datele lor de contact. Contactele le treci în Habitoo cu sursa și acordul lor." },
    { q: "Cât timp păstrez sistemul vechi după mutare?", a: "Până verifici că proprietățile și clienții activi sunt în noul CRM și că echipa lucrează doar acolo. Folosește sistemul vechi doar pentru consultare în această perioadă." },
  ],
},
];
