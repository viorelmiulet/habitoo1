import { z } from "zod";
import { apiError, digest, type PartnerContext } from "./core.server";
import type { PartnerReadStore } from "./read.server";
import { ingestPortalLead } from "@/lib/portals/lead-ingest.server";

const text = (max: number) => z.string().trim().min(1).max(max);
const timestamp = z.string().datetime({ offset: true }).optional();
export const publicationSchema = z.object({ status: z.enum(["published", "pending_review", "rejected", "removed"]), portal_listing_id: text(200).optional(), url: z.string().url().max(2000).refine(v => new URL(v).protocol === "https:").optional(), reasons: z.array(z.object({ code: text(100).optional(), message: text(2000) }).strict()).max(50).optional(), occurred_at: timestamp }).strict();
export const leadSchema = z.object({ external_id: text(200), listing_id: z.string().uuid().optional(), agency_id: z.string().uuid().optional(), name: text(200), email: z.string().trim().email().max(254).optional(), phone: text(50).optional(), message: text(4000).optional(), created_at: timestamp }).strict().refine(v => v.email || v.phone, { message: "Cel puțin email sau telefon este obligatoriu." }).refine(v => v.listing_id || v.agency_id, { message: "listing_id sau agency_id este obligatoriu." });
export const messageSchema = z.object({ external_id: text(200), body: text(4000), sender: z.literal("client"), created_at: timestamp }).strict();
const count = z.number().int().min(0).max(2147483647).optional();
export const statsSchema = z.object({ items: z.array(z.object({ listing_id: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(`${v}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v; }), views: count, contacts: count, favorites: count }).strict()).min(1).max(500) }).strict();
export type WriteResult = { not_found?: boolean; pending?: boolean; conflict?: boolean; id?: string; message_id?: string; deduplicated?: boolean; applied?: boolean; accepted?: number };
export type PartnerWriteStore = {
  read: PartnerReadStore;
  publication: (ctx: PartnerContext, id: string, body: z.infer<typeof publicationSchema>) => Promise<WriteResult>;
  lead: (ctx: PartnerContext, org: string, body: z.infer<typeof leadSchema>) => Promise<WriteResult>;
  message: (ctx: PartnerContext, id: string, body: z.infer<typeof messageSchema>) => Promise<WriteResult>;
  stats: (ctx: PartnerContext, body: z.infer<typeof statsSchema>) => Promise<WriteResult>;
};
const missing = (ctx: PartnerContext) => apiError(404, "NOT_FOUND", "Entitatea nu există pentru acest portal.", ctx.requestId);
function resultResponse(ctx: PartnerContext, result: WriteResult, kind: string) {
  if (result.not_found) return missing(ctx);
  if (result.pending || result.conflict) return apiError(409, result.pending ? "REQUEST_IN_PROGRESS" : "EXTERNAL_ID_CONFLICT", "Cererea nu poate fi aplicată momentan.", ctx.requestId);
  return Response.json(kind === "lead" ? { id: result.id, status: "accepted", deduplicated: result.deduplicated === true } : result, { status: kind === "lead" && !result.deduplicated ? 201 : 200 });
}
export async function handlePartnerWrite(ctx: PartnerContext, store: PartnerWriteStore, kind: "publication" | "lead" | "message" | "stats", body: unknown, id?: string) {
  const schema = { publication: publicationSchema, lead: leadSchema, message: messageSchema, stats: statsSchema }[kind];
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION_ERROR", "Datele trimise nu sunt valide.", ctx.requestId, parsed.error.issues.map(i => ({ field: i.path.join("."), message: i.message })));
  if (kind === "lead") {
    const data = leadSchema.parse(body);
    const scope = await store.read.scope(ctx.portal.slug, ctx.identity.environment);
    let org = data.agency_id;
    if (data.listing_id) {
      const listing = await store.read.listing(ctx.portal.slug, data.listing_id);
      if (!listing?.visible || !scope.active.has(listing.organization_id) || (org && org !== listing.organization_id)) return missing(ctx);
      org = listing.organization_id;
    }
    if (!org || !scope.active.has(org)) return missing(ctx);
    return resultResponse(ctx, await store.lead(ctx, org, data), kind);
  }
  if (kind === "stats") return resultResponse(ctx, await store.stats(ctx, statsSchema.parse(body)), kind);
  if (!id || !z.string().uuid().safeParse(id).success) return missing(ctx);
  return resultResponse(ctx, kind === "publication" ? await store.publication(ctx, id, publicationSchema.parse(body)) : await store.message(ctx, id, messageSchema.parse(body)), kind);
}

export async function supabaseWriteStore(): Promise<PartnerWriteStore> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { supabaseReadStore } = await import("./read.server");
  const read = await supabaseReadStore();
  async function notify(ctx: PartnerContext, leadId: string, key: string, body: string | null, inApp: boolean) {
    const lead = await db.from("leads").select("organization_id,assigned_to,name,property_id").eq("id", leadId).is("deleted_at", null).single();
    if (lead.error) throw lead.error;
    const l = lead.data;
    const admins = l.assigned_to ? null : await db.from("user_roles").select("user_id").eq("organization_id", l.organization_id).eq("role", "agency_admin");
    if (admins?.error) throw admins.error;
    const recipients = l.assigned_to ? [l.assigned_to] : admins?.data?.map(r => r.user_id) ?? [];
    const claim = await db.rpc("partner_api_email_claim", { _portal: ctx.portal.slug, _environment: ctx.identity.environment, _lead: leadId });
    if (claim.error) throw claim.error;
    const { notifyAgentOfStoriaMessage } = await import("@/lib/portals/storia/messages.server");
    for (const userId of new Set(recipients)) await notifyAgentOfStoriaMessage(db, { organizationId: l.organization_id, assignedTo: userId, propertyTitle: "cererea clientului", leadId, senderName: l.name, body, messageKey: `${key}:${userId}`, inApp: inApp || !l.assigned_to, portalLabel: ctx.portal.display_name, keyPrefix: `partner-${ctx.portal.slug}-${ctx.identity.environment}`, link: `/app/leads?lead=${leadId}`, email: claim.data === true });
  }
  return {
    read,
    async publication(ctx, id, body) { const r = await db.rpc("partner_api_publication_apply", { _portal: ctx.portal.slug, _environment: ctx.identity.environment, _id: id, _body: body }); if (r.error) throw r.error; return r.data as WriteResult; },
    async stats(ctx, body) { const r = await db.rpc("partner_api_stats_apply", { _portal: ctx.portal.slug, _environment: ctx.identity.environment, _items: body.items }); if (r.error) throw r.error; return r.data as WriteResult; },
    async lead(ctx, org, body) {
      let property: { assigned_to: string | null; title: string } | null = null;
      if (body.listing_id) {
        const allowed = await db.rpc("partner_api_listing_allowed", { _portal: ctx.portal.slug, _environment: ctx.identity.environment, _id: body.listing_id, _recent: false });
        if (allowed.error) throw allowed.error;
        if (allowed.data !== org) return { not_found: true };
        const p = await db.from("properties").select("assigned_to,title").eq("id", body.listing_id).eq("organization_id", org).is("deleted_at", null).single();
        if (p.error) throw p.error; property = p.data;
      }
      const claim = await db.rpc("partner_api_lead_claim", { _portal: ctx.portal.slug, _environment: ctx.identity.environment, _external: body.external_id, _org: org, _owner: ctx.requestId });
      if (claim.error) throw claim.error;
      const receipt = claim.data as WriteResult;
      if (receipt.not_found || receipt.pending || receipt.deduplicated) return receipt;
      if (!receipt.id || !receipt.message_id) throw new Error("Incomplete lead receipt");
      const now = new Date().toISOString(), sentAt = body.created_at ?? now;
      const existingMessage = await db.from("portal_messages").select("lead_id").eq("id", receipt.message_id).maybeSingle();
      if (existingMessage.error) throw existingMessage.error;
      let leadId = existingMessage.data?.lead_id;
      let created = false;
      if (!leadId) {
        const msg = await db.from("portal_messages").upsert({ id: receipt.message_id, organization_id: org, portal: ctx.portal.slug, property_id: body.listing_id ?? null, external_message_id: `partner:${ctx.identity.environment}:lead:${digest(body.external_id)}`, conversation_id: `partner:${ctx.identity.environment}:${digest(body.external_id)}`, sender_name: body.name, sender_email: body.email ?? null, sender_phone: body.phone ?? null, body: body.message ?? null, sent_at: sentAt }, { onConflict: "id", ignoreDuplicates: true });
        if (msg.error) throw msg.error;
        // The receipt reserves a stable CRM ID before ingestion. A crash between
        // creating the lead and attaching its message must not create a second lead.
        const recovered = await db.from("leads").select("id").eq("id", receipt.id).eq("organization_id", org).is("deleted_at", null).maybeSingle();
        if (recovered.error) throw recovered.error;
        if (recovered.data) {
          leadId = recovered.data.id;
          const attached = await db.from("portal_messages").update({ lead_id: leadId }).eq("id", receipt.message_id);
          if (attached.error) throw attached.error;
        } else {
          const stableLeadId = receipt.id;
          // Scope the reserved ID to this invocation only; keep shared push ingestion unchanged.
          const ingestionDb = new Proxy(db, { get(target, key) {
            if (key !== "from") return Reflect.get(target, key);
            return (table: Parameters<typeof db.from>[0]) => {
              const query = target.from(table);
              if (table !== "leads") return query;
              return new Proxy(query, { get(builder, method) {
                if (method === "insert") return (value: Record<string, unknown>) => builder.insert({ ...value, id: stableLeadId } as never);
                return Reflect.get(builder, method);
              } });
            };
          } });
          const result = await ingestPortalLead(ingestionDb, { portal: ctx.portal.slug, source: ctx.portal.display_name, match: { organizationId: org, propertyId: body.listing_id ?? null, assignedTo: property?.assigned_to ?? null, propertyTitle: property?.title ?? null }, name: body.name, email: body.email ?? null, phone: body.phone ?? null, senderName: body.name, bodyText: body.message ?? null, noteLine: body.message ?? `Cerere nouă din ${ctx.portal.display_name}`, sentAt, now, messageRowId: receipt.message_id, expiresAt: new Date(Date.now() + 180 * 86400000).toISOString(), createdEventNote: `Cerere nouă din ${ctx.portal.display_name}`, notificationTitle: `Cerere nouă din ${ctx.portal.display_name}`, notificationBody: body.message ?? body.name, auditAction: "partner_api_lead", auditValues: { portal: ctx.portal.slug } });
          leadId = result.leadId; created = result.created;
        }
      }
      const done = await db.rpc("partner_api_lead_finish", { _portal: ctx.portal.slug, _environment: ctx.identity.environment, _external: body.external_id, _owner: ctx.requestId, _lead: leadId });
      if (done.error) throw done.error;
      await notify(ctx, leadId, `lead:${digest(body.external_id)}`, body.message ?? null, !created);
      return { id: leadId, deduplicated: false };
    },
    async message(ctx, id, body) {
      const r = await db.rpc("partner_api_message_apply", { _portal: ctx.portal.slug, _environment: ctx.identity.environment, _lead: id, _external: body.external_id, _body: body.body, _created: body.created_at ?? new Date().toISOString() });
      if (r.error) throw r.error; const result = r.data as WriteResult;
      if (!result.not_found && !result.conflict && !result.deduplicated) await notify(ctx, id, `message:${digest(body.external_id)}`, body.body, true);
      return result;
    },
  };
}