import type { FaqItem } from "./FaqSection";

export const PUBLIC_PROPERTY_IMPORT_PATH = "/import-proprietati";
export const PUBLIC_PROPERTY_IMPORT_TITLE = "Import proprietăți din alt CRM imobiliar | Habitoo CRM";
export const PUBLIC_PROPERTY_IMPORT_DESCRIPTION = "Mută proprietățile din IMMOFLUX în Habitoo: previzualizare înainte de import, fotografii, caracteristici și locație preluate, fără dubluri și fără publicare automată pe portaluri.";

export const propertyImportSections = [
  {
    title: "Import din IMMOFLUX",
    text: "Dacă lucrai în IMMOFLUX, exportul proprietăților (fișier JSON, până la 24 MB) poate fi importat în Habitoo. Importul este făcut de echipa Habitoo pentru agenția ta, iar proprietățile sunt atribuite agentului ales. Înainte de import se face o previzualizare: vezi câte proprietăți vor fi create, actualizate sau sărite și de ce.",
  },
  {
    title: "Ce date se preiau",
    text: "Titlul și descrierea, tipul proprietății (apartament, garsonieră, casă sau spațiu industrial), vânzare sau închiriere, prețul și moneda, camerele, băile, etajul și numărul de etaje ale clădirii, suprafețele utilă, construită și a terenului, anul construcției, compartimentarea, balcoanele, clasa energetică, adresa, județul, orașul, sectorul și coordonatele hărții. Fotografiile se preiau în ordinea din export și se descarcă în fundal, după import.",
  },
  {
    title: "Fără dubluri",
    text: "Fiecare proprietate este recunoscută după codul ei din IMMOFLUX. Dacă importi din nou același export, proprietățile existente se actualizează în loc să fie create a doua oară, iar fotografiile deja preluate nu se mai adaugă. La actualizare nu se schimbă starea, agentul responsabil și referința din Habitoo, iar locația se completează doar unde lipsește.",
  },
  {
    title: "Import din Anunțuri particulari",
    text: "Un anunț de la proprietar găsit în Anunțuri particulari poate fi adus în portofoliu doar după ce confirmi că ai acordul proprietarului. Se creează o ciornă cu titlul, descrierea, tipul, prețul, suprafața, camerele, etajul, orașul, județul și zona, iar fotografiile se copiază în proprietate. Ciorna este atribuită agentului care o importă, iar la notele interne rămân linkul anunțului original, sursa și momentul confirmării acordului.",
  },
  {
    title: "Același anunț nu intră de două ori",
    text: "Un anunț de la proprietar poate fi importat o singură dată în agenție. Dacă un coleg l-a importat deja, primești proprietatea existentă, nu una nouă.",
  },
  {
    title: "Ce verifici după import",
    text: "Previzualizarea arată ce trebuie completat de mână: etajul sau compartimentarea cu un cod necunoscut rămân necompletate, iar proprietățile fără județ sau, în București, fără sector trebuie completate înainte de publicarea pe portalurile care le cer. Proprietățile cu tip de tranzacție, tip de proprietate sau monedă necunoscute sunt sărite, cu motivul afișat. La ciornele din Anunțuri particulari verifici datele, completezi ce lipsește și le activezi tu.",
  },
] as const;

export const propertyImportLimitations = [
  "Nu publică nimic pe portaluri: publicarea o pornești tu, din fila Publicare a proprietății.",
  "Nu importă alte CRM-uri în afară de IMMOFLUX.",
  "Nu preia proprietarul și datele lui de contact din IMMOFLUX și nici din Anunțuri particulari.",
  "Nu importă un anunț de la proprietar fără confirmarea acordului acestuia.",
  "Nu oferă proprietățile importate din Anunțuri particulari la colaborare cu alte agenții.",
];

export const propertyImportFaq: FaqItem[] = [
  {
    q: "Din ce CRM pot muta proprietățile în Habitoo?",
    a: "Din IMMOFLUX, pe baza exportului proprietăților în format JSON. Importul este făcut de echipa Habitoo pentru agenția ta.",
  },
  {
    q: "Se preiau și fotografiile?",
    a: "Da. La importul din IMMOFLUX fotografiile se descarcă în fundal, în ordinea din export. La importul din Anunțuri particulari se copiază fotografiile anunțului.",
  },
  {
    q: "Ce se întâmplă dacă importul se face de două ori?",
    a: "Nu apar dubluri. Proprietățile din IMMOFLUX se recunosc după codul lor și se actualizează, iar un anunț de la proprietar se importă o singură dată în agenție.",
  },
  {
    q: "Proprietățile importate apar automat pe portaluri?",
    a: "Nu. Importul nu publică nimic. Tu alegi când și unde publici fiecare proprietate.",
  },
  {
    q: "Se importă și datele proprietarului?",
    a: "Nu. Proprietarul și datele lui de contact nu se preiau; le adaugi tu în Habitoo.",
  },
  {
    q: "Ce trebuie verificat după import?",
    a: "Câmpurile semnalate în previzualizare, de exemplu etajul, compartimentarea, județul sau sectorul. Ciornele aduse din Anunțuri particulari le verifici și le activezi tu.",
  },
];
