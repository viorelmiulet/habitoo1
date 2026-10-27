// Fila „Cereri Facebook”: citire ca utilizatorul conectat, potriviri cu proprietățile agenției și lead.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { isListPageSize } from "@/lib/list-page-size";
import { daysCutoff } from "@/lib/private-listings";
import { buildSearchPlaces, placeChoiceSchema, type SearchPlaceOption } from "./search-places";
import { matchRequestProperty, propertyTypeKey } from "./social-requests";
import { offerSendReason } from "./offer-client";

export type SocialRequest = {
  id: string; url: string | null; groupName: string | null; postedAt: string | null; firstSeenAt: string;
  text: string | null; authorName: string | null; publisherType: string | null; transactionType: string | null;
  propertyType: string | null; rooms: number | null; budgetMin: number | null; budgetMax: number | null;
  currency: string | null; county: string | null; city: string | null; zones: string[]; phone: string | null;
};

const filtersSchema = z.object({
  transaction: z.enum(["cumparare", "inchiriere"]).optional(),
  propertyType: z.string().max(80).optional(),
  rooms: z.array(z.number().int().min(1).max(5)).max(5).optional(),
  budgetMin: z.number().min(0).max(1e9).optional(),
  budgetMax: z.number().min(0).max(1e9).optional(),
  places: z.array(placeChoiceSchema).max(100).optional(),
  days: z.number().int().min(0).max(7).optional(),
  page: z.number().int().min(0).max(1000).optional(),
  pageSize: z.number().int().refine(isListPageSize).optional(),
});

const COLUMNS = "id,url,group_name,posted_at,first_seen_at,text,author_name,publisher_type,transaction_type,property_type,rooms,budget_min,budget_max,currency,county,city,zones,phone";
type Row = Record<string, unknown>;
const toDto = (r: Row): SocialRequest => ({
  id: String(r.id), url: (r.url as string) ?? null, groupName: (r.group_name as string) ?? null, postedAt: (r.posted_at as string) ?? null,
  firstSeenAt: String(r.first_seen_at), text: (r.text as string) ?? null, authorName: (r.author_name as string) ?? null,
  publisherType: (r.publisher_type as string) ?? null, transactionType: (r.transaction_type as string) ?? null,
  propertyType: (r.property_type as string) ?? null, rooms: r.rooms === null ? null : Number(r.rooms),
  budgetMin: r.budget_min === null ? null : Number(r.budget_min), budgetMax: r.budget_max === null ? null : Number(r.budget_max),
  currency: (r.currency as string) ?? null, county: (r.county as string) ?? null, city: (r.city as string) ?? null,
  zones: Array.isArray(r.zones) ? (r.zones as string[]) : [], phone: (r.phone as string) ?? null,
});

const TYPE_PATTERNS: Record<string, string> = { apartament: "%apart%", casa: "%cas%", teren: "%teren%", birou: "%birou%", comercial: "%comerc%" };

export const getSocialRequests = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => filtersSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const pageSize = data.pageSize ?? 15, page = data.page ?? 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = data.places?.length
      ? context.supabase.rpc("search_social_requests_places", { _choices: data.places }, { count: "exact" }).select(COLUMNS)
      : context.supabase.from("social_requests").select(COLUMNS, { count: "exact" });
    if (data.transaction) q = q.eq("transaction_type", data.transaction);
    if (data.propertyType) q = q.ilike("property_type", TYPE_PATTERNS[propertyTypeKey(data.propertyType)] ?? data.propertyType);
    if (data.rooms?.length) q = data.rooms.includes(5) ? q.or(`rooms.in.(${data.rooms.join(",")}),rooms.gte.5`) : q.in("rooms", data.rooms);
    // Buget: intervalul cererii se suprapune cu cel căutat.
    if (data.budgetMin !== undefined) q = q.gte("budget_max", data.budgetMin);
    if (data.budgetMax !== undefined) q = q.lte("budget_min", data.budgetMax);
    if (data.days !== undefined) q = q.gte("first_seen_at", daysCutoff(data.days));
    const { data: rows, count, error } = await q
      .order("posted_at", { ascending: false, nullsFirst: false }).order("first_seen_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw new Error("Cererile nu au putut fi încărcate.");
    return { items: ((rows ?? []) as Row[]).map(toDto), total: count ?? 0 };
  });

