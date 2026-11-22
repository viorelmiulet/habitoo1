/**
 * Preluarea anunțurilor din API v2 IMMOFLUX (doar GET). Doar prima preluare:
 * un anunț deja existent în agenție (după `id` IMMOFLUX = `external_id`) nu se
 * atinge; nimic nu se retrage, nu se șterge și nu se trimite înapoi la IMMOFLUX.
 * Logica e pură: rețeaua și baza de date vin prin `deps` (testabile fără apeluri reale).
 */
import { IMMOFLUX_MAX_PAGES } from "./connection";
import { mapImmofluxItem, UNMAPPED_CODES_PREFIX, type ImmofluxItem, type ImmofluxPropertyRow, type ImmofluxImage } from "./mapper";

export const IMMOFLUX_CURRENCY_CODES: Record<string, number> = { EUR: 1, RON: 2, LEI: 2, USD: 3 };

/** `price_currency` ca număr (1/2/3) sau text („EUR”); altfel null. */
export function currencyCode(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string") {
    const t = value.trim().toUpperCase();
    if (/^\d+$/.test(t)) return Number(t);
    return IMMOFLUX_CURRENCY_CODES[t] ?? null;
  }
  return null;
}

const asLocalized = (v: unknown) => (typeof v === "string" ? { ro: v } : v && typeof v === "object" ? v : null);
const asNamed = (v: unknown) => (typeof v === "string" ? { name: v } : v && typeof v === "object" ? v : null);

export function agentEmailOf(raw: Record<string, unknown>): string | null {
  const nested = raw["agent"] && typeof raw["agent"] === "object" ? (raw["agent"] as Record<string, unknown>)["email"] : null;
  const v = typeof raw["agent_email"] === "string" ? raw["agent_email"] : typeof nested === "string" ? nested : null;
  const t = v?.trim().toLowerCase();
  return t ? t : null;
}

export function agentNameOf(raw: Record<string, unknown>): string | null {
  const a = raw["agent"] && typeof raw["agent"] === "object" ? (raw["agent"] as Record<string, unknown>) : {};
  const v = [raw["agent_name"], a["name"], a["full_name"]].find((x) => typeof x === "string" && x.trim());
  return typeof v === "string" ? v.trim() : null;
}

/** `images` nedocumentat: listă de URL-uri sau obiecte cu `url` / `src` / `path`. Căile relative se leagă de `base`. */
export function normalizeImages(value: unknown, base?: string | null): { src: string | null; ordering: number }[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((img, index) => {
    const o = img && typeof img === "object" ? (img as Record<string, unknown>) : null;
    const rawSrc = typeof img === "string" ? img : o ? [o["url"], o["src"], o["path"]].find((x) => typeof x === "string" && x.trim()) : null;
    let src = typeof rawSrc === "string" ? rawSrc.trim() : null;
    if (src && src.startsWith("//")) src = `https:${src}`;
    else if (src && !/^[a-z]+:/i.test(src) && base) { try { src = new URL(src, base).toString(); } catch { src = null; } }
    const ord = o && typeof o["ordering"] === "number" ? (o["ordering"] as number) : index;
    return { src, ordering: ord };
  });
}

/** Aduce un element din API v2 la forma acceptată de mapper (text/număr, poze normalizate). */
export function normalizeApiItem(raw: Record<string, unknown>, base?: string | null, agentEmail?: string | null): ImmofluxItem {
  const email = agentEmail ?? agentEmailOf(raw);
  return {
    ...raw,
    id: typeof raw["id"] === "string" && /^\d+$/.test(raw["id"]) ? Number(raw["id"]) : raw["id"],
    title: asLocalized(raw["title"]),
    description: asLocalized(raw["description"]),
    city: asNamed(raw["city"]),
    zone: asNamed(raw["zone"]),
    price_currency: currencyCode(raw["price_currency"]),
    images: normalizeImages(raw["images"], base),
    agent: email ? { email } : null,
  } as unknown as ImmofluxItem;
}

/** Lista nu are detaliile complete → se cere `GET /property/{id}`. */
export function needsDetail(raw: Record<string, unknown>): boolean {
  return !("images" in raw) || !("description" in raw) || !("category_id" in raw);
}

export type ImmofluxPage = { items: Record<string, unknown>[]; lastPage: number | null; total: number | null; hasNext: boolean; signature: string };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);

/**
 * Paginarea v2 nu e documentată: `current_page`/`last_page`/`next_page_url` (și sub `meta`/`links`)
 * dacă există; altfel se continuă până la o pagină goală.
 */
