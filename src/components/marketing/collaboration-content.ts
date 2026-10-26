import type { FaqItem } from "./FaqSection";

export const PUBLIC_COLLABORATION_PATH = "/colaborare-intre-agentii";
export const PUBLIC_COLLABORATION_TITLE = "Colaborare între agenții imobiliare | Habitoo CRM";
export const PUBLIC_COLLABORATION_DESCRIPTION = "Oferă proprietăți altor agenții din Habitoo cu comisionul stabilit de tine, primește propuneri de clienți și discută fiecare colaborare, fără să expui proprietarul.";

export const collaborationSections = [
  {
    title: "Cum oferi o proprietate la colaborare",
    text: "În fila Publicare a proprietății, „Colaborare” apare ca un portal: o activezi, scrii comisionul oferit (procent) și, opțional, condițiile. Agenția poate avea un comision standard, folosit când agentul nu scrie altul. Administratorul poate activa colaborarea automat pentru toate proprietățile active; dacă un agent o oprește pe o proprietate, alegerea lui este respectată.",
  },
  {
    title: "Ce văd agențiile partenere",
    text: "Titlul, descrierea, tipul, prețul, camerele, suprafețele, etajul, anul construcției, orașul și zona, dotările, fotografiile marcate pentru publicare, comisionul oferit, condițiile și numele agenției. Nu văd proprietarul, telefonul lui, notele interne, agentul responsabil, sursa sau fotografiile confidențiale.",
  },
  {
    title: "Cum găsești oferte de la parteneri",
    text: "În secțiunea Colaborare vezi ofertele agențiilor participante, cu filtre pe oraș, tip, vânzare sau închiriere, preț, camere, suprafață și agenție, și sortare după cele mai noi, preț sau comisionul cel mai mare. Apar doar proprietăți active, rezervate sau în negociere.",
  },
  {
    title: "Propunerea de client și discuția",
    text: "Când ai un client potrivit, trimiți o propunere: alegi clientul din contactele sau lead-urile tale și scrii o descriere și un mesaj. Clientul rămâne al tău: partenerul vede doar ce scrii în propunere, nu fișa clientului. Propunerea are un status (În așteptare, Acceptată, Vizionare programată, Refuzată, Închisă) și o discuție proprie, pe care o văd doar cele două agenții. Fiecare propunere, mesaj sau schimbare de status vine cu notificare.",
  },
] as const;

export const collaborationLimitations = [
  "Nu face publice proprietățile: le văd doar agențiile din Habitoo care participă, nu vizitatorii site-ului sau portalurile.",
  "Nu dezvăluie proprietarul, telefonul lui sau notele interne.",
  "Nu încasează și nu împarte comisionul: procentul afișat este oferta agenției, iar înțelegerea finală rămâne între cele două agenții.",
  "Nu înlocuiește un contract de colaborare între agenții, dacă îl folosiți.",
  "Nu mută clientul sau proprietatea dintr-o agenție în alta.",
] as const;

export const collaborationFaq: readonly FaqItem[] = [
  { q: "Ce este colaborarea între agenții în Habitoo?", a: "Un spațiu comun în care agențiile din Habitoo își oferă proprietățile între ele, cu un comision stabilit de agenția care are proprietatea; partenerul vine cu clientul." },
  { q: "Ce date ale proprietății vede altă agenție?", a: "Datele de prezentare, fotografiile marcate pentru publicare, comisionul și condițiile. Nu vede proprietarul, telefonul lui, notele interne sau agentul responsabil." },
  { q: "Cine stabilește comisionul de colaborare?", a: "Agenția care are proprietatea: un procent pe fiecare proprietate sau un comision standard al agenției, folosit când agentul nu scrie altul." },
  { q: "Pot opri colaborarea pentru o singură proprietate?", a: "Da, din fila Publicare a proprietății; activarea automată nu o mai pornește la loc." },
  { q: "Cum aflu că o agenție are un client pentru proprietatea mea?", a: "Primești notificare: la o propunere nouă sunt anunțați agentul responsabil și administratorii agenției, iar mesajele și schimbările de status ajung la cealaltă agenție." },
];