export const getSocialRequestFacets = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<{ places: SearchPlaceOption[] }> => {
    const { data } = await context.supabase.from("social_requests").select("county,city,zones").limit(5000);
    const rows = (data ?? []).flatMap((r) => (r.zones?.length ? r.zones.map((zone) => ({ county: r.county, city: r.city, zone })) : [{ county: r.county, city: r.city }]));
    return { places: buildSearchPlaces(rows) };
  });

async function loadRequest(supabase: { from: (t: "social_requests") => unknown }, id: string): Promise<SocialRequest> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from("social_requests").select(COLUMNS).eq("id", id).maybeSingle();
  if (!data) throw new Error("Cererea nu mai este disponibilă.");
  return toDto(data as Row);
}

export const getSocialRequestMatches = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const r = await loadRequest(context.supabase, data.id);
    const { data: profile } = await context.supabase.from("profiles").select("organization_id").eq("id", context.userId).maybeSingle();
    if (!profile?.organization_id) return { items: [] };
    const { data: props, error } = await context.supabase.from("properties")
      .select("id,code,title,status,publish_status,deleted_at,transaction_kind,property_type,rooms,price,currency,county,city,district")
      .eq("organization_id", profile.organization_id).eq("status", "active").is("deleted_at", null).limit(2000);
    if (error) throw new Error("Proprietățile nu au putut fi încărcate.");
    const items = (props ?? []).flatMap((p) => {
      const m = matchRequestProperty({ ...r, budget_min: r.budgetMin, budget_max: r.budgetMax, transaction_type: r.transactionType, property_type: r.propertyType }, { ...p, price: p.price === null ? null : Number(p.price) });
      return m ? [{ id: p.id, code: p.code as string | null, title: p.title, price: p.price === null ? null : Number(p.price), currency: p.currency, city: p.city, district: p.district, rooms: p.rooms, score: m.score, reasons: m.reasons, canSend: offerSendReason(p) === null }] : [];
    }).sort((a, b) => b.score - a.score).slice(0, 30);
    return { items };
  });

export const addSocialRequestLead = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const r = await loadRequest(context.supabase, data.id);
    const { data: profile } = await context.supabase.from("profiles").select("organization_id").eq("id", context.userId).maybeSingle();
    const org = profile?.organization_id;
    if (!org) throw new Error("Contul nu aparține unei agenții.");
    const name = r.authorName?.trim() || "Cerere Facebook";
    const [first, ...rest] = name.split(/\s+/);
    const note = [`Cerere din grupul de Facebook${r.groupName ? ` „${r.groupName}”` : ""}.`, r.url ? `Postarea: ${r.url}` : null, "Fără acord marketing.", r.text ? `\n${r.text.slice(0, 1500)}` : null].filter(Boolean).join("\n");
    // Contact fără acord: pagina contactului afișează „Fără acord marketing”.
    const { data: contact, error: cErr } = await context.supabase.from("contacts").insert({
      organization_id: org, first_name: first, last_name: rest.join(" "), phone: r.phone, source: "Facebook",
      gdpr_consent: false, type: "buyer", notes: note, assigned_to: context.userId, created_by: context.userId,
    } as never).select("id").single();
    if (cErr || !contact) throw new Error("Contactul nu a putut fi creat.");
    const { data: lead, error } = await context.supabase.from("leads").insert({
      organization_id: org, contact_id: contact.id, name, phone: r.phone, source: "Facebook", campaign: r.url,
      notes: note, assigned_to: context.userId, created_by: context.userId,
    }).select("id").single();
    if (error || !lead) throw new Error("Lead-ul nu a putut fi creat.");
    return { leadId: lead.id, contactId: contact.id };
  });
