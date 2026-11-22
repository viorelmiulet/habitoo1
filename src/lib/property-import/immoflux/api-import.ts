/**
 * Preluarea anunțurilor din API-ul IMMOFLUX (etapa 2). Doar prima preluare:
 * un anunț deja existent în agenție (după `id` IMMOFLUX = `external_id`) nu se
 * atinge; nimic nu se retrage, nu se șterge și nu se trimite înapoi la IMMOFLUX.
 * Logica e pură: rețeaua și baza de date vin prin `deps` (testabile fără apeluri reale).
 */
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

/** Aduce un element din API la forma acceptată de mapper (text/număr, liste de poze ca șiruri). */
export function normalizeApiItem(raw: Record<string, unknown>): ImmofluxItem {
  const images = Array.isArray(raw["images"])
    ? (raw["images"] as unknown[]).map((img, index) =>
        typeof img === "string" ? { src: img, ordering: index }
        : img && typeof img === "object" ? { src: (img as Record<string, unknown>)["src"] ?? (img as Record<string, unknown>)["url"], ordering: (img as Record<string, unknown>)["ordering"] ?? index }
        : { src: null, ordering: index })
    : null;
  const email = agentEmailOf(raw);
  return {
    ...raw,
    id: typeof raw["id"] === "string" && /^\d+$/.test(raw["id"]) ? Number(raw["id"]) : raw["id"],
    title: asLocalized(raw["title"]),
    description: asLocalized(raw["description"]),
    city: asNamed(raw["city"]),
    zone: asNamed(raw["zone"]),
    price_currency: currencyCode(raw["price_currency"]),
    images,
    agent: email ? { email } : null,
  } as unknown as ImmofluxItem;
}

/** Lista nu are detaliile complete → se cere `GET /properties/{id}`. */
export function needsDetail(raw: Record<string, unknown>): boolean {
  return !("images" in raw) || !("description" in raw) || !("category_id" in raw);
}

export type ImmofluxPage = { items: Record<string, unknown>[]; lastPage: number | null; total: number | null; hasNext: boolean };

export function parsePage(body: unknown, page: number): ImmofluxPage {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const items = (Array.isArray(b["data"]) ? b["data"] : Array.isArray(body) ? body : []).filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object");
  const lastPage = typeof b["last_page"] === "number" ? b["last_page"] : null;
  const total = typeof b["total"] === "number" ? b["total"] : null;
  const hasNext = lastPage !== null ? page < lastPage : typeof b["next_page_url"] === "string" && b["next_page_url"].length > 0;
  return { items, lastPage, total, hasNext };
}

export function unwrapDetail(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const d = (body as Record<string, unknown>)["data"];
  return d && typeof d === "object" && !Array.isArray(d) ? (d as Record<string, unknown>) : (body as Record<string, unknown>);
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
};

export type ReportEntry = { immofluxId: string | null; ref?: string | null; kind: "imported" | "error" | "agent" | "image" | "unmapped"; message: string; propertyId?: string };

export type ImportDeps = {
  /** Configurarea agenției jobului; null = ștearsă sau dezactivată. */
  isEnabled: (organizationId: string) => Promise<boolean>;
  fetchPage: (organizationId: string, page: number) => Promise<unknown>;
  fetchDetail: (organizationId: string, id: string) => Promise<unknown>;
  /** ID-urile IMMOFLUX existente deja în această agenție (inclusiv șterse). */
  existingIds: (organizationId: string, ids: string[]) => Promise<Set<string>>;
  members: (organizationId: string) => Promise<{ id: string; email: string | null }[]>;
  fallbackAdmin: (organizationId: string) => Promise<string | null>;
  createProperty: (job: ImportJob, row: ImmofluxPropertyRow & { status: "draft"; publish_status: "unpublished"; external_reference: string | null }) => Promise<string>;
  enqueueImages: (job: ImportJob, propertyId: string, images: ImmofluxImage[]) => Promise<void>;
  save: (job: ImportJob) => Promise<void>;
  deadline?: () => boolean;
};

export type StepOutcome = "page" | "done" | "stopped";

const MAX_REPORT = 2000;
function push(job: ImportJob, e: ReportEntry) { if (job.report.length < MAX_REPORT) job.report.push(e); }

/** Procesează pagina curentă (de la `next_index`), salvând după fiecare anunț. */
export async function runImportPage(job: ImportJob, deps: ImportDeps): Promise<StepOutcome> {
  const org = job.organization_id; // mereu din job (configurare), niciodată din cerere
  if (!(await deps.isEnabled(org))) return "stopped";
  const page = parsePage(await deps.fetchPage(org, job.next_page), job.next_page);
  job.last_page = page.lastPage ?? job.last_page;
  job.total = page.total ?? job.total;
  const ids = page.items.map((i) => String(i["id"] ?? "")).filter(Boolean);
  const existing = await deps.existingIds(org, ids);
  const members = await deps.members(org);
  const admin = await deps.fallbackAdmin(org);
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
      const item = normalizeApiItem(raw);
      const email = agentEmailOf(raw);
      const member = email ? members.find((m) => (m.email ?? "").trim().toLowerCase() === email) : undefined;
      const mapped = mapImmofluxItem(item, { organizationId: org, assignedTo: member?.id ?? admin, members: member ? [member] : [] });
      if (!mapped.ok) throw new Error(mapped.reasons.join(" "));
      for (const w of mapped.warnings) {
        if (w.startsWith(UNMAPPED_CODES_PREFIX)) for (const c of w.slice(UNMAPPED_CODES_PREFIX.length).split(",")) { const t = c.trim(); if (t) unmapped.add(t); }
      }
      const propertyId = await deps.createProperty(job, {
        ...mapped.row,
        organization_id: org,
        assigned_to: member?.id ?? admin,
        status: "draft",
        publish_status: "unpublished",
        external_reference: ref,
      } as never);
      existing.add(id);
      job.imported_count += 1;
      if (!member) push(job, { immofluxId: id, ref, kind: "agent", propertyId, message: `Agent IMMOFLUX ${agentNameOf(raw) ?? email ?? "necunoscut"} negăsit în agenție: asignat administratorului.` });
      try { if (mapped.images.length) await deps.enqueueImages(job, propertyId, mapped.images); }
      catch (e) { push(job, { immofluxId: id, ref, kind: "image", propertyId, message: `Pozele nu au putut fi puse în coadă: ${e instanceof Error ? e.message : "eroare"}` }); }
    } catch (e) {
      job.error_count += 1;
      push(job, { immofluxId: id, ref, kind: "error", message: e instanceof Error ? e.message.slice(0, 300) : "Eroare necunoscută." });
    } finally {
      job.unmapped_codes = [...unmapped];
      job.next_index = i + 1;
    }
  }
  if (!page.hasNext || page.items.length === 0) { await deps.save(job); return "done"; }
  job.next_page += 1;
  job.next_index = 0;
  await deps.save(job);
  return "page";
}

export function finishMessage(job: Pick<ImportJob, "imported_count" | "existing_count" | "error_count">): string {
  return `${job.imported_count} importate, ${job.existing_count} deja existente, ${job.error_count} cu erori`;
}