export function parsePage(body: unknown, page: number): ImmofluxPage {
  const b = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const meta = b["meta"] && typeof b["meta"] === "object" ? (b["meta"] as Record<string, unknown>) : {};
  const links = b["links"] && typeof b["links"] === "object" && !Array.isArray(b["links"]) ? (b["links"] as Record<string, unknown>) : {};
  const list = Array.isArray(body) ? body : Array.isArray(b["data"]) ? b["data"] : Array.isArray(b["properties"]) ? b["properties"] : [];
  const items = (list as unknown[]).filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x));
  const lastPage = num(b["last_page"]) ?? num(meta["last_page"]);
  const current = num(b["current_page"]) ?? num(meta["current_page"]) ?? page;
  const total = num(b["total"]) ?? num(meta["total"]);
  const nextKey = "next_page_url" in b ? b["next_page_url"] : "next" in links ? links["next"] : undefined;
  let hasNext: boolean;
  if (items.length === 0) hasNext = false;
  else if (lastPage !== null) hasNext = current < lastPage;
  else if (nextKey !== undefined) hasNext = typeof nextKey === "string" && nextKey.length > 0;
  else hasNext = true; // fără metadate: `page` incrementat până la o pagină goală
  const signature = items.map((i) => String(i["id"] ?? "")).sort().join(",");
  return { items, lastPage, total, hasNext, signature };
}

export function unwrapDetail(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const d = (body as Record<string, unknown>)["data"];
  return d && typeof d === "object" && !Array.isArray(d) ? (d as Record<string, unknown>) : (body as Record<string, unknown>);
}

export type HabitooStatus = "active" | "reserved" | "sold" | "rented" | "expired" | "archived";
export const IMMOFLUX_STATUS_LABELS: Record<number, string> = { 1: "Activă", 2: "În așteptare", 3: "Tranzacționată", 4: "Pierdută", 5: "Retrasă" };
const HABITOO_STATUS_LABELS: Record<HabitooStatus, string> = { active: "Activă", reserved: "Rezervată", sold: "Vândută", rented: "Închiriată", expired: "Expirată", archived: "Arhivată" };

/** Corespondența cu statusurile existente Habitoo (doar informativ: anunțul intră mereu ca ciornă). */
export function mapImmofluxStatus(status: unknown, transactionId: unknown): HabitooStatus | null {
  switch (num(status)) {
    case 1: return "active";
    case 2: return "reserved";
    case 3: return num(transactionId) === 2 ? "rented" : "sold";
    case 4: return "expired";
    case 5: return "archived";
    default: return null;
  }
}

const NOTE_SOURCES: [string, string][] = [["private_notes", "IMMOFLUX – note private"], ["price_notes", "IMMOFLUX – note preț"], ["agent_opinion", "IMMOFLUX – opinia agentului"]];

/** Note interne (niciodată publice): notele IMMOFLUX cu eticheta sursei, plus statusul original. */
export function buildInternalNotes(raw: Record<string, unknown>): string | null {
  const parts: string[] = [];
  const code = num(raw["status"]);
  const mapped = mapImmofluxStatus(raw["status"], raw["transaction_id"]);
  if (code !== null && IMMOFLUX_STATUS_LABELS[code]) parts.push(`IMMOFLUX – status: ${IMMOFLUX_STATUS_LABELS[code]}${mapped ? ` (în Habitoo: ${HABITOO_STATUS_LABELS[mapped]})` : ""}`);
  for (const [key, label] of NOTE_SOURCES) {
    const v = raw[key];
    const t = typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "";
    if (t) parts.push(`${label}:\n${t}`);
  }
  return parts.length ? parts.join("\n\n") : null;
}

export type ImmofluxAgent = { id: string; email: string | null; name: string | null };

export function parseAgents(body: unknown): ImmofluxAgent[] {
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const list = Array.isArray(body) ? body : Array.isArray(b["data"]) ? b["data"] : Array.isArray(b["agents"]) ? b["agents"] : [];
  return (list as unknown[]).flatMap((a) => {
    if (!a || typeof a !== "object") return [];
    const o = a as Record<string, unknown>;
    if (o["id"] === undefined || o["id"] === null) return [];
    const email = firstString(o["email"]) ?? firstString(o["emails"]);
    const name = firstString(o["name"]) ?? firstString(o["full_name"]) ?? ([firstString(o["first_name"]), firstString(o["last_name"])].filter(Boolean).join(" ") || null);
    return [{ id: String(o["id"]), email: email?.toLowerCase() ?? null, name }];
  });
}

