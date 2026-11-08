// Conținut public pentru /extensie-chrome (browser-safe, fără citiri private).
import type { FaqItem } from "@/components/marketing/FaqSection";

/** Adresa din Chrome Web Store; goală până la aprobarea extensiei. */
export const CHROME_EXTENSION_URL = "";
export const CHROME_EXTENSION_PATH = "/extensie-chrome";
export const CHROME_EXTENSION_TITLE = "Extensia Chrome Habitoo Captură";
export const CHROME_EXTENSION_META_TITLE = "Extensia Chrome Habitoo Captură — import anunțuri și postări Facebook | Habitoo CRM";
export const CHROME_EXTENSION_DESCRIPTION =
  "Importă cu un clic anunțul ales de pe OLX, Storia, Publi24 sau Imobiliare.ro în Habitoo și postează-ți ofertele în grupuri Facebook cu datele tale de contact.";

export function chromeInstallButton(url: string = CHROME_EXTENSION_URL) {
  return url ? { disabled: false as const, label: "Adaugă în Chrome", href: url } : { disabled: true as const, label: "În curând în Chrome Web Store", href: null };
}

export const extensionSteps = [
  { title: "Instalează", text: "Adaugi extensia Habitoo Captură în Chrome din Chrome Web Store." },
  { title: "Conectează contul", text: "Apeși „Conectează” în extensie și confirmi cu „Permite” în Habitoo. Nu copiezi nicio cheie." },
  { title: "Importă anunțul cu un clic", text: "Pe pagina anunțului apeși butonul Habitoo, verifici datele și le salvezi ca proprietate ciornă, cu poze și contactul proprietarului." },
];

export const extensionSites = ["OLX", "Storia", "Publi24", "Imobiliare.ro"];

export const extensionFaq: FaqItem[] = [
  { q: "Este gratuită pentru clienții Habitoo?", a: "Da. Extensia este inclusă în contul tău Habitoo, fără cost suplimentar." },
  { q: "Ce date citește extensia?", a: "Doar anunțul pe care alegi să-l imporți: titlu, descriere, preț, caracteristici, localizare, poze și datele de contact afișate public. Pe Facebook citește doar numele și adresa grupului deschis. Nu citește istoricul de navigare." },
  { q: "Postează singură pe Facebook?", a: "Nu. Extensia completează postarea, iar tu apeși „Postează”. Habitoo notează apoi în fișa anunțului în ce grup a fost postat." },
  { q: "Cum o deconectez?", a: "Din Habitoo, în Setări → Profil → Extensia Chrome, apeși „Deconectează”. Poți și să dezinstalezi extensia din Chrome." },
];
