/**
 * Inspecția feedului Habitoo exact așa cum îl vede un portal.
 *
 * Nu duplică logica feedului: reutilizează handlerele publice
 * (`handlePropertiesList`, `handlePropertyDetail`, `handleAgentsList`) cu un
 * context de autentificare intern. Astfel „ce vede portalul" și „ce raportăm
 * în interfață" nu pot să diverge niciodată.
 *
 * Server-only: importă clientul admin și handlerele feedului.
 */
import { CRM_URL } from "@/lib/host";
import type { FeedAuthOk } from "@/lib/site-feed/auth.server";
import {
  handleAgentsList,
  handlePropertiesList,
  handlePropertyDetail,
} from "@/lib/site-feed/handlers.server";
import { FEED_BASE_PATH } from "@/lib/site-feed/auth.server";
import type { FeedProperty } from "@/lib/site-feed/mapper";

const SIGNED_URL_TTL = 60 * 60; // verificare, nu livrare

/** Context intern: aceleași drepturi ca o cheie de portal cu citire completă. */
function internalAuth(organizationId: string, portal?: string | null): FeedAuthOk {
  return {
    ok: true,
    organizationId,
    tokenId: "internal-diagnostics",
    tokenPrefix: "internal",
    source: "portal_key",
    // Cu portal precizat, diagnoza vede EXACT ce vede portalul (doar ofertele
    // bifate pentru el), deci „vizibil în feed" nu mai e o aproximare.
    portal: portal ?? null,
    scopes: ["feed:read", "agents:read"],
  };
}

function internalRequest(path: string): Request {
  return new Request(`${CRM_URL}${FEED_BASE_PATH}${path}`, { method: "GET" });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const body = (await response.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export type FeedSnapshot = {
  status: number;
  apiVersion: string | null;
  total: number | null;
  items: number;
};

/** Prima pagină a feedului de proprietăți, ca test real de disponibilitate. */
export async function inspectFeedProperties(
  organizationId: string,
  perPage = 1,
  portal?: string | null,
): Promise<FeedSnapshot> {
  const result = await handlePropertiesList(
    internalRequest(`/properties?page=1&per_page=${perPage}`),
    internalAuth(organizationId, portal),
  );
  const body = await readJson(result.response);
  return {
    status: result.response.status,
    apiVersion: typeof body["api_version"] === "string" ? body["api_version"] : null,
    total: typeof body["total"] === "number" ? body["total"] : null,
    items: result.items ?? 0,
  };
}

/** Agenții expuși portalului (feedul `/agents`). */
export async function inspectFeedAgents(organizationId: string): Promise<FeedSnapshot> {
  const result = await handleAgentsList(
    internalRequest("/agents?page=1&per_page=1"),
    internalAuth(organizationId),
  );
  const body = await readJson(result.response);
  return {
    status: result.response.status,
    apiVersion: typeof body["api_version"] === "string" ? body["api_version"] : null,
    total: typeof body["total"] === "number" ? body["total"] : null,
    items: result.items ?? 0,
  };
}

export type FeedPropertySnapshot = {
  status: number;
  /** Oferta este vizibilă în feed pentru portal. */
  visible: boolean;
  /** Identificatorul pe care îl folosește portalul (referință sau UUID). */
  externalId: string | null;
  offerUrl: string | null;
  agentId: string | null;
  agentName: string | null;
  imageCount: number;
  hasPrimaryImage: boolean;
  updatedAt: string | null;
};

/** Detaliul unei oferte, exact cum îl primește portalul. */
export async function inspectFeedProperty(
  organizationId: string,
  propertyId: string,
  portal?: string | null,
): Promise<FeedPropertySnapshot> {
  const result = await handlePropertyDetail(
    internalRequest(`/properties/${propertyId}`),
    internalAuth(organizationId, portal),
    propertyId,
  );
  const body = await readJson(result.response);
  const data = (body["data"] ?? null) as FeedProperty | null;
  const images = Array.isArray(data?.images) ? data.images : [];
  return {
    status: result.response.status,
    visible: result.response.status === 200 && Boolean(data),
    externalId: data?.idstr ?? null,
    offerUrl: data?.url ?? null,
    agentId: data?.agent_id ?? null,
    agentName: data?.agent ?? null,
    imageCount: images.length,
    hasPrimaryImage: images.some((img) => img.tip === "principala"),
    updatedAt: data?.datamodificare ?? null,
  };
}

export type MediaSnapshot = {
  total: number;
  resolvable: number;
  broken: number;
  primary: boolean;
};

/**
 * Verifică dacă imaginile publicabile pot fi servite portalului: fiecare
 * imagine trebuie să aibă fie un URL public, fie un obiect de storage pentru
 * care se poate genera un URL semnat.
 */
export async function inspectFeedMedia(
  organizationId: string,
  propertyId: string,
): Promise<MediaSnapshot> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("property_images")
    .select("id, url, storage_path, is_primary")
    .eq("organization_id", organizationId)
    .eq("property_id", propertyId)
    .eq("include_in_publish", true)
    .eq("is_confidential", false);

  const rows = data ?? [];
  let resolvable = 0;
  for (const row of rows) {
    if (row.storage_path) {
      const { data: signed } = await supabaseAdmin.storage
        .from("property-media")
        .createSignedUrl(row.storage_path, SIGNED_URL_TTL);
      if (signed?.signedUrl) {
        resolvable += 1;
        continue;
      }
    }
    if (row.url) resolvable += 1;
  }

  return {
    total: rows.length,
    resolvable,
    broken: rows.length - resolvable,
    primary: rows.some((r) => r.is_primary === true),
  };
}