function firstString(v: unknown): string | null {
  if (typeof v === "string") { const t = v.split(/[,;]/)[0]!.trim(); return t || null; }
  if (Array.isArray(v)) { for (const x of v) { const s = firstString(x && typeof x === "object" ? ((x as Record<string, unknown>)["value"] ?? (x as Record<string, unknown>)["email"] ?? (x as Record<string, unknown>)["phone"] ?? (x as Record<string, unknown>)["number"]) : x); if (s) return s; } }
  return null;
}

export type Landlord = { immofluxId: string | null; firstName: string; lastName: string; phone: string | null; email: string | null };

/** Telefon normalizat pentru deduplicare: doar cifre, prefix RO → 0. */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0040")) d = "0" + d.slice(4);
  else if (d.startsWith("40") && d.length === 11) d = "0" + d.slice(2);
  return d.length >= 6 ? d : null;
}

export function landlordFrom(value: unknown, fallbackId?: unknown): Landlord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  let first = firstString(o["first_name"]) ?? "";
  let last = firstString(o["last_name"]) ?? "";
  if (!first && !last) {
    const full = firstString(o["name"]) ?? firstString(o["full_name"]) ?? "";
    const parts = full.split(/\s+/).filter(Boolean);
    first = parts.slice(0, -1).join(" ") || parts[0] || ""; last = parts.length > 1 ? parts[parts.length - 1]! : "";
  }
  const phone = firstString(o["phone"]) ?? firstString(o["phones"]);
  const email = (firstString(o["email"]) ?? firstString(o["emails"]))?.toLowerCase() ?? null;
  if (!first && !last && !phone && !email) return null;
  const id = o["id"] ?? fallbackId;
  return { immofluxId: id === undefined || id === null ? null : String(id), firstName: first || "Proprietar", lastName: last || "IMMOFLUX", phone: phone ?? null, email };
}

export type ImportJob = {
  id: string;
  organization_id: string;
  requested_by: string;
  next_page: number;
  next_index: number;
  last_page: number | null;
  total: number | null;
  imported_count: number;
  existing_count: number;
  error_count: number;
  unmapped_codes: string[];
  report: ReportEntry[];
  page_signature?: string | null;
  /** 0–4 = statusurile 1–5 (`filter_status__eq`), 5 = rezerva fără filtru. */
  status_step?: number;
  /** Câte statusuri au dat eroare la citire. */
  status_failures?: number;
};

export type ReportEntry = { immofluxId: string | null; ref?: string | null; kind: "imported" | "error" | "agent" | "image" | "unmapped" | "status" | "owner" | "pagination"; message: string; propertyId?: string };

export type ImportRow = ImmofluxPropertyRow & { status: "draft"; publish_status: "unpublished"; external_reference: string | null; owner_contact_id: string | null };

export type ImportDeps = {
  isEnabled: (organizationId: string) => Promise<boolean>;
  /** `status` 1–5 → `filter_status__eq`; `null` → fără filtru de status. */
  fetchPage: (organizationId: string, page: number, status: number | null) => Promise<unknown>;
  fetchDetail: (organizationId: string, id: string) => Promise<unknown>;
  /** `GET /agents` al agenției jobului. */
  fetchAgents: (organizationId: string) => Promise<unknown>;
  /** `GET /contact/{id}` când anunțul are doar `landlord_id`. */
  fetchContact?: (organizationId: string, id: string) => Promise<unknown>;
  /** Baza pentru căi relative de imagini (`https://{subdomeniu}.immoflux.ro`). */
  imageBase?: (organizationId: string) => Promise<string | null>;
  /** ID-urile IMMOFLUX existente deja în această agenție (inclusiv șterse). */
  existingIds: (organizationId: string, ids: string[]) => Promise<Set<string>>;
  members: (organizationId: string) => Promise<{ id: string; email: string | null }[]>;
  fallbackAdmin: (organizationId: string) => Promise<string | null>;
  /** Contact existent în agenție după telefon normalizat. */
  findContactByPhone: (organizationId: string, phone: string) => Promise<string | null>;
  findContactByEmail: (organizationId: string, email: string) => Promise<string | null>;
  createContact: (job: ImportJob, contact: Landlord, assignedTo: string | null) => Promise<string>;
  createProperty: (job: ImportJob, row: ImportRow) => Promise<string>;
  enqueueImages: (job: ImportJob, propertyId: string, images: ImmofluxImage[]) => Promise<void>;
  save: (job: ImportJob) => Promise<void>;
  /** Maschează secretele în mesajele din raport. */
  mask?: (text: string) => string;
  deadline?: () => boolean;
};

