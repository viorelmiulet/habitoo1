// Identitatea vizuală a materialelor generate pentru clienți (prezentare
// printabilă, pagina publică de ofertă, textul ofertelor trimise pe email).
// NU se folosește în interfața aplicației și nu ajunge în feedurile portalurilor.

/** Auriul Habitoo — accentul implicit al materialelor. */
export const HABITOO_GOLD = "#C9A227";
const NAVY = "#16223C";
const INK = "#1F2937";
const MUTED = "#6B7280";
const LINE = "#E6E8EC";

export type MaterialBranding = {
  agencyName: string;
  /** URL semnat al logo-ului agenției sau `null` dacă nu există logo. */
  logoUrl: string | null;
  accent: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  showHabitoo: boolean;
};

type OrgLike = {
  name?: string | null;
  material_accent_color?: string | null;
  material_phone?: string | null;
  material_email?: string | null;
  material_website?: string | null;
  material_address?: string | null;
  material_show_habitoo?: boolean | null;
  phone?: string | null;
  email?: string | null;
};

/** Validează culoarea de accent; orice valoare neconformă cade pe auriul Habitoo. */
export function safeAccent(value: string | null | undefined) {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : HABITOO_GOLD;
}

const clean = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t.length ? t : null;
};

/** Construiește brandingul materialelor din datele agenției. */
export function brandingFromOrg(
  org: OrgLike | null | undefined,
  logoUrl: string | null = null,
): MaterialBranding {
  return {
    agencyName: clean(org?.name) ?? "Agenție imobiliară",
    logoUrl,
    accent: safeAccent(org?.material_accent_color),
    phone: clean(org?.material_phone) ?? clean(org?.phone),
    email: clean(org?.material_email) ?? clean(org?.email),
    website: clean(org?.material_website),
    address: clean(org?.material_address),
    showHabitoo: org?.material_show_habitoo !== false,
  };
}

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Datele de contact ale agenției, ca listă gata de afișat. */
export function contactLines(branding: MaterialBranding) {
  return [branding.phone, branding.email, branding.website, branding.address].filter(
    (v): v is string => Boolean(v),
  );
}

/** Semnătura folosită în textul ofertelor trimise clientului (email / WhatsApp). */
export function materialSignature(branding: MaterialBranding) {
  return [branding.agencyName, ...contactLines(branding)].join("\n");
}

export type PresentationData = {
  title: string;
  location: string;
  price: string;
  specs: { label: string; value: string }[];
  description: string | null;
  /** URL-uri de fotografii (deja semnate) — prima este imaginea mare. */
  photos?: string[];
  /** Destinația fișei controlează exclusiv afișarea numerelor de telefon. */
  audience?: "client" | "agent";
  /** Agentul care generează fișa; este afișat cu telefon doar în varianta pentru client. */
  agent?: { name: string | null; phone: string | null };
};


/** Prezentare de probă pentru previzualizarea din Setări. */
export const samplePresentation: PresentationData = {
  title: "Apartament 3 camere, zonă centrală",
  location: "Str. Exemplu 12, Sector 1, București",
  price: "119.000 €",
  specs: [
    { label: "Tip", value: "Apartament" },
    { label: "Tranzacție", value: "Vânzare" },
    { label: "Suprafață", value: "78 m²" },
    { label: "Camere", value: "3" },
    { label: "Etaj", value: "4" },
    { label: "Referință", value: "HB-1024" },
  ],
  description:
    "Apartament luminos, bloc nou, finisaje premium, parcare subterană. Text de probă pentru previzualizarea materialului.",
};

/**
 * HTML complet al prezentării proprietății, cu logo-ul agenției sus, accentul
 * configurat și datele de contact în subsol. Fără logo, numele agenției apare
 * ca text stilizat — niciodată logo-ul Habitoo în locul lui.
 */
