/**
 * Agenți HomeZZ: listare, activare explicită (cu confirmare în UI) și token
 * temporar per agent. Parola generată și token-ul nu se salvează, nu se
 * loghează și nu se întorc niciodată.
 */
import { homezzPost, type HomezzParams, type HomezzResult } from "./client";
import { completeHomezzAgentPromotions, parseHomezzContractPromotions, type HomezzContractPromotion } from "./promotions";

export type HomezzAgent = { email: string; name: string | null; phone: string | null; assignedSlots: number | null; remainingSlots: number | null; promotions: unknown };
export type HomezzAgentDeps = {
  post: (action: string, params: HomezzParams) => Promise<HomezzResult>;
  agencyKey: (organizationId: string) => Promise<string>;
  member: (organizationId: string, userId: string) => Promise<{ email: string | null; name: string | null; phone: string | null } | null>;
  allocation: (organizationId: string, userId: string) => Promise<number | null>;
  link: (organizationId: string, userId: string, email: string) => Promise<void>;
  audit: (entry: { organizationId: string; actorId: string; userId: string; action: "add-agent" | "edit-agent" | "unchanged"; ads: number }) => Promise<void>;
  /** Emailul HomeZZ al agentului activat (`portal_agent_links.external_key`); `null` = neactivat. */
  linkedEmail?: (organizationId: string, userId: string) => Promise<string | null>;
  /** Audit pentru modificarea promovărilor alocate. */
  auditPromotions?: (entry: { organizationId: string; actorId: string; userId: string; promotions: Record<string, number> }) => Promise<void>;
};

export const HOMEZZ_NO_ALLOCATION = "Setează numărul de anunțuri HomeZZ pentru acest agent.";
export const HOMEZZ_TOKEN_TTL_MS = 100 * 60 * 1000;

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export function parseHomezzAgents(data: unknown): HomezzAgent[] {
  const list = Array.isArray(data) ? data : Array.isArray((data as { agents?: unknown })?.agents) ? (data as { agents: unknown[] }).agents : [];
  return list.flatMap((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const email = str(r["email"]);
    if (!email) return [];
    return [{ email: email.toLowerCase(), name: str(r["name"]), phone: str(r["phone"]), assignedSlots: num(r["assigned_slots"]), remainingSlots: num(r["remaining_slots"]), promotions: r["promotions"] ?? null }];
  });
}

/** 24 de caractere, cu literă mare, literă mică, cifră și simbol (minimum HomeZZ: 11). */
export function generateHomezzPassword(): string {
  const U = "ABCDEFGHJKLMNPQRSTUVWXYZ", L = "abcdefghijkmnopqrstuvwxyz", D = "23456789", S = "!@#$%^&*()-_=+?";
  const all = U + L + D + S;
  const rnd = (n: number) => { const a = new Uint32Array(n); crypto.getRandomValues(a); return Array.from(a); };
  const r = rnd(48);
  const chars = [U, L, D, S].map((set, i) => set[r[i]! % set.length]!);
  for (let i = 4; i < 24; i++) chars.push(all[r[i]! % all.length]!);
  for (let i = chars.length - 1; i > 0; i--) { const j = r[24 + (i % 24)]! % (i + 1); [chars[i], chars[j]] = [chars[j]!, chars[i]!]; }
  return chars.join("");
}
export const isValidHomezzPassword = (p: string) => p.length >= 11 && /[A-Z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p);

function fail(r: Extract<HomezzResult, { ok: false }>): never {
  throw new Error(r.adError ? `${r.message} ${r.adError}` : r.message);
}

export async function listHomezzAgents(organizationId: string, deps: HomezzAgentDeps): Promise<HomezzAgent[]> {
  const key = await deps.agencyKey(organizationId);
  const r = await deps.post("agents", { key });
  if (!r.ok) fail(r);
  return parseHomezzAgents(r.data);
}

