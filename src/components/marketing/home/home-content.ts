import type { LucideIcon } from "lucide-react";
import {
  BarChart3, Bot, Building2, FileSignature, Handshake, Home, IdCard, Kanban, LineChart, Link2, Megaphone, Mic, Puzzle, Sparkles, Users, Wand2,
} from "lucide-react";
import type { FaqItem } from "@/components/marketing/FaqSection";

/** Conținutul paginii principale (browser-safe), folosit de pagină și de head/JSON-LD. */
export const HOME_TITLE = "Habitoo — CRM imobiliar cu AI pentru agențiile din România";
export const HOME_DESCRIPTION =
  "Habitoo este CRM imobiliar cu AI pentru agențiile din România: proprietăți, clienți, cereri și lead-uri, publicare pe portaluri, iar Habitoo AI te ajută cu textele, pozele și follow-up-urile.";

export const HOME_FAQ: FaqItem[] = [
  {
    q: "Ce este Habitoo CRM?",
    a: "Habitoo CRM este un CRM imobiliar pentru agențiile din România. Ține într-un singur loc proprietățile, clienții, cererile și lead-urile, face automat potrivirea între cereri și proprietăți și publică anunțurile pe portalurile imobiliare direct din aplicație.",
  },
  {
    q: "Ce este un CRM imobiliar și de ce are nevoie o agenție de el?",
    a: "Un CRM imobiliar este un program în care agenția își gestionează portofoliul, clienții și tranzacțiile. Fără el, informația stă în telefoane, foi de calcul și conversații separate, iar oportunitățile se pierd între agenți. Cu un CRM, fiecare cerere, vizionare și ofertă rămâne înregistrată și vizibilă pentru echipă.",
  },
  {
    q: "Pe ce portaluri imobiliare pot publica anunțurile din Habitoo?",
    a: "Din Habitoo poți publica pe Imobiliare.ro, Storia și OLX, Publi24 (prin Romimo), iMove, Imospot, imo24.ro, ZonaTa.ro, HomeDirect.ro, HomePitch, Imopedia.ro, Ofera.ro, ZUP.ro, Imobli.ro, Imobiliare Militari, Locuit.ro, BazarulDeCase.ro, Imobiliare+, Vumsi.com, Housera.ro, PrimulAnunț, LaCheie, ClickImob și VDI.ro, iar internațional pe Properstar. Alegi pentru fiecare anunț pe ce portaluri apare. Modificările se trimit când apeși „Publică”, iar portalurile care preiau anunțurile prin feed le actualizează la următoarea sincronizare. Poți trimite anunțurile și în Catalogul Facebook (Meta), pentru reclame și afișare în Facebook și Instagram, alegând pe fiecare anunț dacă intră în catalog.",
  },
  {
    q: "Cum funcționează potrivirea automată dintre cereri și proprietăți?",
    a: "Habitoo compară criteriile fiecărei cereri (tip de tranzacție, buget, oraș și zonă, număr de camere, suprafață, tip de proprietate și facilități) cu proprietățile din portofoliu și calculează un scor. Fiecare potrivire vine cu motivele ei, iar lista se actualizează automat când se schimbă o cerere sau o proprietate.",
  },
  {
    q: "Pot aduce în Habitoo proprietățile dintr-un alt CRM?",
    a: "Da. Habitoo are infrastructura necesară pentru import din orice CRM imobiliar, inclusiv fotografiile. Proprietățile tale ajung în Habitoo fără să le introduci din nou de mână.",
  },
  {
    q: "Cât costă Habitoo CRM?",
    a: "Habitoo are trei planuri: Basic la 10 €/lună, pentru până la 3 agenți; Pro la 40 €/lună, pentru până la 10 agenți; Unlimited la 100 €/lună, fără limită de agenți. La plata anuală prețul lunar scade cu 50%. Toate planurile încep cu 90 de zile gratuite, fără card bancar.",
  },
  {
    q: "Pot testa Habitoo gratuit?",
    a: "Da. Orice agenție poate folosi Habitoo gratuit 90 de zile, fără card bancar. Îți creezi agenția, inviți colegii și adaugi proprietăți, iar la final alegi planul potrivit.",
  },
  {
    q: "Datele agenției mele sunt separate de ale altor agenții?",
    a: "Da. Fiecare agenție are propriul spațiu de lucru, iar utilizatorii văd doar datele agenției lor, în funcție de rol: administratorul vede toată agenția, iar agentul vede ce i-a fost atribuit. Modificările importante rămân înregistrate într-un jurnal de audit.",
  },
  {
    q: "Pot colabora cu alte agenții din Habitoo?",
    a: "Da. Habitoo are un modul de colaborare de tip MLS: o agenție marchează proprietăți ca disponibile pentru colaborare, cu un comision stabilit, iar celelalte agenții din Habitoo le pot propune propriilor clienți. Discuția despre fiecare propunere are loc direct în aplicație.",
  },
  {
    q: "Există aplicație mobilă pentru Habitoo?",
    a: "Aplicația mobilă Habitoo pentru iOS și Android va fi disponibilă în curând. Până atunci, Habitoo funcționează în browser pe telefon, tabletă și calculator, fără instalare.",
  },
  {
    q: "Ce poate face Habitoo AI?",
    a: "Habitoo AI te ajută în munca de zi cu zi: agentul AI CRM răspunde la întrebări despre clienți, cereri, lead-uri și priorități; AI Marketing scrie titluri, descrieri și postări pentru anunțuri; Studio AI îmbunătățește fotografiile, face video din poză și creează imagini de marketing; vocea AI în română narează videoclipurile proprietăților; analiza comparativă de preț (ACP) primește un comentariu AI; iar în contracte datele din actele de identitate se citesc automat. Principiul rămâne același: AI-ul propune, agentul aprobă. Nimic nu se trimite fără acordul tău.",
  },
];

