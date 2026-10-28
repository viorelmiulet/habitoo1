/**
 * HomeDirect.ro, etapa 3: publicare (POST /properties), actualizare (PUT /properties/{id}),
 * status (PATCH /properties/{id}/status) și ștergere (DELETE /properties/{id}).
 * Logică fără bază de date; apelurile trec prin clientul HomeDirect (limitator, 429, cheie ascunsă).
 */
import { homedirectRequest, type HomedirectCallFail, type HomedirectDeps } from "./client.server";
import type { HomedirectBody, HomedirectRequest, HomedirectTransaction } from "./mapper";

export const HOMEDIRECT_PUBLIC_BASE = "https://www.homedirect.ro";
export const HOMEDIRECT_AGENT_POSITION = "Agent imobiliar";
export const HOMEDIRECT_AGENCY_LINK_HINT =
  "Agenția are deja cont HomeDirect pe acest email. Contactați HomeDirect pentru legarea contului la Habitoo.";

export type HomedirectStatus = "active" | "inactive" | "sold" | "rented" | "deleted";
export type HomedirectStored = {
  external_id: string;
  transaction: "sale" | "rent";
  homedirect_id: string | null;
  short_id: string | null;
  slug: string | null;
  url: string | null;
  status: HomedirectStatus;
};

export type HomedirectAgency = { name: string; email: string; phone?: string; logo?: string };
export type HomedirectAgent = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  position: string;
  avatar?: string;
};
export type HomedirectFullRequest = HomedirectRequest & {
  agency: HomedirectAgency;
  agent: HomedirectAgent;
  externalIds: { agency: string; agent: string; post: string };
};
export type HomedirectFullBody = Omit<HomedirectBody, "request"> & { request: HomedirectFullRequest };

const rec = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const clean = (v: string | null | undefined) => (v ?? "").trim();

export const txOf = (t: HomedirectTransaction): "sale" | "rent" => (t === "buy" ? "sale" : "rent");

// ------------------------------------------------------------------ agenție / agent

export type AgencySource = { name?: string | null; email?: string | null; phone?: string | null; material_phone?: string | null };
export type AgentSource = { full_name?: string | null; email?: string | null; phone?: string | null };

export function homedirectAgencyPayload(org: AgencySource, logoUrl: string | null): HomedirectAgency | null {
  const email = clean(org.email);
  if (!email) return null;
  const phone = clean(org.phone) || clean(org.material_phone);
  return {
    name: clean(org.name) || email,
    email,
    ...(phone ? { phone } : {}),
    ...(logoUrl ? { logo: logoUrl } : {}),
  };
}

export function homedirectAgentPayload(profile: AgentSource | null, avatarUrl: string | null): HomedirectAgent | null {
  const email = clean(profile?.email);
  if (!profile || !email) return null;
  const parts = clean(profile.full_name).split(/\s+/).filter(Boolean);
  const phone = clean(profile.phone);
  return {
    first_name: parts[0] ?? email.split("@")[0]!,
    last_name: parts.slice(1).join(" "),
    email,
    ...(phone ? { phone } : {}),
    position: HOMEDIRECT_AGENT_POSITION,
    ...(avatarUrl ? { avatar: avatarUrl } : {}),
  };
}