export async function activateHomezzAgent(
  organizationId: string, actorId: string, userId: string, input: { confirmed: boolean }, deps: HomezzAgentDeps,
): Promise<{ action: "add-agent" | "edit-agent" | "unchanged"; email: string }> {
  if (input.confirmed !== true) throw new Error("Confirmă activarea pe HomeZZ.");
  const ads = await deps.allocation(organizationId, userId);
  if (ads === null || ads < 1) throw new Error(HOMEZZ_NO_ALLOCATION);
  const member = await deps.member(organizationId, userId);
  const email = member?.email?.trim().toLowerCase();
  if (!member || !email) throw new Error("Agentul nu aparține agenției sau nu are email.");
  const name = member.name?.trim() || email;
  const phone = digits(member.phone);
  const key = await deps.agencyKey(organizationId);
  const existing = (await listHomezzAgents(organizationId, deps)).find((a) => a.email === email);
  let action: "add-agent" | "edit-agent" | "unchanged";
  if (existing) {
    const changes: HomezzParams = {};
    if (existing.assignedSlots !== ads) changes["ads"] = ads;
    if ((existing.name ?? "") !== name) changes["name"] = name;
    if (phone && digits(existing.phone) !== phone) changes["phone"] = phone;
    action = Object.keys(changes).length ? "edit-agent" : "unchanged";
    if (action === "edit-agent") {
      const r = await deps.post("edit-agent", { key, email, ...changes });
      if (!r.ok) fail(r);
    }
  } else {
    action = "add-agent";
    const r = await deps.post("add-agent", {
      key, email, password: generateHomezzPassword(), ads, name, phone: phone || null,
      hide_phone: 0, terms_and_conditions: 1, privacy_policy: 1,
    });
    if (!r.ok) fail(r);
  }
  await deps.link(organizationId, userId, email);
  await deps.audit({ organizationId, actorId, userId, action, ads });
  return { action, email };
}

// ---------------------------------------------------------------- promovări și sloturi per agent

/** Alocarea de promovări pe tip (`edit-agent` cu `promotions[tip]`); refuzul HomeZZ se aruncă cu textul exact. */
export async function setHomezzAgentPromotions(
  organizationId: string, actorId: string, userId: string, promotions: Record<number, number>, deps: HomezzAgentDeps,
): Promise<{ email: string }> {
  const { HOMEZZ_PROMOTION_IDS } = await import("./promotions");
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(promotions)) {
    const id = Number(k);
    if (!HOMEZZ_PROMOTION_IDS.includes(id)) throw new Error("Tip de promovare necunoscut.");
    if (!Number.isInteger(v) || v < 0) throw new Error("Numărul de promovări trebuie să fie un întreg ≥ 0.");
    clean[String(id)] = v;
  }
  if (!Object.keys(clean).length) throw new Error("Nicio modificare.");
  const email = await deps.linkedEmail?.(organizationId, userId);
  if (!email) throw new Error("Agentul nu este activat pe HomeZZ.");
  const r = await deps.post("edit-agent", { key: await deps.agencyKey(organizationId), email, promotions: clean });
  if (!r.ok) fail(r);
  await deps.auditPromotions?.({ organizationId, actorId, userId, promotions: clean });
  return { email };
}

/** După schimbarea alocării de sloturi: `edit-agent` cu noul `ads`, doar pentru agenții activați. Nu aruncă: întoarce avertismentul. */
export async function syncHomezzAgentSlots(
  organizationId: string, userId: string, ads: number, deps: HomezzAgentDeps,
): Promise<{ sent: boolean; warning: string | null }> {
  try {
    const email = await deps.linkedEmail?.(organizationId, userId);
    if (!email) return { sent: false, warning: null };
    const r = await deps.post("edit-agent", { key: await deps.agencyKey(organizationId), email, ads });
    if (!r.ok) return { sent: true, warning: `HomeZZ nu a acceptat noua alocare: ${r.adError ? `${r.message} ${r.adError}` : r.message}` };
    return { sent: true, warning: null };
  } catch (e) {
    return { sent: false, warning: `HomeZZ nu a putut fi actualizat: ${e instanceof Error ? e.message : "eroare"}` };
  }
}

// ---------------------------------------------------------------- token temporar

const tokenCache = new Map<string, { token: string; at: number }>();
export function clearHomezzTokenCache() { tokenCache.clear(); }

