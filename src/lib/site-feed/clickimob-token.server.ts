/**
 * Tokenul semnat din indexul ClickImob (`hbci_<id>.<semnătură>`) în feedul
 * `/api/public/sites/v1`. Se comportă ca o cheie de portal ClickImob a agenției.
 * Agenția se găsește EXCLUSIV prin OfficeId-ul exact (`properstarEntityId("hb", org.id)`)
 * și trebuie să fie acum în indexul ClickImob (`active` sau `grace`).
 */
import { verifyClickimobFeedToken, CLICKIMOB_TOKEN_PREFIX } from "@/lib/portals/clickimob/index-feed";
import { properstarEntityId } from "@/lib/portals/properstar/mapper";

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
  const officeId = verifyClickimobFeedToken(token, process.env["CLICKIMOB_INDEX_KEY"]);
  if (!officeId) return null;

  const { listClickimobIndexedAgencies } = await import(
    "@/lib/portals/clickimob/index-feed.server"
  );
  const agency = (await listClickimobIndexedAgencies(now)).find((a) => a.id === officeId);
  if (!agency || (agency.status !== "active" && agency.status !== "grace")) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("organizations").select("id");
  if (error) throw new Error(error.message);
  const matches = (data ?? []).filter((o) => properstarEntityId("hb", o.id) === officeId);
  if (matches.length !== 1) return null;
  return { organizationId: matches[0]!.id, officeId, status: agency.status };
}
