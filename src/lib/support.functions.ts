/**
 * Sistem de suport / tichete.
 *
 * Reguli de vizibilitate (aplicate atât în RLS, cât și server-side aici):
 *  - un agent vede DOAR tichetele deschise de el;
 *  - un administrator de agenție vede toate tichetele agenției lui;
 *  - Superadminul vede tot, inclusiv notițele interne.
 *
 * Utilizatorii nu pot schimba statusul unui tichet și nu pot scrie notițe
 * interne: acele operațiuni există numai în funcțiile de Superadmin.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";

export const SUPPORT_CATEGORIES = [
  { id: "technical", label: "Problemă tehnică" },
  { id: "billing", label: "Facturare și abonament" },
  { id: "feature_request", label: "Cerere funcționalitate" },
  { id: "data_import", label: "Date, import și portaluri" },
  { id: "account_access", label: "Cont și acces" },
  { id: "other", label: "Altele" },
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number]["id"];
export type SupportStatus = "open" | "in_progress" | "resolved" | "closed";

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  open: "Deschis",
  in_progress: "În lucru",
  resolved: "Rezolvat",
  closed: "Închis",
};

export const SUPPORT_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  SUPPORT_CATEGORIES.map((c) => [c.id, c.label]),
);

type AuthContext = {
  supabase: {
    rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  userId: string;
};

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function isSuperadmin(context: AuthContext): Promise<boolean> {
  const { data } = await context.supabase.rpc("is_superadmin");
  return data === true;
}

async function requireSuperadmin(context: AuthContext): Promise<void> {
  if (!(await isSuperadmin(context))) {
    throw new Error("Acces refuzat: doar Superadmin poate administra tichetele de suport.");
  }
}

type Actor = {
  userId: string;
  organizationId: string | null;
  isOrgAdmin: boolean;
  isSuperadmin: boolean;
};

async function loadActor(context: AuthContext): Promise<Actor> {
  const admin = await loadAdmin();
  const [superadmin, orgAdmin, profile] = await Promise.all([
    isSuperadmin(context),
    context.supabase.rpc("is_org_admin").then((r) => r.data === true),
    admin.from("profiles").select("organization_id").eq("id", context.userId).maybeSingle(),
  ]);
  return {
    userId: context.userId,
    organizationId: (profile.data?.organization_id as string | null) ?? null,
    isOrgAdmin: orgAdmin,
    isSuperadmin: superadmin,
  };
}

export type SupportTicketRow = {
  id: string;
  subject: string;
  category: string;
  status: SupportStatus;
  createdAt: string;
  lastMessageAt: string;
  lastReplyByStaff: boolean;
  createdByName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  messageCount: number;
};

export type SupportTicketMessage = {
  id: string;
  body: string;
  createdAt: string;
  isStaff: boolean;
  isInternalNote: boolean;
  senderName: string | null;
  mine: boolean;
};

export type SupportTicketDetail = SupportTicketRow & {
  contextPath: string | null;
  messages: SupportTicketMessage[];
  canReply: boolean;
};

type TicketDbRow = {
  id: string;
  subject: string;
  category: string;
  status: string;
  created_at: string;
  last_message_at: string;
  last_reply_by_staff: boolean;
  created_by: string;
  organization_id: string | null;
  context_path?: string | null;
};

async function decorate(
  rows: TicketDbRow[],
  admin: Awaited<ReturnType<typeof loadAdmin>>,
): Promise<SupportTicketRow[]> {
  if (rows.length === 0) return [];
  const userIds = Array.from(new Set(rows.map((r) => r.created_by)));
  const orgIds = Array.from(
    new Set(rows.map((r) => r.organization_id).filter(Boolean)),
  ) as string[];
  const ticketIds = rows.map((r) => r.id);

  const [{ data: profiles }, { data: orgs }, { data: messages }] = await Promise.all([
    admin.from("profiles").select("id, full_name").in("id", userIds),
    orgIds.length
      ? admin.from("organizations").select("id, name").in("id", orgIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    admin.from("support_ticket_messages").select("ticket_id").in("ticket_id", ticketIds),
  ]);

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string]));
  const orgById = new Map((orgs ?? []).map((o) => [o.id, o.name as string]));
  const counts = new Map<string, number>();
  for (const m of (messages ?? []) as { ticket_id: string }[]) {
    counts.set(m.ticket_id, (counts.get(m.ticket_id) ?? 0) + 1);
  }

  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    category: r.category,
    status: r.status as SupportStatus,
    createdAt: r.created_at,
    lastMessageAt: r.last_message_at,
    lastReplyByStaff: r.last_reply_by_staff,
    createdByName: nameById.get(r.created_by) ?? null,
    organizationId: r.organization_id,
    organizationName: r.organization_id ? (orgById.get(r.organization_id) ?? null) : null,
    messageCount: counts.get(r.id) ?? 0,
  }));
}

const TICKET_COLUMNS =
  "id, subject, category, status, created_at, last_message_at, last_reply_by_staff, created_by, organization_id, context_path";

/** Tichetele proprii (agent) sau ale întregii agenții (agency_admin). */
export const listMySupportTickets = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<SupportTicketRow[]> => {
    const actor = await loadActor(context as unknown as AuthContext);
    const admin = await loadAdmin();

    let query = admin
      .from("support_tickets")
      .select(TICKET_COLUMNS)
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (actor.isOrgAdmin && actor.organizationId) {
      query = query.eq("organization_id", actor.organizationId);
    } else {
      query = query.eq("created_by", actor.userId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return decorate((data ?? []) as unknown as TicketDbRow[], admin);
  });

/** Deschide un tichet nou, cu primul mesaj din fir. */
export const createSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        subject: z.string().trim().min(4).max(160),
        body: z.string().trim().min(10).max(5000),
        category: z.enum([
          "technical",
          "billing",
          "feature_request",
          "data_import",
          "account_access",
          "other",
        ]),
        contextPath: z.string().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const actor = await loadActor(context as unknown as AuthContext);
    const admin = await loadAdmin();

    const { data: ticket, error } = await admin
      .from("support_tickets")
      .insert({
        organization_id: actor.organizationId,
        created_by: actor.userId,
        subject: data.subject,
        category: data.category,
        status: "open",
        context_path: data.contextPath ?? null,
        last_message_at: new Date().toISOString(),
        last_reply_by_staff: false,
      } as never)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const ticketId = (ticket as { id: string } | null)?.id;
    if (!ticketId) throw new Error("Tichetul nu a putut fi creat.");

    await admin.from("support_ticket_messages").insert({
      ticket_id: ticketId,
      sender_id: actor.userId,
      is_staff: false,
      is_internal_note: false,
      body: data.body,
    } as never);

    const [{ data: org }, { data: profile }] = await Promise.all([
      actor.organizationId
        ? admin.from("organizations").select("name").eq("id", actor.organizationId).maybeSingle()
        : Promise.resolve({ data: null as { name: string } | null }),
      admin.from("profiles").select("full_name").eq("id", actor.userId).maybeSingle(),
    ]);

    const { data: supers } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "superadmin");
    const uniqueSupers = Array.from(new Set((supers ?? []).map((r) => r.user_id)));
    if (uniqueSupers.length > 0) {
      await admin.from("notifications").insert(
        uniqueSupers.map((userId) => ({
          organization_id: null,
          user_id: userId,
          type: "support_ticket",
          title: `Tichet nou: ${data.subject}`,
          body: `${profile?.full_name ?? "Un utilizator"}${org?.name ? ` (${org.name})` : ""} a deschis un tichet — ${SUPPORT_CATEGORY_LABELS[data.category]}.`,
          link: "/superadmin/support",
          created_by: actor.userId,
        })) as never,
      );
    }

    return { ok: true as const, ticketId };
  });

