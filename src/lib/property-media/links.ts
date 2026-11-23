/** Validare pură pentru linkurile video / tur virtual (reguli OLX RE API: fără shortlinks). */
export type MediaLinkKind = "video" | "virtual_tour";

const SHORTLINK_HOSTS = ["youtu.be", "vimeo.app.link", "bit.ly", "tinyurl.com", "goo.gl", "t.co", "my.matterport.com/s"];
const VIDEO_HOSTS = ["youtube.com", "vimeo.com"];
const TOUR_HOSTS = [...VIDEO_HOSTS, "matterport.com", "kuula.co", "cupix.com"];

function hostMatches(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Întoarce null dacă linkul e acceptat, altfel mesajul de eroare. */
export function mediaLinkError(raw: string, kind: MediaLinkKind): string | null {
  const label = kind === "video" ? "Linkul video" : "Linkul turului virtual";
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return `${label} nu este un URL valid.`; }
  if (u.protocol !== "https:") return `${label} trebuie să înceapă cu https://.`;
  const host = u.hostname.toLowerCase();
  if (SHORTLINK_HOSTS.some((h) => hostMatches(host, h))) return `${label} este un link scurt; folosește adresa completă.`;
  const allowed = kind === "video" ? VIDEO_HOSTS : TOUR_HOSTS;
  if (!allowed.some((d) => hostMatches(host, d))) {
    return kind === "video"
      ? "Linkul video trebuie să fie de pe YouTube sau Vimeo."
      : "Turul virtual trebuie să fie de pe Matterport, Kuula, Cupix, YouTube sau Vimeo.";
  }
  const path = u.pathname.replace(/\/+$/, "");
  if (hostMatches(host, "youtube.com") && !(u.searchParams.get("v") || /^\/(embed|shorts|live)\/[\w-]+/.test(path))) {
    return `${label} de YouTube trebuie să fie adresa completă a videoclipului.`;
  }
  if (hostMatches(host, "vimeo.com") && !/\d{6,}/.test(path)) {
    return `${label} de Vimeo trebuie să fie adresa completă a videoclipului.`;
  }
  return null;
}

export function normalizeMediaLink(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  return v ? v : null;
}
