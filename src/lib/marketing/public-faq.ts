// Shared public FAQ; no imports from route modules. Page text and FAQPage JSON-LD both read this list.
export const PUBLIC_FAQ_GROUPS: { id: string; title: string; faqs: { q: string; a: string }[] }[] = [
  {
    id: "portaluri",
    title: "Publicarea pe portaluri",
    faqs: [
      {
        q: "Pe ce portaluri pot publica din Habitoo?",
        a: "Poți publica pe Storia, OLX, Imobiliare.ro, Romimo, Publi24, Imospot, VDI.ro, La-Cheie, PrimulAnunt și pe alte portaluri partenere. Fiecare portal se activează separat pentru agenție. Lista completă, cu modul în care funcționează fiecare portal, este pe pagina Integrări.",
      },
      {
        q: "Cum public un anunț pe portaluri?",
        a: "Completezi fișa proprietății o singură dată, apoi bifezi portalurile în fila Publicare și apeși Publică. Datele, pozele, descrierea și prețul se trimit spre fiecare portal ales. Trimiterea continuă în fundal chiar dacă închizi pagina.",
      },
      {
        q: "Pot publica același anunț pe mai multe portaluri deodată?",
        a: "Da, bifezi toate portalurile dorite și publici dintr-un singur pas. Când modifici prețul sau descrierea, actualizarea ajunge pe portalurile pe care anunțul este deja publicat. Nu mai trebuie să intri în fiecare cont de portal.",
      },
      {
        q: "Cine activează portalurile pentru agenție?",
        a: "Administratorul agenției activează fiecare portal din Setări → Portaluri. Agenții folosesc portalurile activate de administrator și nu își pot activa singuri portaluri noi.",
      },
      {
        q: "Ce se întâmplă când proprietatea se vinde sau se închiriază?",
        a: "Anunțul se retrage automat de pe portaluri când proprietatea devine Vândută, Închiriată sau Arhivată. Pe portalurile care citesc un feed, anunțul dispare la următoarea citire. Nu se republică automat dacă schimbi din nou starea.",
      },
      {
        q: "Cum aflu dacă un anunț a fost respins de un portal?",
        a: "Primești o notificare în CRM cu motivul respingerii. Pe cardul portalului din fila Publicare vezi starea exactă. Corectezi problema în fișa proprietății și retrimiți anunțul din același loc.",
      },
      {
        q: "Primesc mesajele clienților de pe portaluri în CRM?",
        a: "Da, pe portalurile care permit asta: Storia, OLX, VDI.ro și Properstar. Mesajele ajung în CRM ca lead-uri, la agentul responsabil de proprietate. Astfel nu se pierde nicio cerere.",
      },
    ],
  },
  {
    id: "preturi",
    title: "Prețuri și perioada de probă",
    faqs: [
      {
        q: "Cât costă Habitoo CRM?",
        a: "Planul Basic costă 10 € pe lună, Pro 40 € pe lună, iar Unlimited 100 € pe lună. Basic include până la 3 agenți, Pro până la 10, iar Unlimited nu are limită de agenți. Detaliile sunt pe pagina Prețuri.",
      },
      {
        q: "Există o perioadă de probă gratuită?",
        a: "Da, orice agenție nouă primește 90 de zile de acces gratuit, fără card bancar. Pe durata probei poți folosi aplicația cu toată echipa. La final alegi planul dorit pentru a continua.",
      },
      {
        q: "Am reducere dacă plătesc anual?",
        a: "Da, la plata anuală tariful lunar este cu 50% mai mic. Factura se emite o singură dată pentru 12 luni: 60 € pentru Basic, 240 € pentru Pro și 600 € pentru Unlimited.",
      },
      {
        q: "Cum plătesc abonamentul?",
        a: "Plata se face prin factură, nu online din aplicație. Administratorul agenției alege planul, iar echipa Habitoo îl activează după confirmare.",
      },
    ],
  },
  {
    id: "import",
    title: "Importul din alt CRM",
    faqs: [
      {
        q: "Pot muta proprietățile din alt CRM în Habitoo?",
        a: "Da, proprietățile din IMMOFLUX se pot importa în Habitoo cu fotografii, caracteristici și locație. Importul nu creează dubluri pentru proprietățile deja aduse. Detaliile sunt pe pagina Import proprietăți.",
      },
      {
        q: "Proprietățile importate se publică automat pe portaluri?",
        a: "Nu, proprietățile importate intră ca ciorne și nu se publică automat. Le verifici, le completezi dacă e nevoie și alegi tu portalurile pe care le publici.",
      },
    ],
  },
  {
    id: "ansambluri",
    title: "Ansambluri rezidențiale",
    faqs: [
      {
        q: "Pot gestiona ansambluri rezidențiale în Habitoo?",
        a: "Da, poți crea ansambluri rezidențiale și le poți adăuga unități din portofoliu. Fiecare unitate este o copie a anunțului, cu referință proprie, iar anunțul original rămâne neschimbat. Pentru mai multe anunțuri odată, alocarea rulează în fundal și primești o notificare la final.",
      },
      {
        q: "Pe ce portaluri se publică un ansamblu?",
        a: "Un ansamblu se publică doar pe portalurile pe care le bifezi pentru el. Pe Storia, ansamblul apare ca investiție în contul de dezvoltator, cu unitățile lui. Dacă debifezi un portal, unitățile ansamblului se retrag de pe acel portal.",
      },
    ],
  },
  {
    id: "chat",
    title: "Chatul dintre agenți",
    faqs: [
      {
        q: "Cu cine pot vorbi în chatul din Habitoo?",
        a: "Poți vorbi cu orice utilizator activ al Habitoo: colegii din agenția ta, agenți din alte agenții și echipa platformei. Deschizi Mesaje din meniu, cauți persoana și începi conversația.",
      },
      {
        q: "Cum știu dacă cineva este disponibil?",
        a: "Starea persoanei apare în lista de contacte și în fiecare conversație. Vezi Online dacă a fost activă în ultimele minute, altfel momentul ultimei activități, de exemplu „Activ acum 5 min”.",
      },
      {
        q: "Primesc mesajele și pe email?",
        a: "Da, dacă nu ai citit un mesaj în 15 minute, primești un email de notificare. Pentru aceeași conversație primești cel mult un email pe oră, ca să nu îți umplem căsuța.",
      },
      {
        q: "Pot bloca pe cineva?",
        a: "Da, poți bloca orice persoană direct din conversație. După blocare, persoana nu îți mai poate trimite mesaje. Deblocarea se face tot din conversație, oricând.",
      },
      {
        q: "Cine vede conversațiile mele?",
        a: "Doar tu și persoana cu care vorbești. Conversațiile sunt private între cei doi participanți, iar nimeni altcineva din agenție sau din platformă nu le poate citi.",
      },
    ],
  },
  {
    id: "cont",
    title: "Activarea contului",
    faqs: [
      {
        q: "Cum îmi creez cont de agenție în Habitoo?",
        a: "Intri pe pagina de înregistrare și completezi datele agenției și adresa ta de email. Confirmi adresa din emailul primit, apoi creezi agenția și îți poți invita echipa.",
      },
      {
        q: "Cum îmi activez contul după înregistrare?",
        a: "Contul se activează când apeși linkul din emailul de confirmare. Emailul ajunge la adresa introdusă la înregistrare. După confirmare te poți autentifica imediat.",
      },
      {
        q: "Nu am primit emailul de confirmare. Ce fac?",
        a: "Verifică mai întâi folderele Spam sau Promoții. Dacă nu este nici acolo, cere retrimiterea emailului din pagina de autentificare. Dacă problema continuă, scrie-ne din pagina Contact.",
      },
      {
        q: "Cum îmi adaug colegii în agenție?",
        a: "Îi inviți din Setări → Echipă, pe adresa lor de email. Fiecare primește o invitație, își creează parola și intră direct în agenția ta. Rolul, agent sau manager, îl alegi tu.",
      },
      {
        q: "Am uitat parola. Cum o resetez?",
        a: "Apeși „Ai uitat parola?” pe pagina de autentificare și introduci adresa de email. Primești un link care te duce la o pagină unde îți alegi parola nouă.",
      },
    ],
  },
];
