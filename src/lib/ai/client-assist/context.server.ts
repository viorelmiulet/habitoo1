import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import type { ClientEntity, HistoryFact } from "./schema";

export type ClientDb = SupabaseClient<Database>;
type RequestHistory = Pick<Tables<"requests">, "id" | "title" | "kind" | "property_type" | "budget_min" | "budget_max" | "currency" | "cities" | "areas" | "rooms_min" | "rooms_max" | "features" | "status">;
function requestFact(r: RequestHistory): HistoryFact {
  const kinds: Record<string, string> = { buy: "cumpărare", rent: "închiriere" };
  const types: Record<string, string> = { apartment: "apartament", studio: "garsonieră", house: "casă", land: "teren", commercial: "spațiu comercial", office: "birou" };
  const details = [r.title, `Cerere de ${kinds[r.kind] ?? r.kind}`, r.property_type ? `Tip: ${types[r.property_type] ?? r.property_type}` : null,
    r.rooms_min !== null ? `Minimum ${r.rooms_min} camere` : null, r.rooms_max !== null ? `Maximum ${r.rooms_max} camere` : null,
    r.budget_min !== null ? `Buget minim ${r.budget_min} ${r.currency}` : null, r.budget_max !== null ? `Buget maxim ${r.budget_max} ${r.currency}` : null,
    r.cities.length ? `Localități: ${r.cities.join(", ")}` : null, r.areas.length ? `Zone: ${r.areas.join(", ")}` : null, r.features.length ? `Dotări: ${r.features.join(", ")}` : null].filter(Boolean);
  return { id: `request:${r.id}`, label: "Cerere înregistrată", text: `${details.join(". ")}.` };
}
type ActivityHistory = Pick<Tables<"activities">, "id" | "title" | "description" | "kind" | "status" | "starts_at" | "property_id">;
function activityFact(a: ActivityHistory): HistoryFact {
  const labels: Record<string, string> = { call: "Apel", viewing: "Vizionare", meeting: "Întâlnire", task: "Activitate", email: "Email", followup: "Follow-up", note: "Notă" };
  const statuses: Record<string, string> = { done: "efectuat", planned: "planificat", cancelled: "anulat" };
  const date = new Intl.DateTimeFormat("ro-RO", { timeZone: "Europe/Bucharest", dateStyle: "short" }).format(new Date(a.starts_at));
  return { id: `activity:${a.id}`, label: `${labels[a.kind] ?? a.kind} (${statuses[a.status] ?? a.status}, ${date})`, text: [a.title, a.description].filter(Boolean).join(". ") };
}
export function ownsRow(row: { assigned_to: string | null; created_by: string | null }, userId: string): boolean {
  return row.assigned_to === userId || (row.assigned_to === null && row.created_by === userId);
}
export async function clientScope(db: ClientDb, userId: string, entity: ClientEntity) {
  const [org, admin, superadmin] = await Promise.all([db.rpc("current_org"), db.rpc("is_org_admin"), db.rpc("is_superadmin")]);
  if (org.error || admin.error || superadmin.error) throw new Error("Accesul nu a putut fi verificat.");
  const query = entity.kind === "contact"
    ? db.from("contacts").select("id,organization_id,assigned_to,created_by").eq("id", entity.id)
    : db.from("leads").select("id,organization_id,assigned_to,created_by").eq("id", entity.id).is("deleted_at", null);
  const { data: row, error } = await query.maybeSingle();
  if (error || !row || (superadmin.data !== true && row.organization_id !== org.data) || (superadmin.data !== true && admin.data !== true && !ownsRow(row, userId))) throw new Error("Fișa nu este disponibilă.");
  return { organizationId: row.organization_id, agentId: admin.data === true || superadmin.data === true ? null : userId };
}

export async function readAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const r = await query(start, start + 499);
    if (r.error) throw new Error("Istoricul nu a putut fi încărcat.");
    rows.push(...r.data ?? []);
    if ((r.data?.length ?? 0) < 500) return rows;
  }
}

