/**
 * Tokenul semnat din indexul ClickImob (`hbci_<id>.<semnătură>`) în feedul
 * `/api/public/sites/v1`. Se comportă ca o cheie de portal ClickImob a agenției.
 * Agenția se găsește EXCLUSIV prin OfficeId-ul exact (`properstarEntityId("hb", org.id)`)
 * și trebuie să fie acum în indexul ClickImob (`active` sau `grace`).
 */
import { CLICKIMOB_TOKEN_PREFIX, type IndexPortal } from "@/lib/portals/clickimob/index-feed";
import { verifyManagedAgencyToken } from "./index-keys.server";
import { properstarEntityId } from "@/lib/portals/properstar/mapper";
import { readCompleteRows } from "./complete-read.server";

export type ClickimobTokenMatch = {
  organizationId: string;
  officeId: string;
  status: "active" | "grace";
};

export function isClickimobFeedToken(token: string | null | undefined): boolean {
  return Boolean(token?.startsWith(CLICKIMOB_TOKEN_PREFIX));
}

/** Prefixul sigur pentru jurnal: `hbci_<id>`, niciodată semnătura. */
export function clickimobTokenLogPrefix(token: string): string | null {
  const head = token.split(".")[0] ?? "";
  return /^hbci_[A-Za-z0-9]{1,40}$/.test(head) ? head : null;
}

export async function resolveClickimobFeedToken(
  token: string,
  now: Date = new Date(),
): Promise<ClickimobTokenMatch | null> {
  return resolvePortalIndexToken(token, "clickimob", now);
}

export async function resolvePortalIndexToken(
  token: string,
  portal: IndexPortal,
  now: Date = new Date(),
): Promise<ClickimobTokenMatch | null> {
  const officeId = await verifyManagedAgencyToken(token, portal);
  if (!officeId) return null;

  const { listClickimobIndexedAgencies, listPortalIndexedAgencies } = await import(
    "@/lib/portals/clickimob/index-feed.server"
  );
  const agencies = portal === "clickimob"
    ? await listClickimobIndexedAgencies(now)
    : await listPortalIndexedAgencies(now, portal);
  const agency = agencies.find((a) => a.id === officeId);
  if (!agency || (agency.status !== "active" && agency.status !== "grace")) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const data = await readCompleteRows((from, to) => supabaseAdmin.from("organizations").select("id").order("id").range(from, to));
  const matches = data.filter(o => properstarEntityId("hb", o.id) === officeId);
  if (matches.length !== 1) return null;
  const match = matches[0];
  if (!match) return null;
  return { organizationId: match.id, officeId, status: agency.status };
}