async function loadTicketForActor(
  ticketId: string,
  actor: Actor,
  admin: Awaited<ReturnType<typeof loadAdmin>>,
): Promise<TicketDbRow> {
  const { data, error } = await admin
    .from("support_tickets")
    .select(TICKET_COLUMNS)
    .eq("id", ticketId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const ticket = data as unknown as TicketDbRow | null;
  if (!ticket) throw new Error("Tichetul nu există sau nu îți este accesibil.");

  if (!actor.isSuperadmin) {
    const sameOrg = !!actor.organizationId && ticket.organization_id === actor.organizationId;
    const allowed = ticket.created_by === actor.userId || (actor.isOrgAdmin && sameOrg);
    if (!allowed) throw new Error("Tichetul nu există sau nu îți este accesibil.");
  }
  return ticket;
}

/** Firul complet al unui tichet. Notițele interne apar doar Superadminului. */
export const getSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ ticketId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<SupportTicketDetail> => {
    const actor = await loadActor(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const ticket = await loadTicketForActor(data.ticketId, actor, admin);

    let msgQuery = admin
      .from("support_ticket_messages")
      .select("id, body, created_at, is_staff, is_internal_note, sender_id")
      .eq("ticket_id", ticket.id)
      .order("created_at", { ascending: true });
    if (!actor.isSuperadmin) msgQuery = msgQuery.eq("is_internal_note", false);

    const { data: messages, error } = await msgQuery;
    if (error) throw new Error(error.message);

    const rows = (messages ?? []) as unknown as {
      id: string;
      body: string;
      created_at: string;
      is_staff: boolean;
      is_internal_note: boolean;
      sender_id: string | null;
    }[];
    const senderIds = Array.from(new Set(rows.map((m) => m.sender_id).filter(Boolean))) as string[];
    const { data: profiles } = senderIds.length
      ? await admin.from("profiles").select("id, full_name").in("id", senderIds)
      : { data: [] as { id: string; full_name: string }[] };
    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string]));

    const [head] = await decorate([ticket], admin);

    return {
      ...head,
      contextPath: ticket.context_path ?? null,
      canReply: ticket.status !== "closed",
      messages: rows.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.created_at,
        isStaff: m.is_staff,
        isInternalNote: m.is_internal_note,
        senderName: m.sender_id ? (nameById.get(m.sender_id) ?? null) : "Suport Habitoo",
        mine: m.sender_id === actor.userId,
      })),
    };
  });

