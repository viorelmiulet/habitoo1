/**
 * Lucrătorul potrivirilor active: detectare și notificare deterministe, gratuite.
 * Nu generează ciorne AI și nu trimite nimic clientului.
 */
import {
  ACTIVE_MATCH_DEFAULT_THRESHOLD, ACTIVE_REQUEST_STATUSES, notificationBody, notificationTitle, planActiveMatches,
  romaniaDayStart, type ExistingAlert, type MatchProperty, type MatchRequest, type MatchTrigger,
} from "./plan";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
export type ActiveMatchDeps = { db: Db; isFeatureEnabled: (org: string) => Promise<boolean>; now?: () => Date };
export type QueueJob = { id: string; organization_id: string; trigger: MatchTrigger; property_id: string | null; request_id: string | null };

const PROPERTY_COLS = "id,organization_id,title,status,publish_status,deleted_at,archived_at,transaction_kind,price,city,district,address,rooms,surface,usable_surface,features,property_type";
const REQUEST_COLS = "id,organization_id,status,assigned_to,contact_id,title,kind,budget_min,budget_max,cities,areas,rooms_min,rooms_max,surface_min,features,property_type";

const num = (v: unknown) => (v == null ? null : Number(v));
function toProperty(r: Record<string, unknown>): MatchProperty {
  return { ...(r as unknown as MatchProperty), price: num(r["price"]), surface: num(r["surface"]), usable_surface: num(r["usable_surface"]) };
}
function toRequest(r: Record<string, unknown>): MatchRequest {
  return { ...(r as unknown as MatchRequest), budget_min: num(r["budget_min"]), budget_max: num(r["budget_max"]), surface_min: num(r["surface_min"]), cities: (r["cities"] as string[]) ?? [], areas: (r["areas"] as string[]) ?? [], features: (r["features"] as string[]) ?? [] };
}

export async function loadThreshold(db: Db, org: string): Promise<number> {
  const { data } = await db.from("active_match_settings").select("min_score").eq("organization_id", org).maybeSingle();
  return typeof data?.min_score === "number" ? data.min_score : ACTIVE_MATCH_DEFAULT_THRESHOLD;
}

