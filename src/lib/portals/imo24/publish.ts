/**
 * Publicarea imo24.ro (pasul 3): PUT/DELETE `/anunturi/by-external/{external_id}`.
 * Logică fără bază de date; apelurile trec prin clientul imo24 (rata, 401, reîncercări).
 * Endpointurile `/credite` și promovarea nu sunt folosite.
 */
import { imo24Request, type Imo24CallFail, type Imo24Deps } from "./client";
import type { Imo24Anunt } from "./mapper";

export const IMO24_MAX_IMAGES = 30;
export const IMO24_IMAGE_RETRY_DELAY_MS = 10 * 60_000;
export const IMO24_IMAGE_RETRY_MAX = 3;
export const IMO24_AGENT_CACHE_MS = 60 * 60_000;

export type Imo24Warning = { code: string; message: string; camp: string };
export type Imo24WriteResult = "creat" | "actualizat" | "neschimbat" | "reactivat";
export type Imo24Written = {
  id?: number;
  cod?: string;
  external_id?: string | null;
  url?: string;
  stare?: string;
  rezultat?: Imo24WriteResult;
  avertismente?: Imo24Warning[];
};

// ------------------------------------------------------------------ imagini

export type Imo24ImageInput = {
  id: string;
  url?: string | null;
  storage_path?: string | null;
  is_primary?: boolean | null;
  position?: number | null;
  include_in_publish?: boolean | null;
  is_confidential?: boolean | null;
};

function extensionOf(img: Imo24ImageInput): string {
  const source = (img.storage_path || img.url || "").split("?")[0].toLowerCase();
  const m = /\.([a-z0-9]+)$/.exec(source);
  return m ? m[1] : "";
}

/**
 * URL-urile publice (proxy Habitoo) în ordinea din Habitoo, max. 30.
 * PNG: cu watermark activ se servește JPEG (convertit), altfel se omite cu avertisment.
 */
export function imo24ImageUrls(
  images: Imo24ImageInput[],
  opts: { baseUrl: string; watermark: boolean },
): { urls: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const eligible = images
    .filter((i) => i.include_in_publish === true && i.is_confidential !== true)
    .sort((a, b) =>
      !!a.is_primary === !!b.is_primary ? (a.position ?? 0) - (b.position ?? 0) : a.is_primary ? -1 : 1,
    );
  const base = opts.baseUrl.replace(/\/$/, "");
  const urls: string[] = [];
  let skippedPng = 0;
  let skippedOther = 0;
  for (const img of eligible) {
    const ext = extensionOf(img);
    let suffix = "";
    if (ext === "png") {
      if (!opts.watermark) { skippedPng += 1; continue; }
      suffix = ".jpg";
    } else if (ext === "jpg" || ext === "jpeg") suffix = ".jpg";
    else if (ext === "webp") suffix = ".webp";
    else if (["gif", "heic", "heif", "avif", "bmp", "tif", "tiff", "svg"].includes(ext)) { skippedOther += 1; continue; }
    urls.push(`${base}/api/public/sites/v1/media/${img.id}${suffix}`);
  }
  if (skippedPng > 0) warnings.push(`${skippedPng} poze PNG nu au fost trimise (imo24.ro acceptă doar JPEG sau WebP).`);
  if (skippedOther > 0) warnings.push(`${skippedOther} poze într-un format neacceptat de imo24.ro nu au fost trimise.`);
  if (urls.length > IMO24_MAX_IMAGES) {
    warnings.push(`Proprietatea are ${urls.length} poze publicabile; imo24.ro primește primele ${IMO24_MAX_IMAGES}.`);
    urls.length = IMO24_MAX_IMAGES;
  }
  return { urls, warnings };
}

// ------------------------------------------------------------------ agenți

type AgentEntry = { at: number; emails: Set<string> };
const agentCache = new Map<string, AgentEntry>();

export function resetImo24AgentCache() {
  agentCache.clear();
}

/** Emailul agentului dacă are cont activ în agenția imo24 (`GET /agenti`, cache 1 h); altfel null. */
export async function resolveImo24Agent(
  apiKey: string,
  email: string | null | undefined,
  deps: Imo24Deps = {},
): Promise<string | null> {
  const wanted = (email ?? "").trim().toLowerCase();
  if (!wanted) return null;
  const now = (deps.now ?? Date.now)();
  let entry = agentCache.get(apiKey);
  if (!entry || now - entry.at >= IMO24_AGENT_CACHE_MS) {
    const res = await imo24Request<{ agenti?: { email?: string; activ?: boolean }[] }>(apiKey, "GET", "/agenti", undefined, deps);
    if (!res.ok) return null;
    const emails = new Set<string>();
    for (const a of res.data?.agenti ?? []) {
      if (a?.activ !== false && typeof a?.email === "string") emails.add(a.email.trim().toLowerCase());
    }
    entry = { at: now, emails };
    agentCache.set(apiKey, entry);
  }
  return entry.emails.has(wanted) ? wanted : null;
}