async function appendMessage(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  ticket: TicketDbRow,
  input: { senderId: string; body: string; isStaff: boolean; isInternalNote: boolean },
) {
  const { error } = await admin.from("support_ticket_messages").insert({
    ticket_id: ticket.id,
    sender_id: input.senderId,
    is_staff: input.isStaff,
    is_internal_note: input.isInternalNote,
    body: input.body,
  } as never);
  if (error) throw new Error(error.message);

  if (!input.isInternalNote) {
    await admin
      .from("support_tickets")
      .update({
        last_message_at: new Date().toISOString(),
        last_reply_by_staff: input.isStaff,
        ...(input.isStaff ? {} : { status: ticket.status === "resolved" ? "open" : ticket.status }),
      } as never)
      .eq("id", ticket.id);
  }
}

/** Răspuns al utilizatorului pe un tichet propriu / al agenției. */
export const replyToSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ ticketId: z.string().uuid(), body: z.string().trim().min(2).max(5000) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const actor = await loadActor(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const ticket = await loadTicketForActor(data.ticketId, actor, admin);
    if (ticket.status === "closed")
      throw new Error("Tichetul este închis. Deschide un tichet nou.");

    await appendMessage(admin, ticket, {
      senderId: actor.userId,
      body: data.body,
      // Un răspuns al Superadminului pe firul unui tichet este tratat ca răspuns de suport.
      isStaff: actor.isSuperadmin,
      isInternalNote: false,
    });
    return { ok: true as const };
  });

/* ---------------------------------- Superadmin --------------------------------- */

/** Lista completă a tichetelor din platformă, cu filtre. */
export const listAllSupportTickets = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z
          .enum(["open", "in_progress", "resolved", "closed", "unresolved", "all"])
          .default("unresolved"),
        organizationId: z.string().uuid().optional(),
        category: z.string().max(40).optional(),
        search: z.string().max(120).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<SupportTicketRow[]> => {
    await requireSuperadmin(context as unknown as AuthContext);
    const admin = await loadAdmin();

    let query = admin
      .from("support_tickets")
      .select(TICKET_COLUMNS)
      .order("last_message_at", { ascending: false })
      .limit(300);
    if (data.status === "unresolved") query = query.in("status", ["open", "in_progress"]);
    else if (data.status !== "all") query = query.eq("status", data.status);
    if (data.organizationId) query = query.eq("organization_id", data.organizationId);
    if (data.category) query = query.eq("category", data.category);
    if (data.search) {
      const term = data.search.replace(/[%,()]/g, " ").trim();
      if (term) query = query.ilike("subject", `%${term}%`);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return decorate((rows ?? []) as unknown as TicketDbRow[], admin);
  });