export async function getHomezzAgentToken(organizationId: string, userId: string, deps: HomezzAgentDeps, opts: { force?: boolean } = {}): Promise<string> {
  const member = await deps.member(organizationId, userId);
  const email = member?.email?.trim().toLowerCase();
  if (!email) throw new Error("Agentul nu aparține agenției sau nu are email.");
  return getHomezzEmailToken(organizationId, email, deps, opts);
}

/** Token pentru un email HomeZZ (de ex. agentul salvat pe ofertă), independent de agentul responsabil curent. */
export async function getHomezzEmailToken(organizationId: string, rawEmail: string, deps: HomezzAgentDeps, opts: { force?: boolean } = {}): Promise<string> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) throw new Error("Lipsește emailul agentului HomeZZ.");
  const cacheKey = `${organizationId}:${email}`;
  const hit = tokenCache.get(cacheKey);
  if (!opts.force && hit && Date.now() - hit.at < HOMEZZ_TOKEN_TTL_MS) return hit.token;
  const r = await deps.post("generate-token", { key: await deps.agencyKey(organizationId), email });
  if (!r.ok) fail(r);
  const token = str((r.data as { token?: unknown } | null)?.token);
  if (!token) throw new Error("HomeZZ nu a întors un token pentru agent.");
  tokenCache.set(cacheKey, { token, at: Date.now() });
  return token;
}

const isTokenError = (r: HomezzResult) => !r.ok && (r.kind === "forbidden" || /token/i.test(`${r.message} ${r.adError ?? ""}`));

/** Rulează o acțiune cu token-ul agentului; la eroare de token cere unul nou o singură dată. */
export async function withHomezzAgentToken(
  organizationId: string, userId: string, deps: HomezzAgentDeps, run: (token: string) => Promise<HomezzResult>,
): Promise<HomezzResult> {
  const first = await run(await getHomezzAgentToken(organizationId, userId, deps));
  if (!isTokenError(first)) return first;
  return run(await getHomezzAgentToken(organizationId, userId, deps, { force: true }));
}

/** Ca `withHomezzAgentToken`, dar după emailul HomeZZ salvat. */
export async function withHomezzEmailToken(
  organizationId: string, email: string, deps: HomezzAgentDeps, run: (token: string) => Promise<HomezzResult>,
): Promise<HomezzResult> {
  const first = await run(await getHomezzEmailToken(organizationId, email, deps));
  if (!isTokenError(first)) return first;
  return run(await getHomezzEmailToken(organizationId, email, deps, { force: true }));
}

// ---------------------------------------------------------------- dependențe reale

export async function homezzAgentDeps(): Promise<HomezzAgentDeps> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { homezzRelayTransport } = await import("../adapters/homezz.server");
  const { decryptPortalCredential } = await import("../crypto.server");
  return {
    post: (action, params) => homezzPost(action, params, homezzRelayTransport),
    async agencyKey(organizationId) {
      const { data, error } = await db.from("portal_connections").select("portal_credentials_encrypted").eq("organization_id", organizationId).eq("portal", "homezz").maybeSingle();
      if (error) throw new Error("Conexiunea HomeZZ nu a putut fi citită.");
      const key = decryptPortalCredential((data as { portal_credentials_encrypted: string | null } | null)?.portal_credentials_encrypted ?? null);
      if (!key) throw new Error("Lipsește cheia API HomeZZ.ro a agenției.");
      return key;
    },
    async member(organizationId, userId) {
      const { data } = await db.from("profiles").select("email, full_name, phone, organization_id").eq("id", userId).maybeSingle();
      const p = data as { email: string | null; full_name: string | null; phone: string | null; organization_id: string | null } | null;
      return p && p.organization_id === organizationId ? { email: p.email, name: p.full_name, phone: p.phone } : null;
    },
    async allocation(organizationId, userId) {
      const { data } = await db.from("portal_slot_allocations").select("slots").eq("organization_id", organizationId).eq("portal_key", "homezz").eq("user_id", userId).maybeSingle();
      return (data as { slots: number | null } | null)?.slots ?? null;
    },
    async link(organizationId, userId, email) {
      const { error } = await db.from("portal_agent_links").upsert(
        { organization_id: organizationId, portal: "homezz", user_id: userId, external_key: email, external_account_id: organizationId, synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() } as never,
        { onConflict: "organization_id,portal,user_id" });
      if (error) throw new Error("Legătura agentului HomeZZ nu a putut fi salvată.");
    },
    async linkedEmail(organizationId, userId) {
      const { data } = await db.from("portal_agent_links").select("external_key").eq("organization_id", organizationId).eq("portal", "homezz").eq("user_id", userId).maybeSingle();
      return ((data as { external_key?: string | null } | null)?.external_key ?? "").trim().toLowerCase() || null;
    },
    async auditPromotions(e) {
      const { error } = await db.from("audit_logs").insert({
        organization_id: e.organizationId, actor_id: e.actorId, created_by: e.actorId, action: "portal.homezz_agent_promotions",
        entity: "profiles", entity_id: e.userId, new_values: { portal: "homezz", agent_id: e.userId, promotions: e.promotions },
      } as never);
      if (error) throw new Error("Modificarea s-a făcut, dar înregistrarea în jurnal nu a reușit.");
    },
    async audit(e) {
      const { error } = await db.from("audit_logs").insert({
        organization_id: e.organizationId, actor_id: e.actorId, created_by: e.actorId, action: "portal.homezz_agent_activated",
        entity: "profiles", entity_id: e.userId, new_values: { portal: "homezz", agent_id: e.userId, homezz_action: e.action, ads: e.ads },
      } as never);
      if (error) throw new Error("Activarea s-a făcut, dar înregistrarea în jurnal nu a reușit.");
    },
  };
}