/** Amprentă stabilă (djb2) a datelor trimise, pentru „doar la modificare”. */
export function homedirectFingerprint(value: unknown): string {
  const text = JSON.stringify(value, Object.keys(rec(value) ?? {}).sort());
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

export function homedirectEmailReasons(agency: HomedirectAgency | null, agent: HomedirectAgent | null, hasAgent: boolean): string[] {
  const out: string[] = [];
  if (!agency) out.push("Completează emailul agenției în Setări: HomeDirect îl folosește ca identificator și pentru emailul de activare.");
  if (!hasAgent) out.push("Alege agentul responsabil al proprietății.");
  else if (!agent) out.push("Agentul responsabil nu are email: HomeDirect îl folosește ca identificator și pentru emailul de activare.");
  return out;
}

export function withAccounts(
  body: HomedirectBody,
  accounts: { agency: HomedirectAgency; agent: HomedirectAgent; organizationId: string; userId: string },
): HomedirectFullBody {
  return {
    ...body,
    request: {
      ...body.request,
      agency: accounts.agency,
      agent: accounts.agent,
      externalIds: { agency: accounts.organizationId, agent: accounts.userId, post: body.externalPostId },
    },
  };
}

// ------------------------------------------------------------------ răspunsuri

export type HomedirectWrittenProperty = { id: string | null; shortId: string | null; slug: string | null };

export function readHomedirectProperty(body: unknown): HomedirectWrittenProperty {
  const root = rec(body) ?? {};
  const p = rec(root["property"]) ?? rec(rec(root["data"])?.["property"]) ?? rec(root["data"]) ?? root;
  return { id: str(p["id"]) ?? str(p["_id"]), shortId: str(p["shortId"]), slug: str(p["slug"]) };
}

/** Link public doar din `slug`-ul real; fără slug → fără link. */
export function homedirectPublicUrl(slug: string | null): string | null {
  if (!slug || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(slug)) return null;
  return `${HOMEDIRECT_PUBLIC_BASE}/${slug}`;
}

/** Eroare la legarea agenției (email cu cont HomeDirect creat direct pe site). */
export function isAgencyLinkError(f: HomedirectCallFail): boolean {
  if (f.kind === "duplicate" && !(f.existing?.id || f.existing?.shortId)) return true;
  const b = rec(f.body) ?? {};
  const text = [b["error"], b["code"], b["message"], JSON.stringify(b["details"] ?? "")].map((x) => String(x ?? "")).join(" ");
  return /email/i.test(text) && /(agen|account|cont|link|exist)/i.test(text) && f.kind !== "duplicate";
}

export type HomedirectWritten = {
  body: HomedirectFullBody;
  state: HomedirectStored;
  httpStatus: number;
  action: "created" | "updated" | "existing" | "reactivated" | "recreated";
};

type Fail = { ok: false; fail: HomedirectCallFail; done: HomedirectWritten[]; agencyLink: boolean };

function stateFrom(body: HomedirectFullBody, prev: HomedirectStored | undefined, p: HomedirectWrittenProperty): HomedirectStored {
  const slug = p.slug ?? prev?.slug ?? null;
  return {
    external_id: body.externalPostId,
    transaction: txOf(body.transaction),
    homedirect_id: p.id ?? prev?.homedirect_id ?? null,
    short_id: p.shortId ?? prev?.short_id ?? null,
    slug,
    url: homedirectPublicUrl(slug),
    status: "active",
  };
}

const enc = encodeURIComponent;

/** Creare/actualizare per tranzacție; idempotent pe `externalIds.post`. */
export async function upsertHomedirectBodies(
  bodies: HomedirectFullBody[],
  stored: HomedirectStored[],
  deps: HomedirectDeps = {},
): Promise<{ ok: true; results: HomedirectWritten[] } | Fail> {
  const byExt = new Map(stored.map((s) => [s.external_id, s]));
  const done: HomedirectWritten[] = [];

  for (const body of bodies) {
    const prev = byExt.get(body.externalPostId);
    let reactivated = false;

    const put = async (id: string, prevState: HomedirectStored | undefined) => {
      const r = await homedirectRequest<unknown>("PUT", `/properties/${enc(id)}`, body.request, deps);
      if (!r.ok) return r;
      const p = readHomedirectProperty(r.data);
      return { ok: true as const, status: r.status, state: stateFrom(body, prevState, { ...p, id: p.id ?? id }) };
    };

    if (prev?.homedirect_id && prev.status !== "deleted") {
      let gone = false;
      if (prev.status !== "active") {
        const a = await homedirectRequest<unknown>("PATCH", `/properties/${enc(prev.homedirect_id)}/status`, { status: "active" }, deps);
        if (!a.ok && a.kind !== "not_found") return { ok: false, fail: a, done, agencyLink: false };
        gone = !a.ok;
        reactivated = a.ok;
      }
      if (!gone) {
        const u = await put(prev.homedirect_id, prev);
        if (u.ok) {
          done.push({ body, state: u.state, httpStatus: u.status, action: reactivated ? "reactivated" : "updated" });
          continue;
        }
        if (u.kind !== "not_found") return { ok: false, fail: u, done, agencyLink: false };
      }
      // 404: anunțul a fost șters la HomeDirect → recreare cu POST.
    }

    const c = await homedirectRequest<unknown>("POST", "/properties", body.request, deps);
    if (c.ok) {
      const p = readHomedirectProperty(c.data);
      const already = rec(c.data)?.["alreadyExisted"] === true;
      if (already && p.id) {
        const u = await put(p.id, { ...(prev as HomedirectStored), ...stateFrom(body, prev, p) });
        if (!u.ok) return { ok: false, fail: u, done, agencyLink: false };
        done.push({ body, state: u.state, httpStatus: u.status, action: "existing" });
        continue;
      }
      done.push({ body, state: stateFrom(body, undefined, p), httpStatus: c.status, action: prev?.homedirect_id ? "recreated" : "created" });
      continue;
    }
    if (c.kind === "duplicate" && (c.existing?.id || c.existing?.shortId)) {
      const id = (c.existing.id ?? c.existing.shortId)!;
      const u = await put(id, { ...(prev as HomedirectStored), homedirect_id: id, short_id: c.existing.shortId ?? null } as HomedirectStored);
      if (!u.ok) return { ok: false, fail: u, done, agencyLink: false };
      done.push({ body, state: u.state, httpStatus: u.status, action: "existing" });
      continue;
    }
    return { ok: false, fail: c, done, agencyLink: isAgencyLinkError(c) };
  }
  return { ok: true, results: done };
}

/** PATCH status pe anunțurile date; 404 = anunțul nu mai există. */
export async function setHomedirectStatus(
  targets: { state: HomedirectStored; status: Exclude<HomedirectStatus, "deleted"> }[],
  deps: HomedirectDeps = {},
): Promise<{ ok: true; changed: HomedirectStored[]; missing: string[] } | { ok: false; fail: HomedirectCallFail }> {
  const changed: HomedirectStored[] = [];
  const missing: string[] = [];
  for (const t of targets) {
    if (!t.state.homedirect_id) { missing.push(t.state.external_id); continue; }
    const r = await homedirectRequest<unknown>("PATCH", `/properties/${enc(t.state.homedirect_id)}/status`, { status: t.status }, deps);
    if (r.ok) changed.push({ ...t.state, status: t.status });
    else if (r.kind === "not_found") { missing.push(t.state.external_id); changed.push({ ...t.state, status: "deleted" }); }
    else return { ok: false, fail: r };
  }
  return { ok: true, changed, missing };
}

/** DELETE definitiv (doar la ștergerea proprietății). 404 = succes. */
export async function deleteHomedirect(
  states: HomedirectStored[],
  deps: HomedirectDeps = {},
): Promise<{ ok: true; deleted: HomedirectStored[] } | { ok: false; fail: HomedirectCallFail }> {
  const deleted: HomedirectStored[] = [];
  for (const s of states) {
    if (!s.homedirect_id) continue;
    const r = await homedirectRequest<unknown>("DELETE", `/properties/${enc(s.homedirect_id)}`, undefined, deps);
    if (!r.ok && r.kind !== "not_found") return { ok: false, fail: r };
    deleted.push({ ...s, status: "deleted" });
  }
  return { ok: true, deleted };
}

/** Ținta retragerii după starea proprietății. */
export function homedirectWithdrawPlan(
  property: { status?: string | null; deleted_at?: string | null } | null,
  stored: HomedirectStored[],
): { mode: "delete"; states: HomedirectStored[] } | { mode: "status"; targets: { state: HomedirectStored; status: "inactive" | "sold" | "rented" }[] } {
  const live = stored.filter((s) => s.homedirect_id && s.status !== "deleted");
  if (!property || property.deleted_at) return { mode: "delete", states: live };
  const st = property.status ?? "";
  return {
    mode: "status",
    targets: live
      .map((s) => ({
        state: s,
        status: (st === "sold" && s.transaction === "sale" ? "sold" : st === "rented" && s.transaction === "rent" ? "rented" : "inactive") as
          "inactive" | "sold" | "rented",
      }))
      .filter((t) => t.state.status !== t.status),
  };
}

/** PUT /agencies/{externalId} sau /agents/{externalId}, doar la modificare. 404 = încă neprovizionat. */
export async function refreshHomedirectAccounts(
  input: {
    organizationId: string;
    agency: { payload: HomedirectAgency; fingerprint: string; previous: string | null };
    agent: { userId: string; payload: HomedirectAgent; fingerprint: string; previous: string | null };
  },
  deps: HomedirectDeps = {},
): Promise<{ agencyCalled: boolean; agentCalled: boolean }> {
  let agencyCalled = false;
  let agentCalled = false;
  if (input.agency.previous && input.agency.previous !== input.agency.fingerprint) {
    agencyCalled = true;
    await homedirectRequest("PUT", `/agencies/${enc(input.organizationId)}`, { agency: input.agency.payload }, deps);
  }
  if (input.agent.previous && input.agent.previous !== input.agent.fingerprint) {
    agentCalled = true;
    await homedirectRequest("PUT", `/agents/${enc(input.agent.userId)}`, { agencyExternalId: input.organizationId, agent: input.agent.payload }, deps);
  }
  return { agencyCalled, agentCalled };
}

/** DELETE /agents/{externalId}?agencyExternalId= (idempotent: 404 = succes). */
export async function deleteHomedirectAgent(organizationId: string, userId: string, deps: HomedirectDeps = {}) {
  const r = await homedirectRequest("DELETE", `/agents/${enc(userId)}?agencyExternalId=${enc(organizationId)}`, undefined, deps);
  return r.ok || r.kind === "not_found" ? { ok: true as const } : { ok: false as const, fail: r };
}

export const HOMEDIRECT_STATUS_LABEL: Record<HomedirectStatus, string> = {
  active: "publicat",
  inactive: "inactiv",
  sold: "vândut",
  rented: "închiriat",
  deleted: "șters",
};
