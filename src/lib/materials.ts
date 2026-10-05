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
  agent?: {
    name: string | null;
    phone: string | null;
    email?: string | null;
    photoUrl?: string | null;
  };
};

const PRESENTATION_DESCRIPTION_LIMIT = 2_200;

/** Păstrează numai paragrafe sau propoziții complete în cele maximum două pagini. */
export function presentationDescription(value: string | null | undefined) {
  const normalized = (value ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return "Descriere indisponibilă.";
  if (normalized.length <= PRESENTATION_DESCRIPTION_LIMIT) return normalized;

  const paragraphs = normalized.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const kept: string[] = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    const extra = (kept.length ? 2 : 0) + paragraph.length;
    if (length + extra > PRESENTATION_DESCRIPTION_LIMIT) break;
    kept.push(paragraph);
    length += extra;
  }
  if (kept.length) return kept.join("\n\n");

  const sentences = normalized.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [];
  let result = "";
  for (const sentence of sentences) {
    const candidate = `${result}${sentence}`.trim();
    if (candidate.length > PRESENTATION_DESCRIPTION_LIMIT) break;
    result = candidate;
  }
  return result || "Descriere disponibilă la cerere.";
}


/** Prezentare de probă pentru previzualizarea din Setări. */
export const samplePresentation: PresentationData = {
  title: "Apartament 3 camere, zonă centrală",
  location: "Str. Exemplu 12, Sector 1, București",
  price: "119.000 €",
  specs: [
    { label: "Tip", value: "Apartament" },
    { label: "Suprafață", value: "78 m²" },
    { label: "Camere", value: "3" },
    { label: "Compartimentare", value: "Decomandat" },
    { label: "Etaj", value: "4" },
    { label: "An construcție", value: "2021" },
    { label: "Mobilare", value: "Mobilat" },
    { label: "Balcoane", value: "2" },
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
  const agencyLogo = branding.logoUrl
    ? `<img class="agency-logo" src="${escapeHtml(branding.logoUrl)}" alt="Logo ${escapeHtml(branding.agencyName)}" />`
    : `<span class="agency-monogram">${escapeHtml(branding.agencyName.slice(0, 2).toUpperCase())}</span>`;
  const headerPhone = audience === "client" ? data.agent?.phone ?? branding.phone : null;
  const contactPhone = audience === "client" ? data.agent?.phone ?? branding.phone : null;
  const contactEmail = data.agent?.email ?? branding.email;
  const agentPhoto = data.agent?.photoUrl
    ? `<img class="agent-photo" src="${escapeHtml(data.agent.photoUrl)}" alt="Fotografia agentului ${escapeHtml(data.agent.name ?? "imobiliar")}" />`
    : `<span class="agent-fallback">${escapeHtml((data.agent?.name ?? branding.agencyName).split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase())}</span>`;

  const photos = (data.photos ?? []).filter(Boolean).slice(0, 5);
  const [cover, ...others] = photos;
  const coverMarkup = cover
    ? `<img class="cover" src="${escapeHtml(cover)}" alt="${escapeHtml(data.title)}" />`
    : `<div class="cover photo-empty">Fotografie indisponibilă</div>`;
  const thumbs = Array.from({ length: 4 }, (_, index) => {
    const src = others[index];
    return src
      ? `<img src="${escapeHtml(src)}" alt="Fotografie proprietate ${index + 2}" />`
      : `<div class="photo-empty">${index === 0 && !cover ? "Fără fotografii" : ""}</div>`;
  }).join("");
  const specs = data.specs
    .filter((spec) => spec.label && spec.value)
    .slice(0, 8)
    .map((spec) => `<div class="feature"><dt>${escapeHtml(spec.label)}</dt><dd>${escapeHtml(spec.value)}</dd></div>`)
    .join("");
  const description = presentationDescription(data.description)
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
  const footer = `<footer><span class="footer-rule"></span><span class="footer-brand"><img src="/assets/habitoo-logo.png" alt="Habitoo CRM" />Fișă generată cu Habitoo CRM</span></footer>`;

  return `<!doctype html><html lang="ro"><head><meta charset="utf-8" />
<title>${escapeHtml(data.title)}</title>
<style>
  *{box-sizing:border-box}
  @page{size:A4;margin:0}
  html,body{margin:0;padding:0;background:#fff;color:${INK};font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{position:relative;width:210mm;height:297mm;margin:0 auto;padding:13mm 15mm 17mm;overflow:hidden;background:#fff;page-break-after:always}
  .page:last-child{page-break-after:auto}
  .brand-header{height:18mm;display:flex;align-items:center;justify-content:space-between;gap:10mm;border-bottom:1.2mm solid ${accent};padding-bottom:4mm}
  .brand{display:flex;min-width:0;align-items:center;gap:4mm}
  .agency-logo{display:block;max-width:38mm;max-height:12mm;object-fit:contain}
  .agency-monogram{display:grid;width:12mm;height:12mm;place-items:center;border-radius:3mm;background:${accent};color:#fff;font-size:12pt;font-weight:800}
  .agency-name{max-width:86mm;color:${NAVY};font-size:12pt;font-weight:800;line-height:1.15}
  .header-contact{text-align:right;color:${MUTED};font-size:8.5pt;line-height:1.45}
  .header-contact strong{display:block;color:${NAVY};font-size:10pt}
  .property-heading{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:8mm;padding:7mm 0 5mm}
  h1{margin:0;color:${NAVY};font-size:22pt;line-height:1.08}
  .location{margin:2mm 0 0;color:${MUTED};font-size:10pt;line-height:1.35}
  .price{margin:0;color:${accent};font-size:21pt;font-weight:800;white-space:nowrap}
  .gallery{margin:0;break-inside:avoid}
  .cover{display:flex;width:100%;height:91mm;align-items:center;justify-content:center;border-radius:3mm;background:${LINE};object-fit:cover;color:${MUTED};font-size:9pt}
  .thumbs{display:grid;grid-template-columns:repeat(4,1fr);gap:2.5mm;margin-top:2.5mm}
  .thumbs img,.thumbs .photo-empty{display:flex;width:100%;height:25mm;align-items:center;justify-content:center;border-radius:2mm;background:${LINE};object-fit:cover;color:${MUTED};font-size:8pt}
  .section-title{margin:5mm 0 2.5mm;color:${accent};font-size:9pt;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
  .features{display:grid;grid-template-columns:repeat(4,1fr);gap:2.2mm;margin:0;break-inside:avoid}
  .feature{min-height:16mm;padding:3mm;border:1px solid ${LINE};border-radius:2mm;background:#fafafa}
  .feature dt{margin:0 0 1.2mm;color:${MUTED};font-size:7.5pt}
  .feature dd{margin:0;color:${NAVY};font-size:10pt;font-weight:700;line-height:1.2}
  .description-title{margin:7mm 0 4mm;color:${NAVY};font-size:20pt;line-height:1.1}
  .description{max-height:154mm;overflow:hidden;color:${INK};font-size:11.2pt;line-height:1.62}
  .description p{margin:0 0 4mm;orphans:3;widows:3}
  .contact-card{position:absolute;right:15mm;bottom:28mm;left:15mm;display:grid;grid-template-columns:18mm minmax(0,1fr);align-items:center;gap:5mm;min-height:30mm;padding:5mm;border:1px solid ${LINE};border-left:1.5mm solid ${accent};border-radius:3mm;background:#fafafa;break-inside:avoid}
  .agent-photo,.agent-fallback{display:grid;width:18mm;height:18mm;place-items:center;border-radius:50%;background:${accent};object-fit:cover;color:#fff;font-size:12pt;font-weight:800}
  .contact-label{margin:0 0 1mm;color:${accent};font-size:8pt;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
  .contact-name{margin:0;color:${NAVY};font-size:13pt;font-weight:800}
  .contact-details{margin:1.5mm 0 0;color:${MUTED};font-size:9pt;line-height:1.5}
  footer{position:absolute;right:15mm;bottom:8mm;left:15mm;display:flex;align-items:center;gap:4mm;color:${MUTED};font-size:7.5pt}
  .footer-rule{height:1px;flex:1;background:${LINE}}
  .footer-brand{display:flex;align-items:center;gap:2mm;white-space:nowrap}
  .footer-brand img{display:block;width:20mm;height:5mm;object-fit:contain}
  @media screen{body{background:#e5e7eb}.page{margin:8mm auto;box-shadow:0 2mm 8mm rgba(22,34,60,.12)}}
  @media print{.page{margin:0;box-shadow:none}}
</style></head><body>
<section class="page page-one">
  <header class="brand-header"><div class="brand">${agencyLogo}<span class="agency-name">${escapeHtml(branding.agencyName)}</span></div><div class="header-contact">${headerPhone ? `<span>Contact direct</span><strong>${escapeHtml(headerPhone)}</strong>` : ""}</div></header>
  <div class="property-heading"><div><h1>${escapeHtml(data.title)}</h1><p class="location">${escapeHtml(data.location)}</p></div><p class="price">${escapeHtml(data.price)}</p></div>
  <figure class="gallery">${coverMarkup}<div class="thumbs">${thumbs}</div></figure>
  ${specs ? `<h2 class="section-title">Caracteristici</h2><dl class="features">${specs}</dl>` : ""}
  ${footer}
</section>
<section class="page page-two">
  <header class="brand-header"><div class="brand">${agencyLogo}<span class="agency-name">${escapeHtml(branding.agencyName)}</span></div><div class="header-contact">${headerPhone ? `<span>Contact direct</span><strong>${escapeHtml(headerPhone)}</strong>` : ""}</div></header>
  <h2 class="description-title">Descriere</h2>
  <div class="description">${description}</div>
  <aside class="contact-card">${agentPhoto}<div><p class="contact-label">Contact</p><p class="contact-name">${escapeHtml(data.agent?.name ?? branding.agencyName)}</p><p class="contact-details">${[contactPhone, contactEmail, branding.agencyName].filter(Boolean).map(escapeHtml).join(" · ")}</p></div></aside>
  ${footer}
</section>
</body></html>`;
}