export type StepOutcome = "page" | "done" | "stopped";

const MAX_REPORT = 2000;
function push(job: ImportJob, e: ReportEntry) { if (job.report.length < MAX_REPORT) job.report.push(e); }

/** Găsește sau creează contactul proprietarului (telefon, apoi email; doar în agenție). Contactele existente nu se modifică. */
export async function resolveOwner(job: ImportJob, deps: ImportDeps, landlord: Landlord, assignedTo: string | null): Promise<{ id: string; created: boolean }> {
  const org = job.organization_id;
  const phone = normalizePhone(landlord.phone);
  if (phone) { const id = await deps.findContactByPhone(org, phone); if (id) return { id, created: false }; }
  if (landlord.email) { const id = await deps.findContactByEmail(org, landlord.email); if (id) return { id, created: false }; }
  return { id: await deps.createContact(job, landlord, assignedTo), created: true };
}

/** Statusurile IMMOFLUX citite pe rând; după ele urmează rezerva fără filtru doar dacă toate au eșuat. */
export const IMMOFLUX_STATUS_STEPS = [1, 2, 3, 4, 5] as const;

/** Trece la statusul următor (pagina 1) sau încheie importul. */
async function nextStatus(job: ImportJob, deps: ImportDeps): Promise<StepOutcome> {
  const step = job.status_step ?? 0;
  job.next_page = 1; job.next_index = 0; job.page_signature = null;
  if (step < IMMOFLUX_STATUS_STEPS.length - 1) { job.status_step = step + 1; await deps.save(job); return "page"; }
  if (step === IMMOFLUX_STATUS_STEPS.length - 1 && (job.status_failures ?? 0) >= IMMOFLUX_STATUS_STEPS.length) {
    job.status_step = IMMOFLUX_STATUS_STEPS.length;
    push(job, { immofluxId: null, kind: "pagination", message: "Toate cererile pe status au eșuat: import fără filtru de status; s-a preluat doar ce întoarce IMMOFLUX implicit." });
    await deps.save(job); return "page";
  }
  job.status_step = step + 1;
  await deps.save(job); return "done";
}

