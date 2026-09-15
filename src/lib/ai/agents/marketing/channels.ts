/**
 * Canale, tonuri, lungimi și tipuri de conținut pentru Marketing Agent
 * (Stage 16). Modul pur: nu atinge baza de date și nu apelează providerul.
 *
 * Limitele de lungime sunt reguli de produs (nu publicare automată): textul
 * generat este adaptat canalului, dar rămâne ciornă până când utilizatorul îl
 * salvează sau îl aplică explicit.
 */

export const MARKETING_CHANNELS = [
  "olx",
  "imobiliare_ro",
  "storia",
  "publi24",
  "facebook",
  "instagram",
  "site",
] as const;

export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

export type MarketingChannelSpec = {
  id: MarketingChannel;
  label: string;
  /** Lungimea maximă a titlului acceptată de canal. */
  maxTitle: number;
  /** Lungimea maximă a textului principal. */
  maxBody: number;
  hashtags: boolean;
  /** Indicații de stil specifice canalului (intră în prompt ca reguli). */
  guidance: string;
};

export const MARKETING_CHANNEL_SPECS: Record<MarketingChannel, MarketingChannelSpec> = {
  olx: {
    id: "olx",
    label: "OLX",
    maxTitle: 70,
    maxBody: 3000,
    hashtags: false,
    guidance: "Titlu scurt și concret, descriere pe paragrafe scurte, fără emoji excesiv.",
  },
  imobiliare_ro: {
    id: "imobiliare_ro",
    label: "Imobiliare.ro",
    maxTitle: 80,
    maxBody: 4000,
    hashtags: false,
    guidance: "Ton profesional de portal, structură clară: proprietate, spații, dotări, zonă.",
  },
  storia: {
    id: "storia",
    label: "Storia.ro",
    maxTitle: 80,
    maxBody: 4000,
    hashtags: false,
    guidance: "Descriere completă, ordonată, fără superlative de marketing agresiv.",
  },
  publi24: {
    id: "publi24",
    label: "Publi24",
    maxTitle: 70,
    maxBody: 2500,
    hashtags: false,
    guidance: "Text simplu, direct, informativ.",
  },
  facebook: {
    id: "facebook",
    label: "Facebook",
    maxTitle: 90,
    maxBody: 1200,
    hashtags: true,
    guidance: "Postare cu ritm conversațional, un CTA clar la final, maximum 5 hashtaguri.",
  },
  instagram: {
    id: "instagram",
    label: "Instagram",
    maxTitle: 80,
    maxBody: 900,
    hashtags: true,
    guidance: "Caption scurt, rânduri aerisite, CTA clar, maximum 8 hashtaguri relevante.",
  },
  site: {
    id: "site",
    label: "Site agenție",
    maxTitle: 90,
    maxBody: 4000,
    hashtags: false,
    guidance: "Text de prezentare pentru site, structurat pe paragrafe, ton de brand.",
  },
};

export const MARKETING_TONES = ["professional", "premium", "direct", "investment"] as const;
export type MarketingTone = (typeof MARKETING_TONES)[number];

export const MARKETING_TONE_LABELS: Record<MarketingTone, string> = {
  professional: "Profesional",
  premium: "Premium",
  direct: "Direct",
  investment: "Investițional",
};

export const MARKETING_TONE_GUIDANCE: Record<MarketingTone, string> = {
  professional: "Ton profesional, echilibrat, orientat pe fapte.",
  premium: "Ton elegant și sobru, fără exagerări și fără promisiuni.",
  direct: "Ton direct și scurt, propoziții simple, zero umplutură.",
  investment:
    "Ton orientat spre investitor: prezinți doar datele existente (preț, suprafață, zonă, stare). Nu estimezi randamente, profituri sau creșteri de valoare.",
};

export const MARKETING_LENGTHS = ["short", "standard", "long"] as const;
export type MarketingLength = (typeof MARKETING_LENGTHS)[number];

export const MARKETING_LENGTH_LABELS: Record<MarketingLength, string> = {
  short: "Scurt",
  standard: "Standard",
  long: "Detaliat",
};

/** Ținta orientativă de caractere pentru textul principal. */
export const MARKETING_LENGTH_TARGET: Record<MarketingLength, number> = {
  short: 350,
  standard: 900,
  long: 1800,
};

export const MARKETING_CONTENT_TYPES = [
  "listing",
  "social_post",
  "package",
  "rewrite",
  "ideas",
] as const;
export type MarketingContentType = (typeof MARKETING_CONTENT_TYPES)[number];

export const MARKETING_CONTENT_TYPE_LABELS: Record<MarketingContentType, string> = {
  listing: "Titlu + descriere anunț",
  social_post: "Postare social media",
  package: "Pachet complet de marketing",
  rewrite: "Reformulare anunț existent",
  ideas: "Idei de headline, CTA și beneficii",
};

export const MARKETING_CONTENT_TYPE_GUIDANCE: Record<MarketingContentType, string> = {
  listing: "Produci un titlu și o descriere de anunț pentru canalul indicat.",
  social_post: "Produci o postare de social media cu un CTA clar.",
  package:
    "Produci pachetul complet: titlu, descriere, postare social, două variante scurte, CTA și hashtaguri.",
  rewrite:
    "Reformulezi textul existent primit ca dată de intrare. Păstrezi toate faptele neschimbate; nu adaugi informații noi.",
  ideas:
    "Produci idei: variante de headline, CTA-uri și beneficii deduse STRICT din datele primite.",
};

export function marketingChannelSpec(channel: MarketingChannel): MarketingChannelSpec {
  return MARKETING_CHANNEL_SPECS[channel];
}

export function isMarketingChannel(value: unknown): value is MarketingChannel {
  return typeof value === "string" && (MARKETING_CHANNELS as readonly string[]).includes(value);
}
