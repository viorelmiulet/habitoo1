import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { assertPortalPropertyAccess, resolvePublishingOrg, type AuthContext } from "@/lib/portals.functions";

export const getImobiliareMediaStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid().optional(), propertyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const auth = context as AuthContext;
    const org = await resolvePublishingOrg(auth, data.organizationId);
    await assertPortalPropertyAccess({ organizationId: org.organizationId, propertyId: data.propertyId, agentOnly: org.agentOnly, userId: (context as { userId: string }).userId });
    const { readImobiliareMediaStatus } = await import("./imobiliare/media-status.server");
    return readImobiliareMediaStatus(org.organizationId, data.propertyId);
  });