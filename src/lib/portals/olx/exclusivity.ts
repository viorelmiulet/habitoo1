/** Storia include deja OLX: o agenție nu poate avea activ și `storia`, și `olx_direct`. */
export const STORIA_BLOCKS_OLX =
  "OLX este deja inclus prin Storia. Dezactivează Storia ca să folosești contul OLX direct.";
export const OLX_BLOCKS_STORIA =
  "Contul OLX direct este activ. Dezactivează OLX.ro (cont propriu) ca să folosești Storia.";

/** Mesajul de refuz dacă `portalId` nu poate fi activat lângă portalurile active, altfel null. */
export function portalExclusivityConflict(
  portalId: string,
  activePortals: readonly string[],
): string | null {
  if (portalId === "olx_direct" && activePortals.includes("storia")) return STORIA_BLOCKS_OLX;
  if (portalId === "storia" && activePortals.includes("olx_direct")) return OLX_BLOCKS_STORIA;
  return null;
}

/** Verificare server-side: citește conexiunile active ale agenției și aruncă la conflict. */
export async function assertPortalExclusivity(
  organizationId: string,
  portalId: string,
): Promise<void> {
  if (portalId !== "storia" && portalId !== "olx_direct") return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("portal_connections")
    .select("portal")
    .eq("organization_id", organizationId)
    .eq("activated", true)
    .in("portal", ["storia", "olx_direct"]);
  const conflict = portalExclusivityConflict(
    portalId,
    (data ?? []).map((r) => r.portal),
  );
  if (conflict) throw new Error(conflict);
}
