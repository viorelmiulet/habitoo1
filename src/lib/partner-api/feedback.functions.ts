import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { getPortalDefinition } from "@/lib/portals/registry";
import { summarizePortalStats, type DailyPortalStat } from "./feedback";
export const getPropertyPortalStatistics = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ propertyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const start = new Date(); start.setUTCDate(start.getUTCDate() - 29);
    const rows: DailyPortalStat[] = [];
    for (let from = 0; ; from += 1000) {
      const r = await context.supabase.from("partner_api_statistics").select("portal,date,views,contacts,favorites").eq("property_id", data.propertyId).gte("date", start.toISOString().slice(0, 10)).order("date").order("portal").order("environment").range(from, from + 999);
      if (r.error) throw new Error("Statisticile portalurilor nu au putut fi citite.");
      rows.push(...(r.data ?? []) as DailyPortalStat[]);
      if ((r.data?.length ?? 0) < 1000) break;
    }
    return summarizePortalStats(rows).map(row => ({ ...row, name: getPortalDefinition(row.portal)?.display_name ?? row.portal }));
  });