// ------------------------------------------------------------------ avertismente

const WARNING_TEXT: Record<string, string> = {
  strada_negasita: "imo24.ro nu a găsit strada; anunțul folosește poziția de pe hartă.",
  coordonate_departe: "imo24.ro semnalează că poziția de pe hartă este departe de localitatea aleasă.",
  camp_ignorat: "imo24.ro a ignorat un câmp",
  imagine_url_interzis: "imo24.ro a refuzat adresa unei poze",
  imagine_format: "imo24.ro a ignorat o poză cu format neacceptat",
  imagine_descarcare: "imo24.ro nu a putut descărca o poză",
};

export function imo24WarningText(w: Imo24Warning): string {
  const base = WARNING_TEXT[w.code];
  if (!base) return w.message || w.code;
  if (w.code === "strada_negasita" || w.code === "coordonate_departe") return base;
  return `${base}${w.camp ? ` (${w.camp})` : ""}.`;
}

// ------------------------------------------------------------------ publicare

export type Imo24BodyOutcome = {
  body: Imo24Anunt;
  written: Imo24Written;
  status: number;
  /** Câmp imutabil schimbat: codul vechi a fost dezactivat și anunțul retrimis. */
  recreated: boolean;
};

export type Imo24UpsertResult =
  | {
      ok: true;
      results: Imo24BodyOutcome[];
      staleWithdrawn: string[];
      imagesDeferred: boolean;
      warnings: string[];
    }
  | { ok: false; fail: Imo24CallFail; done: Imo24BodyOutcome[]; recreatedFailed: boolean };

const byExternal = (id: string) => `/anunturi/by-external/${encodeURIComponent(id)}`;

export async function upsertImo24Bodies(
  apiKey: string,
  bodies: Imo24Anunt[],
  previousExternalIds: string[],
  deps: Imo24Deps = {},
): Promise<Imo24UpsertResult> {
  const results: Imo24BodyOutcome[] = [];
  const warnings: string[] = [];
  let imagesDeferred = false;

  for (const body of bodies) {
    let res = await imo24Request<Imo24Written>(apiKey, "PUT", byExternal(body.external_id), body, deps);
    let recreated = false;
    if (!res.ok && res.kind === "immutable_field") {
      const del = await imo24Request(apiKey, "DELETE", byExternal(body.external_id), undefined, deps);
      if (!del.ok && del.kind !== "not_found") return { ok: false, fail: del, done: results, recreatedFailed: true };
      recreated = true;
      res = await imo24Request<Imo24Written>(apiKey, "PUT", byExternal(body.external_id), body, deps);
    }
    if (!res.ok) return { ok: false, fail: res, done: results, recreatedFailed: recreated };
    const written = res.data ?? {};
    for (const w of written.avertismente ?? []) {
      if (w.code === "imagini_amanate") imagesDeferred = true;
      else warnings.push(imo24WarningText(w));
    }
    results.push({ body, written, status: res.status, recreated });
  }

  // Coduri vechi care nu mai corespund (ex. tranzacția s-a schimbat): se dezactivează.
  const current = new Set(bodies.map((b) => b.external_id));
  const staleWithdrawn: string[] = [];
  for (const id of previousExternalIds) {
    if (current.has(id)) continue;
    const del = await imo24Request(apiKey, "DELETE", byExternal(id), undefined, deps);
    if (del.ok) staleWithdrawn.push(id);
    else if (del.kind !== "not_found") warnings.push(`Anunțul vechi ${id} nu a putut fi dezactivat pe imo24.ro: ${del.message}`);
  }

  return { ok: true, results, staleWithdrawn, imagesDeferred, warnings: [...new Set(warnings)] };
}

export type Imo24WithdrawResult =
  | { ok: true; withdrawn: string[]; missing: string[] }
  | { ok: false; fail: Imo24CallFail; withdrawn: string[] };

export async function withdrawImo24(
  apiKey: string,
  externalIds: string[],
  deps: Imo24Deps = {},
): Promise<Imo24WithdrawResult> {
  const withdrawn: string[] = [];
  const missing: string[] = [];
  for (const id of [...new Set(externalIds)]) {
    const res = await imo24Request(apiKey, "DELETE", byExternal(id), undefined, deps);
    if (res.ok) withdrawn.push(id);
    else if (res.kind === "not_found") missing.push(id);
    else return { ok: false, fail: res, withdrawn };
  }
  return { ok: true, withdrawn, missing };
}

export const IMO24_RESULT_LABEL: Record<Imo24WriteResult, string> = {
  creat: "publicat",
  actualizat: "actualizat",
  neschimbat: "neschimbat (nimic nou de trimis)",
  reactivat: "reactivat",
};

export function splitExternalIds(value: string | null | undefined): string[] {
  return (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