/** Contorul de tichete nerezolvate, pentru badge-ul din sidebar-ul Superadmin. */
export const countUnresolvedSupportTickets = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<number> => {
    if (!(await isSuperadmin(context as unknown as AuthContext))) return 0;
    const admin = await loadAdmin();
    const { count } = await admin
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "in_progress"]);
    return count ?? 0;
  });

/** Răspuns de suport sau notiță internă (doar Superadmin). */
export const replySupportTicketAsStaff = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ticketId: z.string().uuid(),
        body: z.string().trim().min(2).max(5000),
        isInternalNote: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireSuperadmin(context as unknown as AuthContext);
    const ctx = context as unknown as AuthContext;
    const admin = await loadAdmin();

    const { data: raw } = await admin
      .from("support_tickets")
      .select(TICKET_COLUMNS)
      .eq("id", data.ticketId)
      .maybeSingle();
    const ticket = raw as unknown as TicketDbRow | null;
    if (!ticket) throw new Error("Tichetul nu există.");

    await appendMessage(admin, ticket, {
      senderId: ctx.userId,
      body: data.body,
      isStaff: true,
      isInternalNote: data.isInternalNote,
    });

    if (!data.isInternalNote) {
      await admin.from("notifications").insert({
        organization_id: ticket.organization_id,
        user_id: ticket.created_by,
        type: "support_ticket",
        title: "Răspuns la tichetul tău de suport",
        body: `Suportul Habitoo a răspuns la „${ticket.subject}”.`,
        link: `/app/support?ticket=${ticket.id}`,
        created_by: ctx.userId,
      } as never);
      if (ticket.status === "open") {
        await admin
          .from("support_tickets")
          .update({ status: "in_progress" } as never)
          .eq("id", ticket.id);
      }
    }

    return { ok: true as const };
  });

/** Schimbă statusul unui tichet (doar Superadmin) + audit. */
export const setSupportTicketStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ticketId: z.string().uuid(),
        status: z.enum(["open", "in_progress", "resolved", "closed"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireSuperadmin(context as unknown as AuthContext);
    const ctx = context as unknown as AuthContext;
    const admin = await loadAdmin();

    const { data: raw } = await admin
      .from("support_tickets")
      .select(TICKET_COLUMNS)
      .eq("id", data.ticketId)
      .maybeSingle();
    const ticket = raw as unknown as TicketDbRow | null;
    if (!ticket) throw new Error("Tichetul nu există.");
    if (ticket.status === data.status) return { ok: true as const };

    const resolved = data.status === "resolved" || data.status === "closed";
    const { error } = await admin
      .from("support_tickets")
      .update({
        status: data.status,
        resolved_at: resolved ? new Date().toISOString() : null,
        resolved_by: resolved ? ctx.userId : null,
      } as never)
      .eq("id", ticket.id);
    if (error) throw new Error(error.message);

    await admin.from("notifications").insert({
      organization_id: ticket.organization_id,
      user_id: ticket.created_by,
      type: "support_ticket",
      title: `Tichet ${SUPPORT_STATUS_LABELS[data.status].toLowerCase()}`,
      body: `Statusul tichetului „${ticket.subject}” a fost schimbat în „${SUPPORT_STATUS_LABELS[data.status]}”.`,
      link: `/app/support?ticket=${ticket.id}`,
      created_by: ctx.userId,
    } as never);

    await admin.from("audit_logs").insert({
      organization_id: ticket.organization_id,
      actor_id: ctx.userId,
      action: "support_ticket.status_changed",
      entity: "support_tickets",
      entity_id: ticket.id,
      old_values: { status: ticket.status },
      new_values: { status: data.status, changed_at: new Date().toISOString() },
      created_by: ctx.userId,
    } as never);

    return { ok: true as const };
  });
