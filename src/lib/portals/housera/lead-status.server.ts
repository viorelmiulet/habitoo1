/**
 * Etapa lead-ului către Housera (H11): `PATCH leads/{id}` doar cu `status`.
 * Triggerul `t_leads_housera_status` pune `status_desired` pe legătură; cron-ul
 * Housera trimite în fundal și reîncearcă la eșec. Sens invers: doar notă.
 */
import type { HouseraClientLike } from "./publish";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type HouseraLeadStatus = "new" | "contacted" | "viewing" | "offer" | "closed";

const STAGE_MAP: Record<string, HouseraLeadStatus> = {
  new: "new", contacted: "contacted", qualified: "contacted", viewing: "viewing",
  offer: "offer", negotiation: "offer", transaction: "closed", won: "closed", lost: "closed",
};
/** Aceeași mapare ca `housera_lead_status_for_stage` din baza de date. */
export function houseraStatusForStage(stage: string | null | undefined): HouseraLeadStatus | null {
  return (stage && STAGE_MAP[stage]) || null;
}

export const HOUSERA_STATUS_LABELS: Record<string, string> = {
  new: "nou", contacted: "contactat", viewing: "vizionare", offer: "ofertă", closed: "închis",
};

type Link = { id: string; organization_id: string; external_lead_id: string; lead_id: string | null; status_desired: string | null; status_sent: string | null; status_remote: string | null };

/** Trimite etapele în așteptare pentru o agenție; eșecurile rămân pentru rularea următoare. */
export async function syncHouseraLeadStatuses(admin: Admin, orgId: string, client: HouseraClientLike, nowIso = new Date().toISOString()) {
  const { data } = await admin.from("portal_lead_links")
    .select("id, organization_id, external_lead_id, lead_id, status_desired, status_sent, status_remote")
    .eq("portal", "housera").eq("organization_id", orgId).not("status_desired", "is", null).limit(50);
  let sent = 0, skipped = 0, failed = 0;
  for (const l of (data ?? []) as Link[]) {
    const want = l.status_desired!;
    const current = l.status_remote ?? l.status_sent;
    if (current === want) {
      await admin.from("portal_lead_links").update({ status_desired: null, status_sync_error: null }).eq("id", l.id);
      skipped++; continue;
    }
    try {
      await client.requestMeta(`leads/${encodeURIComponent(l.external_lead_id)}`, { method: "PATCH", body: { status: want }, noRateRetry: true } as never);
      await admin.from("portal_lead_links").update({
        status_desired: null, status_sent: want, status_remote: want, status_sync_error: null, status_synced_at: nowIso,
      }).eq("id", l.id);
      sent++;
    } catch (e) {
      failed++;
      await admin.from("portal_lead_links").update({ status_sync_error: (e instanceof Error ? e.message : "eroare").slice(0, 300) }).eq("id", l.id);
    }
  }
  return { sent, skipped, failed };
}

/** Statusul primit de la Housera: notă în istoric, etapa Habitoo rămâne. Ecoul propriei trimiteri nu se notează. */
export async function noteHouseraRemoteStatus(admin: Admin, orgId: string, externalId: string, status: string | null): Promise<boolean> {
  if (!status) return false;
  const { data } = await admin.from("portal_lead_links").select("id, lead_id, status_sent, status_remote")
    .eq("portal", "housera").eq("organization_id", orgId).eq("external_lead_id", externalId).maybeSingle();
  const l = data as { id: string; lead_id: string | null; status_sent: string | null; status_remote: string | null } | null;
  if (!l?.lead_id || l.status_remote === status) return false;
  await admin.from("portal_lead_links").update({ status_remote: status }).eq("id", l.id);
  if (l.status_sent === status) return false;
  const { data: lead } = await admin.from("leads").select("stage").eq("id", l.lead_id).maybeSingle();
  await admin.from("lead_events").insert({
    organization_id: orgId, lead_id: l.lead_id, to_stage: lead?.stage ?? "new",
    note: `Etapa pe Housera: ${HOUSERA_STATUS_LABELS[status] ?? status}`,
  });
  return true;
}