/** Procesează pagina curentă (de la `next_index`), salvând după fiecare anunț. */
export async function runImportPage(job: ImportJob, deps: ImportDeps): Promise<StepOutcome> {
  const org = job.organization_id; // mereu din job (configurare), niciodată din cerere
  const mask = deps.mask ?? ((t: string) => t);
  if (!(await deps.isEnabled(org))) return "stopped";
  if (job.next_page > IMMOFLUX_MAX_PAGES) {
    push(job, { immofluxId: null, kind: "pagination", message: `Oprit la limita de siguranță de ${IMMOFLUX_MAX_PAGES} de pagini.` });
    return nextStatus(job, deps);
  }
  const step = job.status_step ?? 0;
  const status = step < IMMOFLUX_STATUS_STEPS.length ? IMMOFLUX_STATUS_STEPS[step]! : null;
  const label = status === null ? "fără filtru" : `status ${status}`;
  let body: unknown;
  try { body = await deps.fetchPage(org, job.next_page, status); }
  catch (e) {
    if (status === null) throw e; // rezerva a eșuat: jobul se oprește cu eroarea (mascată)
    job.status_failures = (job.status_failures ?? 0) + 1;
    push(job, { immofluxId: null, kind: "pagination", message: mask(`${label}: ${e instanceof Error ? e.message.replace(/^IMMOFLUX a răspuns cu /, "") : "eroare"}`).slice(0, 400) });
    return nextStatus(job, deps);
  }
  const page = parsePage(body, job.next_page);
  if (job.next_index === 0 && page.items.length > 0 && job.page_signature && page.signature === job.page_signature) {
    push(job, { immofluxId: null, kind: "pagination", message: `${label}: pagina ${job.next_page} repetă anunțurile paginii anterioare.` });
    return nextStatus(job, deps);
  }
  job.last_page = page.lastPage ?? job.last_page;
  job.total = page.total ?? job.total;
  const ids = page.items.map((i) => String(i["id"] ?? "")).filter(Boolean);
  const existing = await deps.existingIds(org, ids);
  const members = await deps.members(org);
  const admin = await deps.fallbackAdmin(org);
  const agents = new Map(parseAgents(await deps.fetchAgents(org)).map((a) => [a.id, a]));
  const base = deps.imageBase ? await deps.imageBase(org) : null;
  const unmapped = new Set(job.unmapped_codes);

  for (let i = job.next_index; i < page.items.length; i += 1) {
    if (deps.deadline?.()) { job.next_index = i; await deps.save(job); return "page"; }
    let raw = page.items[i]!;
    const id = raw["id"] === undefined || raw["id"] === null ? null : String(raw["id"]);
    const ref = typeof raw["ref"] === "string" || typeof raw["ref"] === "number" ? String(raw["ref"]) : null;
    try {
      if (!id) throw new Error("Anunț fără `id`.");
      if (existing.has(id)) { job.existing_count += 1; continue; }
      if (needsDetail(raw)) {
        const detail = unwrapDetail(await deps.fetchDetail(org, id));
        if (detail) raw = { ...raw, ...detail };
      }
      const agentKey = raw["agent_id"] === undefined || raw["agent_id"] === null ? null : String(raw["agent_id"]);
      const agent = agentKey ? agents.get(agentKey) : undefined;
      const email = agent?.email ?? agentEmailOf(raw);
      const member = email ? members.find((m) => (m.email ?? "").trim().toLowerCase() === email) : undefined;
      const assignedTo = member?.id ?? admin;
      const item = normalizeApiItem(raw, base, email);
      const mapped = mapImmofluxItem(item, { organizationId: org, assignedTo, members: member ? [member] : [] });
      if (!mapped.ok) throw new Error(mapped.reasons.join(" "));
      for (const w of mapped.warnings) {
        if (w.startsWith(UNMAPPED_CODES_PREFIX)) for (const c of w.slice(UNMAPPED_CODES_PREFIX.length).split(",")) { const t = c.trim(); if (t) unmapped.add(t); }
      }
      let landlord = landlordFrom(raw["landlord"], raw["landlord_id"]);
      const landlordId = raw["landlord_id"] === undefined || raw["landlord_id"] === null || raw["landlord_id"] === 0 ? null : String(raw["landlord_id"]);
      if (!landlord && landlordId && deps.fetchContact) {
        try { landlord = landlordFrom(unwrapDetail(await deps.fetchContact(org, landlordId)), landlordId); }
        catch (e) { push(job, { immofluxId: id, ref, kind: "owner", message: mask(`Proprietarul nu a putut fi citit: ${e instanceof Error ? e.message : "eroare"}`) }); }
      }
      const owner = landlord ? await resolveOwner(job, deps, landlord, assignedTo) : null;
      const propertyId = await deps.createProperty(job, {
        ...mapped.row,
        organization_id: org,
        assigned_to: assignedTo,
        internal_notes: buildInternalNotes(raw),
        status: "draft",
        publish_status: "unpublished",
        external_reference: ref,
        owner_contact_id: owner?.id ?? null,
      } as ImportRow);
      existing.add(id);
      job.imported_count += 1;
      const habitoo = mapImmofluxStatus(raw["status"], raw["transaction_id"]);
      if (habitoo) push(job, { immofluxId: id, ref, kind: "status", propertyId, message: `Status IMMOFLUX ${IMMOFLUX_STATUS_LABELS[num(raw["status"])!]} → ${habitoo}; importat ca ciornă.` });
      if (!member) push(job, { immofluxId: id, ref, kind: "agent", propertyId, message: `Agent IMMOFLUX ${agent?.name ?? agentNameOf(raw) ?? email ?? "necunoscut"} negăsit în agenție: asignat administratorului.` });
      try { if (mapped.images.length) await deps.enqueueImages(job, propertyId, mapped.images); }
      catch (e) { push(job, { immofluxId: id, ref, kind: "image", propertyId, message: mask(`Pozele nu au putut fi puse în coadă: ${e instanceof Error ? e.message : "eroare"}`) }); }
    } catch (e) {
      job.error_count += 1;
      push(job, { immofluxId: id, ref, kind: "error", message: mask(e instanceof Error ? e.message : "Eroare necunoscută.").slice(0, 300) });
    } finally {
      job.unmapped_codes = [...unmapped];
      job.next_index = i + 1;
    }
  }
  if (!page.hasNext) return nextStatus(job, deps);
  job.page_signature = page.signature;
  job.next_page += 1;
  job.next_index = 0;
  await deps.save(job);
  return "page";
}

export function finishMessage(job: Pick<ImportJob, "imported_count" | "existing_count" | "error_count">): string {
  return `${job.imported_count} importate, ${job.existing_count} deja existente, ${job.error_count} cu erori`;
}