export type HomeCard = { icon: LucideIcon; title: string; text: string; wide?: boolean };

/** Doar funcții AI care există în aplicație. */
export const AI_CARDS: HomeCard[] = [
  { icon: Bot, title: "Agentul AI CRM", text: "Răspunde la întrebări despre clienți, cereri, lead-uri și priorități, din datele agenției tale." },
  { icon: Megaphone, title: "AI Marketing", text: "Titluri, descrieri și postări pentru anunțuri, pe tonul ales de tine." },
  { icon: Wand2, title: "Studio AI", text: "Îmbunătățirea pozelor, video din poză și imagini de marketing." },
  { icon: Mic, title: "Voce AI în română", text: "Narațiune pentru videoclipurile proprietăților." },
  { icon: LineChart, title: "Comentariu AI în ACP", text: "Explicații AI pe analiza comparativă de preț, peste calculul ofertelor reale." },
  { icon: IdCard, title: "Acte de identitate în contracte", text: "Datele din actul de identitate se citesc automat și le verifici înainte de salvare." },
];

export const HOME_FEATURES: HomeCard[] = [
  { icon: Building2, title: "Proprietăți", text: "Portofoliul complet, cu fișă, galerie foto, statusuri și vizionări.", wide: true },
  { icon: Users, title: "Clienți și cereri", text: "Contactele și criteriile lor, în același loc." },
  { icon: Sparkles, title: "Potrivire automată", text: "Scor și motive pentru fiecare cerere și proprietate." },
  { icon: Kanban, title: "Lead-uri și pipeline", text: "Fiecare oportunitate urmărită până la tranzacția închisă." },
  { icon: Link2, title: "Publicare pe portaluri", text: "Alegi unde apare fiecare anunț, direct din fișa lui.", wide: true },
  { icon: Handshake, title: "Colaborare între agenții (MLS)", text: "Proprietăți oferite partenerilor, cu comision stabilit." },
  { icon: Home, title: "Anunțuri de la proprietari", text: "Adunate din mai multe portaluri, cu filtre pe zone." },
  { icon: FileSignature, title: "Contracte", text: "Contracte generate din datele proprietății și ale clientului." },
  { icon: Puzzle, title: "Extensia Chrome", text: "Preiei anunțuri în portofoliu direct din browser." },
  { icon: BarChart3, title: "Rapoarte", text: "Portofoliul, activitatea și rezultatele agenției, la zi." },
];

export const HOME_STEPS = [
  ["Adaugi proprietatea", "Completezi datele și fotografiile o singură dată."],
  ["AI-ul te ajută cu textele și pozele", "Descrieri, titluri și fotografii mai bune, pe care le aprobi tu."],
  ["Publici și urmărești lead-urile", "Anunțul ajunge pe portaluri, iar cererile intră direct în CRM."],
] as const;

