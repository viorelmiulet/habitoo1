export const PROPERTY_SHEET_TEMPLATES = [
  { id: "classic", name: "Clasic" }, { id: "elegant", name: "Elegant" },
  { id: "panoramic", name: "Panoramic" }, { id: "split", name: "Split" },
  { id: "gallery", name: "Galerie" }, { id: "minimal", name: "Minimal" },
] as const;
export type PropertySheetTemplate = typeof PROPERTY_SHEET_TEMPLATES[number]["id"];
export function sheetTemplate(value: unknown): PropertySheetTemplate {
  return PROPERTY_SHEET_TEMPLATES.find(item => item.id === value)?.id ?? "classic";
}
export function preferredSheetTemplate(saved: unknown, agency: unknown) {
  return PROPERTY_SHEET_TEMPLATES.some(item => item.id === saved) ? sheetTemplate(saved) : sheetTemplate(agency);
}

/** Reuse the privacy-filtered fragments from the classic sheet, never raw property data. */
export function restylePropertySheet(html: string, template: PropertySheetTemplate, photos: string[], escape: (value: unknown) => string) {
  if (template === "classic") return html;
  const fragment = (pattern: RegExp) => html.match(pattern)?.[0] ?? "";
  const header = fragment(/<header class="brand-header">[\s\S]*?<\/header>/);
  const heading = fragment(/<div class="property-heading">[\s\S]*?<\/p><\/div>/);
  const features = fragment(/<dl class="features">[\s\S]*?<\/dl>/);
  const cover = fragment(/<(?:img|div) class="cover[\s\S]*?(?:\/>|<\/div>)/);
  const contact = fragment(/<aside class="contact-card">[\s\S]*?<\/aside>/);
  const footer = fragment(/<footer>[\s\S]*?<\/footer>/);
  const description = fragment(/<div class="description"[^>]*>[\s\S]*?<\/div>/);
  const smallPhotos = (count: number, start = 1) => photos.slice(start, start + count).map((src, i) => `<img src="${escape(src)}" alt="Fotografie proprietate ${start + i + 1}" />`).join("");
  const details = `<div class="sheet-details">${features}${contact}</div>`;
  let first = "";
  if (template === "elegant") first = `${header}<p class="exclusive">Ofertă exclusivă</p>${cover}${heading}${details}`;
  if (template === "panoramic") first = `<div class="panorama">${cover}<div class="panorama-shade"></div>${heading}</div><div class="panorama-band">${header}${features}</div><div class="small-photos">${smallPhotos(3)}</div>${contact}`;
  if (template === "split") first = `<div class="split-sidebar">${header}${heading}${features}${contact}</div><div class="split-photos">${cover}<div class="small-photos">${smallPhotos(2)}</div></div>`;
  if (template === "gallery") first = `${header}${cover}${heading}${details}`;
  if (template === "minimal") first = `${header}${heading}<div class="minimal-mosaic">${cover}<div class="small-photos">${smallPhotos(2)}</div></div>${details}`;
  const galleryPage = template === "gallery" && photos.length > 1
    ? `<section class="page photo-page">${header}<h2 class="description-title">Galerie</h2><div class="photo-grid">${smallPhotos(8, 1)}</div>${footer}</section>` : "";
  const descriptionPage = description ? `<section class="page text-page" data-sheet-description-page>${header}<h2 class="description-title">Descriere</h2>${description}${contact}${footer}</section>` : "";
  const css = `
  body{--sheet-paper:#fff;--sheet-dark:#16223c;--sheet-ink:#1f2937;--sheet-muted:#6b7280;--sheet-line:#e6e8ec;--sheet-light:#fff;--sheet-cream:#fbf7ee;--sheet-shade:linear-gradient(transparent,rgba(0,0,0,.85))}
  .page{background:var(--sheet-paper)}h1,.price,.agency-name,.feature dd{overflow-wrap:anywhere;white-space:normal}.property-heading{grid-template-columns:minmax(0,1fr);gap:3mm;padding:5mm 0}.price{font-size:24pt}.sheet-details{margin-top:4mm}.contact-card{min-height:25mm;padding:3mm;bottom:24mm}.contact-name{font-size:12pt}.contact-details{overflow-wrap:anywhere}.features{gap:2mm}.small-photos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2mm}.small-photos img{width:100%;height:35mm;object-fit:cover}.cover{border-radius:0}.description{height:154mm;max-height:none;overflow:visible;overflow-wrap:anywhere}.description p{white-space:pre-wrap}
  body[data-template=elegant]{--sheet-paper:var(--sheet-cream)}[data-template=elegant] h1,[data-template=elegant] .description-title{font-family:Georgia,'Times New Roman',serif;font-weight:400}[data-template=elegant] .cover{height:118mm}[data-template=elegant] .exclusive{color:var(--sheet-accent);font-size:9pt;text-transform:uppercase;border-bottom:1px solid var(--sheet-accent);padding-bottom:3mm;margin:4mm 0}[data-template=elegant] .features{grid-template-columns:repeat(2,minmax(0,1fr))}[data-template=elegant] .feature{min-height:10mm;padding:2mm 2mm 2mm 7mm;position:relative;border:0;border-bottom:1px solid var(--sheet-accent);background:transparent}[data-template=elegant] .feature:before{content:'◇';position:absolute;left:1mm;top:3mm;color:var(--sheet-accent)}[data-template=elegant] .feature dt,[data-template=elegant] .feature dd{display:inline;font-size:9pt;margin-right:2mm}
  [data-template=panoramic] .cover-page{padding:0 0 17mm}.panorama{height:174mm;position:relative;background:var(--sheet-dark)}.panorama>.cover{height:100%;width:100%}.panorama-shade{position:absolute;inset:0;background:var(--sheet-shade)}.panorama .property-heading{position:absolute;bottom:0;left:15mm;right:15mm;padding:8mm 0}.panorama h1,.panorama .location,.panorama .price{color:var(--sheet-light)}.panorama-band{background:var(--sheet-dark);padding:5mm 15mm}.panorama-band .agency-name,.panorama-band .feature dd{color:var(--sheet-light)}.panorama-band .brand-header{height:15mm;margin-bottom:3mm}.panorama-band .feature{background:transparent;border-color:var(--sheet-muted)}[data-template=panoramic] .cover-page>.small-photos{margin:3mm 15mm}[data-template=panoramic] .cover-page>.contact-card{position:static;margin:3mm 15mm;min-height:17mm;padding:2mm}[data-template=panoramic] .cover-page>.contact-card .agent-photo,[data-template=panoramic] .cover-page>.contact-card .agent-fallback{width:12mm;height:12mm}
  [data-template=split] .cover-page{padding:0 0 17mm;display:grid;grid-template-columns:38% 62%;height:297mm}.split-sidebar{background:var(--sheet-dark);padding:12mm 6mm 8mm;color:var(--sheet-light)}.split-sidebar .brand-header{height:auto;min-height:25mm;display:block}.split-sidebar .brand{display:block}.split-sidebar .agency-name{display:block;margin-top:3mm;color:var(--sheet-light);font-size:10pt}.split-sidebar .header-contact{display:none}.split-sidebar h1,.split-sidebar .location{color:var(--sheet-light)}.split-sidebar h1{font-size:21pt}.split-sidebar .price{font-size:22pt}.split-sidebar .features{grid-template-columns:1fr}.split-sidebar .feature{min-height:10mm;padding:2mm;background:transparent;border:0;border-bottom:1px solid var(--sheet-muted)}.split-sidebar .feature dt{color:var(--sheet-light);opacity:.7}.split-sidebar .feature dd{color:var(--sheet-light)}.split-sidebar .contact-card{position:static;display:block;margin-top:5mm;background:transparent;border:0;padding:0}.split-sidebar .contact-name,.split-sidebar .contact-details{color:var(--sheet-light)}.split-sidebar .agent-photo,.split-sidebar .agent-fallback{display:none}.split-photos{display:grid;grid-template-rows:1fr 45mm;gap:2mm;min-height:0}.split-photos>.cover{height:100%;min-height:0}.split-photos .small-photos{grid-template-columns:repeat(2,minmax(0,1fr))}.split-photos .small-photos img{height:45mm}
  [data-template=gallery] .cover-page>.cover{height:137mm}.photo-grid{display:grid;height:220mm;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr));gap:3mm}.photo-grid img{width:100%;height:100%;object-fit:cover}
  [data-template=minimal] .price{color:var(--sheet-ink);font-size:36pt}[data-template=minimal] .brand-header{border-bottom:1px solid var(--sheet-ink)}.minimal-mosaic{height:110mm;display:grid;grid-template-columns:2fr 1fr;gap:2mm}.minimal-mosaic>.cover{height:100%}.minimal-mosaic .small-photos{grid-template-columns:1fr;grid-template-rows:repeat(2,1fr)}.minimal-mosaic .small-photos img{height:54mm}[data-template=minimal] .features{display:block}[data-template=minimal] .feature{display:grid;grid-template-columns:1fr 1fr;min-height:8mm;padding:2mm 0;border:0;border-bottom:1px solid var(--sheet-line);border-radius:0;background:transparent}[data-template=minimal] .feature dd{font-size:10pt}[data-template=minimal] .contact-card{border-left:1px solid var(--sheet-ink)}
  `;
  return html.replace("</style>", `${css}</style>`).replace(/<body>[\s\S]*<\/body>/, `<body data-template="${template}"><section class="page cover-page">${first}${footer}</section>${galleryPage}${descriptionPage}</body>`);
}