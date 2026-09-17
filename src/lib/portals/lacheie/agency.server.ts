/**
 * Operațiile `/agencies/{external_id}` din API-ul La Cheie pentru furnizori CRM.
 * Server-only: folosesc cheia unică de furnizor, fără `X-Agency-External-ID`.
 *
 *  - PUT    → înregistrare (versiune 1) sau reactivare (versiune mai mare);
 *  - GET    → statusul real raportat de portal + versiunea acceptată;
 *  - DELETE → dezactivarea sincronizării și retragerea ofertelor conexiunii.
 */
import { laCheieAgenciesPath } from "./config";
import { laCheieRequest, type LaCheieRequestConfig, type LaCheieResponse } from "./client.server";
import {
  parseLaCheieAgencyBody,
  selectLaCheieAdminEmail,
  type LaCheieAdminEmailCandidate,
  type LaCheieAdminEmailSelection,
  type LaCheieAgencyProfile,
  type LaCheieAgencyResponse,
} from "./agency";

export type LaCheieAgencyCall = {
  response: LaCheieResponse;
  agency: LaCheieAgencyResponse;
};

function describe(response: LaCheieResponse): LaCheieAgencyCall {
  return { response, agency: parseLaCheieAgencyBody(response.body) };
}

/** Înregistrare sau reactivare: starea completă a agenției, cu versiune. */
export async function putLaCheieAgency(
  config: LaCheieRequestConfig,
  input: { externalId: string; payload: LaCheieAgencyProfile; version: string },
): Promise<LaCheieAgencyCall> {
  return describe(
    await laCheieRequest(config, {
      method: "PUT",
      path: laCheieAgenciesPath(input.externalId),
      scope: "agencies",
      body: input.payload,
      sourceVersion: input.version,
    }),
  );
}

export async function getLaCheieAgency(
  config: LaCheieRequestConfig,
  input: { externalId: string },
): Promise<LaCheieAgencyCall> {
  return describe(
    await laCheieRequest(config, {
      method: "GET",
      path: laCheieAgenciesPath(input.externalId),
      scope: "agencies",
    }),
  );
}

/** Dezactivare: retrage ofertele acestei conexiuni, fără să atingă alte agenții. */
export async function deleteLaCheieAgency(
  config: LaCheieRequestConfig,
  input: { externalId: string; version: string },
): Promise<LaCheieAgencyCall> {
  return describe(
    await laCheieRequest(config, {
      method: "DELETE",
      path: laCheieAgenciesPath(input.externalId),
      scope: "agencies",
      sourceVersion: input.version,
    }),
  );
}

/* ---------------- emailul verificat al administratorului agenției ---------- */

type AdminClient = {
  from: (table: string) => any;
  auth: {
    admin: {
      getUserById: (
        id: string,
      ) => PromiseLike<{ data: { user: Record<string, unknown> | null } | null; error: unknown }>;
    };
  };
};

/**
 * Emailul trimis la `PUT /agencies` este emailul REAL și VERIFICAT
 * (`auth.users.email_confirmed_at` != null) al unui `agency_admin` al agenției.
 * Nu se folosesc `organizations.email` / `material_email`, emailuri de agent sau
 * adrese tehnice. Fără niciun email verificat, activarea este blocată.
 */
export async function resolveLaCheieAdminEmail(
  admin: AdminClient,
  input: { organizationId: string; actorUserId: string | null },
): Promise<LaCheieAdminEmailSelection> {
  const [{ data: roles }, { data: org }] = await Promise.all([
    admin
      .from("user_roles")
      .select("user_id, created_at")
      .eq("organization_id", input.organizationId)
      .eq("role", "agency_admin")
      .order("created_at", { ascending: true }),
    admin.from("organizations").select("created_by").eq("id", input.organizationId).maybeSingle(),
  ]);

  const rows = (roles ?? []) as { user_id: string; created_at: string | null }[];
  if (!rows.length) return selectLaCheieAdminEmail([]);

  const ownerId = (org as { created_by?: string | null } | null)?.created_by ?? null;
  const candidates: LaCheieAdminEmailCandidate[] = [];
  for (const row of rows) {
    const { data } = await admin.auth.admin.getUserById(row.user_id);
    const user = data?.user ?? null;
    candidates.push({
      userId: row.user_id,
      email: typeof user?.["email"] === "string" ? (user["email"] as string) : null,
      emailConfirmedAt:
        typeof user?.["email_confirmed_at"] === "string"
          ? (user["email_confirmed_at"] as string)
          : null,
      isActor: Boolean(input.actorUserId) && row.user_id === input.actorUserId,
      isOwner: Boolean(ownerId) && row.user_id === ownerId,
      roleGrantedAt: row.created_at,
    });
  }
  return selectLaCheieAdminEmail(candidates);
}