/** All history reads use the caller's RLS client, entity link and agency scope. */
export async function contactHistory(db: ClientDb, userId: string, id: string) {
  const scope = await clientScope(db, userId, { kind: "contact", id });
  const { data: contact, error } = await db.from("contacts").select("notes").eq("id", id).eq("organization_id", scope.organizationId).maybeSingle();
  if (error) throw new Error("Istoricul nu a putut fi încărcat.");
  const filter = scope.agentId ? `assigned_to.eq.${scope.agentId},and(assigned_to.is.null,created_by.eq.${scope.agentId})` : null;
  const [activities, requests, leads] = await Promise.all([
    readAll((a, b) => { let q = db.from("activities").select("id,title,description,kind,status,starts_at,property_id").eq("contact_id", id).eq("organization_id", scope.organizationId); if (filter) q = q.or(filter); return q.order("starts_at", { ascending: false }).order("id").range(a, b); }),
    readAll((a, b) => { let q = db.from("requests").select("id,title,kind,property_type,budget_min,budget_max,currency,cities,areas,rooms_min,rooms_max,features,status").eq("contact_id", id).eq("organization_id", scope.organizationId); if (filter) q = q.or(filter); return q.order("created_at", { ascending: false }).order("id").range(a, b); }),
    readAll((a, b) => { let q = db.from("leads").select("id,notes,stage,request_id").eq("contact_id", id).eq("organization_id", scope.organizationId).is("deleted_at", null); if (filter) q = q.or(filter); return q.order("id").range(a, b); }),
  ]);
  const history: HistoryFact[] = contact?.notes?.trim() ? [{ id: "contact-note", label: "Nota contactului", text: contact.notes }] : [];
  for (const r of requests) history.push(requestFact(r));
  for (const a of activities) history.push(activityFact(a));
  for (const lead of leads) {
    if (lead.notes) history.push({ id: `lead:${lead.id}`, label: "Nota lead-ului", text: lead.notes });
    const linkedActivities = await readAll((a, b) => { let q = db.from("activities").select("id,title,description,kind,status,starts_at,property_id").eq("lead_id", lead.id).eq("organization_id", scope.organizationId); if (filter) q = q.or(filter); return q.order("starts_at", { ascending: false }).order("id").range(a, b); });
    for (const a of linkedActivities) if (!history.some(f => f.id === `activity:${a.id}`)) { history.push(activityFact(a)); activities.push(a); }
    if (lead.request_id && !history.some(f => f.id === `request:${lead.request_id}`)) {
      const { data: r, error: requestError } = await db.from("requests").select("id,title,kind,property_type,budget_min,budget_max,currency,cities,areas,rooms_min,rooms_max,features,status,assigned_to,created_by").eq("id", lead.request_id).eq("organization_id", scope.organizationId).maybeSingle();
      if (requestError) throw new Error("Istoricul nu a putut fi încărcat.");
      if (r && (!scope.agentId || ownsRow(r, userId))) history.push(requestFact(r));
    }
    const messages = await readAll((a, b) => db.from("portal_messages").select("id,body,direction,sent_at").eq("lead_id", lead.id).eq("organization_id", scope.organizationId).order("sent_at", { ascending: false }).order("id").range(a, b));
    for (const m of messages) if (m.body) history.push({ id: `message:${m.id}`, label: `${m.direction === "in" ? "Mesaj client" : "Mesaj agent"} (${m.sent_at})`, text: m.body });
  }
  for (const a of activities) {
    if (a.kind !== "viewing" || a.status !== "done" || !a.property_id) continue;
    let query = db.from("properties").select("title").eq("id", a.property_id).eq("organization_id", scope.organizationId).is("deleted_at", null);
    if (filter) query = query.or(filter);
    const { data: property, error: propertyError } = await query.maybeSingle();
    if (propertyError) throw new Error("Istoricul nu a putut fi încărcat.");
    const fact = history.find(f => f.id === `activity:${a.id}`);
    if (property?.title && fact) fact.text = `Ofertă vizionată: ${property.title}. ${fact.text}`;
  }
  return { scope, history };
}

export async function entityRequests(db: ClientDb, userId: string, entity: ClientEntity): Promise<Tables<"requests">[]> {
  const scope = await clientScope(db, userId, entity);
  if (entity.kind === "lead") {
    const { data: lead, error } = await db.from("leads").select("request_id").eq("id", entity.id).eq("organization_id", scope.organizationId).maybeSingle();
    if (error) throw new Error("Cererea nu este disponibilă.");
    if (!lead?.request_id) return [];
    const { data: request, error: requestError } = await db.from("requests").select("*").eq("id", lead.request_id).eq("organization_id", scope.organizationId).maybeSingle();
    if (requestError) throw new Error("Cererea nu este disponibilă.");
    return request && (!scope.agentId || ownsRow(request, userId)) ? [request] : [];
  }
  return readAll((a, b) => {
    let q = db.from("requests").select("*").eq("contact_id", entity.id).eq("organization_id", scope.organizationId);
    if (scope.agentId) q = q.or(`assigned_to.eq.${scope.agentId},and(assigned_to.is.null,created_by.eq.${scope.agentId})`);
    return q.order("created_at", { ascending: false }).order("id").range(a, b);
  });
}