export function buildPresentationHtml(branding: MaterialBranding, data: PresentationData): string {
  const accent = safeAccent(branding.accent);
  const audience = data.audience ?? "client";
  const header = branding.logoUrl
    ? `<img class="logo" src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.agencyName)}" />`
    : `<span class="agency">${escapeHtml(branding.agencyName)}</span>`;

  const agencyContacts = [
    audience === "client" && branding.phone ? `Agenție: ${branding.phone}` : null,
    branding.email,
    branding.website,
    branding.address,
  ].filter((value): value is string => Boolean(value));
  const agentContact =
    audience === "client" && data.agent?.phone
      ? `Agent: ${data.agent.name ? `${data.agent.name} · ` : ""}${data.agent.phone}`
      : null;
  const contacts = [...agencyContacts, agentContact]
    .filter((value): value is string => Boolean(value))
    .map((line) => `<span>${escapeHtml(line)}</span>`)
    .join('<span class="sep">·</span>');

  const photos = (data.photos ?? []).filter(Boolean).slice(0, 5);
  const [cover, ...others] = photos;
  const gallery = cover
    ? `<figure class="gallery">
  <img class="cover" src="${escapeHtml(cover)}" alt="${escapeHtml(data.title)}" />
  ${
    others.length
      ? `<div class="thumbs">${others
          .map((src) => `<img src="${escapeHtml(src)}" alt="" />`)
          .join("")}</div>`
      : ""
  }
</figure>`
    : "";

  return `<!doctype html><html lang="ro"><head><meta charset="utf-8" />
<title>${escapeHtml(data.title)}</title>

<style>
  *{box-sizing:border-box}
  body{margin:0;padding:32px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};background:#fff}
  .sheet{max-width:760px;margin:0 auto}
  header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:16px;border-bottom:3px solid ${accent}}
  .logo{max-height:56px;max-width:220px;object-fit:contain}
  .agency{font-size:20px;font-weight:700;letter-spacing:-0.01em;color:${NAVY}}
  .ref{font-size:12px;color:${MUTED};text-align:right}
  h1{margin:24px 0 4px;font-size:26px;line-height:1.2;letter-spacing:-0.01em;color:${NAVY}}
  .loc{margin:0;color:${MUTED};font-size:14px}
  .price{margin:16px 0 0;font-size:24px;font-weight:700;color:${accent}}
  dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 24px;margin:24px 0 0;padding:16px 0;border-top:1px solid ${LINE};border-bottom:1px solid ${LINE}}
  .row{display:flex;justify-content:space-between;gap:12px;font-size:14px}
  dt{color:${MUTED};margin:0}
  dd{margin:0;font-weight:600}
  h2{margin:24px 0 6px;font-size:15px;text-transform:uppercase;letter-spacing:0.08em;color:${accent}}
  p.desc{margin:0;white-space:pre-line;font-size:14px;line-height:1.6;color:${INK}}
  footer{margin-top:32px;padding-top:14px;border-top:1px solid ${LINE};font-size:12px;color:${MUTED}}
  footer .name{font-weight:600;color:${NAVY}}
  .contacts{margin-top:4px;display:flex;flex-wrap:wrap;gap:6px}
  .sep{color:${LINE}}
  .habitoo{margin-top:12px;display:flex;align-items:center;gap:8px;font-size:11px;color:#9AA0A8}
  .habitoo img{display:block;width:76px;height:auto;object-fit:contain}
  .gallery{margin:20px 0 0;padding:0}
  .gallery .cover{display:block;width:100%;height:340px;object-fit:cover;border-radius:12px;background:${LINE}}
  .gallery .thumbs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:8px}
  .gallery .thumbs img{width:100%;height:84px;object-fit:cover;border-radius:8px;background:${LINE}}
  @media print{body{padding:0}.gallery,.gallery img{break-inside:avoid;page-break-inside:avoid}}
</style></head><body><div class="sheet">
<header>${header}<div class="ref">${escapeHtml(branding.agencyName)}</div></header>
<h1>${escapeHtml(data.title)}</h1>
<p class="loc">${escapeHtml(data.location)}</p>
<p class="price">${escapeHtml(data.price)}</p>
${gallery}
<dl>${data.specs

    .map(
      (s) =>
        `<div class="row"><dt>${escapeHtml(s.label)}</dt><dd>${escapeHtml(s.value)}</dd></div>`,
    )
    .join("")}</dl>
<h2>Descriere</h2>
<p class="desc">${escapeHtml(data.description ?? "—")}</p>
<footer>
  <div class="name">${escapeHtml(branding.agencyName)}</div>
  ${contacts ? `<div class="contacts">${contacts}</div>` : ""}
  <div class="habitoo"><img src="/assets/habitoo-logo.png" alt="Habitoo CRM" /><span>Generat cu Habitoo CRM</span></div>
</footer>
</div></body></html>`;
}
