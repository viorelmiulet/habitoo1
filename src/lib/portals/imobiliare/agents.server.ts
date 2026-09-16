/**
 * Sincronizarea agenților cu Imobiliare.ro.
 *
 * Anunțul se leagă de `agents: [id]`, un ID din sistemul LOR. La prima
 * publicare a unui agent Habitoo căutăm agentul după email în `/agents` și,
 * dacă nu există, îl creăm. Corespondența se salvează în `imobiliare_agents`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { IMOBILIARE_PATHS } from "./config";
import { imobiliareAuthedRequest, type ImobiliareSession } from "./auth.server";

type Admin = SupabaseClient<Database>;

export type ImobiliareAgent = { id: number; email: string | null; name: string | null };

export type AgentSyncResult =
  | { ok: true; agentId: number; created: boolean }
  | { ok: false; message: string; httpStatus?: number; portalResponse?: unknown };

/** Normalizează lista de agenți, indiferent de forma răspunsului. */
export function parseAgents(body: unknown): ImobiliareAgent[] {
  const source = Array.isArray(body)
    ? body
    : body && typeof body === "object"
      ? ((body as Record<string, unknown>)["data"] ??
        (body as Record<string, unknown>)["agents"] ??
        (body as Record<string, unknown>)["items"])
      : null;
  if (!Array.isArray(source)) return [];
  const out: ImobiliareAgent[] = [];
  for (const entry of source) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const rawId = row["id"] ?? row["agent_id"];
    const id = typeof rawId === "number" ? rawId : Number.parseInt(String(rawId ?? ""), 10);
    if (!Number.isFinite(id) || id <= 0) continue;
    out.push({
      id,
      email: typeof row["email"] === "string" ? row["email"].toLowerCase() : null,
      name:
        typeof row["name"] === "string"
          ? row["name"]
          : typeof row["full_name"] === "string"
            ? (row["full_name"] as string)
            : null,
    });
  }
  return out;
}

export function agentIdFromCreate(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const nested = (root["data"] ?? root["agent"] ?? root) as Record<string, unknown>;
  const rawId = nested["id"] ?? nested["agent_id"] ?? root["id"];
  const id = typeof rawId === "number" ? rawId : Number.parseInt(String(rawId ?? ""), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function ensureImobiliareAgent(input: {
  admin: Admin;
  session: ImobiliareSession;
  organizationId: string;
  profile: { id: string; full_name: string | null; email: string | null; phone: string | null };
}): Promise<AgentSyncResult> {
  const { admin, session, organizationId, profile } = input;
  const email = profile.email?.trim().toLowerCase() ?? "";

  const { data: existing } = await admin
    .from("imobiliare_agents")
    .select("external_agent_id")
    .eq("organization_id", organizationId)
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (existing?.external_agent_id) {
    return { ok: true, agentId: Number(existing.external_agent_id), created: false };
  }

  if (!email) {
    return {
      ok: false,
      message: "Agentul ofertei nu are email; Imobiliare.ro cere un email valid pentru agent.",
    };
  }

  const list = await imobiliareAuthedRequest(session, {
    method: "GET",
    path: IMOBILIARE_PATHS.agents,
    connectionKey: organizationId,
  });
  if (!list.ok) {
    return {
      ok: false,
      message:
        list.classification?.message ??
        `Imobiliare.ro a răspuns HTTP ${list.status} la citirea agenților.`,
      httpStatus: list.status,
      portalResponse: list.body,
    };
  }

  const match = parseAgents(list.body).find((agent) => agent.email === email);
  if (match) {
    await saveMapping(admin, organizationId, profile.id, match.id, email);
    return { ok: true, agentId: match.id, created: false };
  }

  const created = await imobiliareAuthedRequest(session, {
    method: "POST",
    path: IMOBILIARE_PATHS.agents,
    connectionKey: organizationId,
    body: {
      name: profile.full_name?.trim() || email,
      email,
      ...(profile.phone?.trim() ? { phone: profile.phone.trim() } : {}),
    },
  });
  if (!created.ok) {
    return {
      ok: false,
      message:
        created.classification?.message ??
        `Imobiliare.ro a răspuns HTTP ${created.status} la crearea agentului.`,
      httpStatus: created.status,
      portalResponse: created.body,
    };
  }
  const agentId = agentIdFromCreate(created.body);
  if (!agentId) {
    return {
      ok: false,
      message: "Imobiliare.ro nu a returnat identificatorul agentului creat.",
      httpStatus: created.status,
      portalResponse: created.body,
    };
  }
  await saveMapping(admin, organizationId, profile.id, agentId, email);
  return { ok: true, agentId, created: true };
}

async function saveMapping(
  admin: Admin,
  organizationId: string,
  profileId: string,
  agentId: number,
  email: string,
): Promise<void> {
  await admin.from("imobiliare_agents").upsert(
    {
      organization_id: organizationId,
      profile_id: profileId,
      external_agent_id: agentId,
      email,
    } as never,
    { onConflict: "organization_id,profile_id" },
  );
}