/** Rezumat contractual opțional: eșecul citirii nu împiedică administrarea agenților. */
export async function loadHomezzContractPromotions(organizationId: string, deps: HomezzAgentDeps): Promise<HomezzContractPromotion[] | null> {
  try {
    const r = await deps.post("details-agency", { key: await deps.agencyKey(organizationId) });
    return r.ok ? parseHomezzContractPromotions(r.data) : null;
  } catch {
    return null;
  }
}

type RosterMember = { id: string; full_name: string | null; email: string | null };
type RosterAllocation = { user_id: string; slots: number | null };
type RosterRemote = { agents: HomezzAgent[]; error: string | null };

/** Construcție pură a rosterului, separată de citirile DB/HomeZZ pentru reguli testabile. */
export function buildHomezzAgentRoster(
  members: RosterMember[], allocations: RosterAllocation[], remote: RosterRemote, contractPromotions: HomezzContractPromotion[] | null,
) {
  const byEmail = new Map(remote.agents.map((a) => [a.email, a]));
  const slots = new Map(allocations.map((a) => [a.user_id, a.slots]));
  return {
    error: remote.error,
    contractPromotions,
    members: members.map((m) => {
      const a = m.email ? byEmail.get(m.email.trim().toLowerCase()) : undefined;
      return { userId: m.id, name: m.full_name ?? m.email ?? "", email: m.email, allocation: slots.get(m.id) ?? null, active: Boolean(a), promotions: a ? completeHomezzAgentPromotions(a.promotions) : [], assignedSlots: a?.assignedSlots ?? null, remainingSlots: a?.remainingSlots ?? null };
    }),
  };
}

/** Membrii agenției cu starea lor HomeZZ (pentru card). */
export async function loadHomezzAgentRoster(organizationId: string) {
  const deps = await homezzAgentDeps();
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const [{ data: members }, { data: allocs }, remote, contractPromotions] = await Promise.all([
    db.from("profiles").select("id, full_name, email").eq("organization_id", organizationId).order("full_name"),
    db.from("portal_slot_allocations").select("user_id, slots").eq("organization_id", organizationId).eq("portal_key", "homezz"),
    listHomezzAgents(organizationId, deps).then((a) => ({ agents: a, error: null as string | null }), (e: Error) => ({ agents: [] as HomezzAgent[], error: e.message })),
    loadHomezzContractPromotions(organizationId, deps),
  ]);
  return buildHomezzAgentRoster(
    (members ?? []) as RosterMember[], (allocs ?? []) as RosterAllocation[], remote, contractPromotions,
  );
}
