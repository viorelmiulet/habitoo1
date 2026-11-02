/** Vumsi: statusul real pe cardul din Promovare (verificare la deschidere, max 1/min/anunț). */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";

const input = z.object({ organizationId: z.string().uuid().optional(), propertyId: z.string().uuid() });

export const getVumsiListingStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { resolvePublishingOrg, assertPortalPropertyAccess } = await import("@/lib/portals.functions");
    const userId = (context as { userId: string }).userId;
    const { organizationId, agentOnly } = await resolvePublishingOrg(context as never, data.organizationId);
    await assertPortalPropertyAccess({ organizationId, propertyId: data.propertyId, agentOnly, userId });
    const { refreshVumsiStatus } = await import("./status.server");
    return refreshVumsiStatus(organizationId, data.propertyId);
  });
