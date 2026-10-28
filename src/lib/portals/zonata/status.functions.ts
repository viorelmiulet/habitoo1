/** ZonaTa: statusul anunțurilor pe cardul din Publicare (verificare la deschidere, max 1/min/anunț). */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";

const input = z.object({ organizationId: z.string().uuid().optional(), propertyId: z.string().uuid() });

export const getZonataListingStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { resolvePublishingOrg, assertPortalPropertyAccess } = await import("@/lib/portals.functions");
    const userId = (context as { userId: string }).userId;
    const { organizationId, agentOnly } = await resolvePublishingOrg(context as never, data.organizationId);
    await assertPortalPropertyAccess({ organizationId, propertyId: data.propertyId, agentOnly, userId });
    const { refreshZonataStatus } = await import("./status.server");
    const rows = await refreshZonataStatus({ organizationId, propertyId: data.propertyId }).catch(async () => {
      const { loadZonataStored } = await import("./load.server");
      return loadZonataStored({ organizationId, propertyId: data.propertyId });
    });
    return rows.map((r) => ({
      externalId: r.external_id,
      transaction: r.transaction,
      status: r.status,
      url: r.url,
      expiresAt: r.expires_at,
      rejectedReason: r.rejected_reason,
      checkedAt: r.last_checked_at,
    }));
  });