export async function processActiveMatchJob(deps: ActiveMatchDeps, job: QueueJob): Promise<"done" | "skipped"> {
  const { db } = deps;
  const org = job.organization_id;
  if (!(await deps.isFeatureEnabled(org))) return "skipped";
  const now = deps.now?.() ?? new Date();
  const threshold = await loadThreshold(db, org);

  let properties: MatchProperty[] = [];
  let requests: MatchRequest[] = [];
  if (job.property_id) {
    const { data: p } = await db.from("properties").select(PROPERTY_COLS).eq("id", job.property_id).eq("organization_id", org).maybeSingle();
    if (!p) return "skipped";
    properties = [toProperty(p)];
    const { data: rs } = await db.from("requests").select(REQUEST_COLS).eq("organization_id", org).in("status", [...ACTIVE_REQUEST_STATUSES]).limit(2000);
    requests = (rs ?? []).map(toRequest);
  } else if (job.request_id) {
    const { data: r } = await db.from("requests").select(REQUEST_COLS).eq("id", job.request_id).eq("organization_id", org).maybeSingle();
    if (!r) return "skipped";
    requests = [toRequest(r)];
    const { data: ps } = await db.from("properties").select(PROPERTY_COLS).eq("organization_id", org).eq("status", "active").eq("publish_status", "published").is("deleted_at", null).is("archived_at", null).limit(1000);
    properties = (ps ?? []).map(toProperty);
  }
  if (!properties.length || !requests.length) return "done";

  const contactIds = [...new Set(requests.map((r) => r.contact_id).filter((x): x is string => !!x))];
  const contactOwner = new Map<string, string | null>();
  const contactName = new Map<string, string>();
  for (let i = 0; i < contactIds.length; i += 200) {
    const { data: cs } = await db.from("contacts").select("id,assigned_to,first_name,last_name").in("id", contactIds.slice(i, i + 200));
    for (const c of cs ?? []) {
      contactOwner.set(c.id, c.assigned_to ?? null);
      contactName.set(c.id, `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim());
    }
  }

  const existingQuery = db.from("active_match_alerts").select("id,request_id,property_id,price_drop_notified_at").eq("organization_id", org);
  const { data: ex } = job.property_id ? await existingQuery.eq("property_id", job.property_id) : await existingQuery.eq("request_id", job.request_id);
  const existing = (ex ?? []) as ExistingAlert[];

  const dayStart = romaniaDayStart(now);
  const { data: today } = await db.from("active_match_alerts").select("agent_id,notified_at,price_drop_notified_at").eq("organization_id", org).or(`notified_at.gte.${dayStart},price_drop_notified_at.gte.${dayStart}`);
  const notifiedToday = new Map<string, number>();
  for (const a of today ?? []) {
    if (!a.agent_id) continue;
    const n = (a.notified_at >= dayStart ? 1 : 0) + (a.price_drop_notified_at && a.price_drop_notified_at >= dayStart ? 1 : 0);
    notifiedToday.set(a.agent_id, (notifiedToday.get(a.agent_id) ?? 0) + n);
  }

  const plan = planActiveMatches({ trigger: job.trigger, organizationId: org, properties, requests, existing, threshold, notifiedToday, contactOwner });
  const ts = now.toISOString();
  const propById = new Map(properties.map((p) => [p.id, p]));
  const reqById = new Map(requests.map((r) => [r.id, r]));
  const clientOf = (rid: string) => {
    const r = reqById.get(rid);
    return (r?.contact_id && contactName.get(r.contact_id)) || r?.title || "client";
  };
  const notifications: Record<string, unknown>[] = [];

  for (const a of plan.inserts) {
    const { notify, ...row } = a;
    const { data: inserted, error } = await db.from("active_match_alerts").upsert(
      { ...row, organization_id: org, notified_at: notify ? ts : null, price_drop_notified_at: a.trigger === "price_drop" && notify ? ts : null },
      { onConflict: "request_id,property_id", ignoreDuplicates: true },
    ).select("id");
    if (error || !inserted?.length) continue; // o altă rulare a creat deja perechea
    if (notify && a.agent_id) {
      notifications.push({ organization_id: org, user_id: a.agent_id, type: "active_match", title: notificationTitle(a.score, propById.get(a.property_id)?.title ?? "Proprietate", clientOf(a.request_id)), body: notificationBody(a.reasons, a.misses, a.trigger === "price_drop"), link: `/app/requests/${a.request_id}` });
    }
  }
  for (const a of plan.renotify) {
    const { data: updated } = await db.from("active_match_alerts").update({ price_drop_notified_at: ts, score: a.score, reasons: a.reasons, misses: a.misses, trigger: "price_drop", status: "new", draft: null, draft_is_ai: false, updated_at: ts })
      .eq("id", a.alert_id).is("price_drop_notified_at", null).select("id");
    if (!updated?.length) continue;
    if (a.notify && a.agent_id) {
      notifications.push({ organization_id: org, user_id: a.agent_id, type: "active_match", title: notificationTitle(a.score, propById.get(a.property_id)?.title ?? "Proprietate", clientOf(a.request_id)), body: notificationBody(a.reasons, a.misses, true), link: `/app/requests/${a.request_id}` });
    }
  }
  if (notifications.length) await db.from("notifications").insert(notifications);
  return "done";
}

export async function processActiveMatchBatch(deps: ActiveMatchDeps, limit = 10) {
  const { data: jobs, error } = await deps.db.rpc("active_match_claim", { _limit: limit });
  if (error) throw new Error(error.message);
  const counts = { done: 0, skipped: 0, failed: 0 };
  for (const job of (jobs ?? []) as QueueJob[]) {
    try {
      const outcome = await processActiveMatchJob(deps, job);
      counts[outcome] += 1;
      await deps.db.from("active_match_queue").update({ status: outcome, locked_until: null, updated_at: new Date().toISOString() }).eq("id", job.id);
    } catch (e) {
      counts.failed += 1;
      console.error("[active_match] job failed", e instanceof Error ? e.message : "error");
      await deps.db.from("active_match_queue").update({ status: "pending", locked_until: null }).eq("id", job.id);
    }
  }
  return counts;
}
