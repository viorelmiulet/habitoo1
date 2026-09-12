/**
 * Colaborare Habitoo (MLS intern între agențiile din platformă).
 *
 * Reguli de vizibilitate — aplicate server-side, cu proiecție explicită de
 * coloane, pentru că RLS nu poate restrânge coloanele unei linii:
 *  - o agenție vede DOAR proprietățile ALTOR agenții marcate
 *    `collaboration = true`, active și nearhivate, și numai dacă AMBELE
 *    agenții participă la colaborare (`organizations.collaboration_enabled`);
 *  - nu se expun niciodată date confidențiale ale agenției sursă: proprietar,
 *    telefon intern, note interne, agent asignat, sursă, comision intern;
 *  - propunerile și mesajele sunt protejate suplimentar de RLS: le văd doar
 *    cele două agenții implicate.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";

export type CollaborationProposalStatus =
  "pending" | "accepted" | "viewing" | "declined" | "closed";

export const COLLAB_STATUS_LABELS: Record<CollaborationProposalStatus, string> = {
  pending: "În așteptare",
  accepted: "Acceptată",
  viewing: "Vizionare programată",
  declined: "Refuzată",
  closed: "Închisă",
};

/** Statusuri de proprietate care pot fi oferite spre colaborare. */
const OFFERABLE_STATUSES = ["active", "reserved", "negotiation"] as const;

export type CollaborationOffer = {
  id: string;
  agencyId: string;
  reference: string | null;
  title: string;
  description: string | null;
  propertyType: string;
  transactionKind: string;
  status: string;
  price: number | null;
  currency: string;
  forSale: boolean;
  forRent: boolean;
  salePrice: number | null;
  rentPrice: number | null;
  rooms: number | null;
  bathrooms: number | null;
  surface: number | null;
  usableSurface: number | null;
  landSurface: number | null;
  floor: number | null;
  buildYear: number | null;
  city: string | null;
  county: string | null;
  district: string | null;
  features: string[];
  utilities: string[];
  collabCommissionPercent: number | null;
  collabTerms: string | null;
  agencyName: string;
  agencyCity: string | null;
  updatedAt: string;
  coverUrl: string | null;
  images: string[];
  myProposalCount: number;
};

type AuthContext = {
  supabase: unknown;
  userId: string;
};

/** Bucketul de media al proprietăților (constantă locală: fără import de client browser). */
const MEDIA_BUCKET = "property-media";

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Actor = { userId: string; organizationId: string; collaborationEnabled: boolean };

async function loadActor(context: AuthContext): Promise<Actor> {
  const admin = await loadAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", context.userId)
    .maybeSingle();
  const organizationId = profile?.organization_id ?? null;
  if (!organizationId) {
    throw new Error("Colaborarea este disponibilă doar utilizatorilor unei agenții.");
  }
  const { data: org } = await admin
    .from("organizations")
    .select("collaboration_enabled")
    .eq("id", organizationId)
    .maybeSingle();
  return {
    userId: context.userId,
    organizationId,
    collaborationEnabled: org?.collaboration_enabled !== false,
  };
}

function requireParticipation(actor: Actor) {
  if (!actor.collaborationEnabled) {
    throw new Error(
      "Agenția ta nu participă la Colaborare Habitoo. Activează opțiunea din Setări → Agenție.",
    );
  }
}

/** Agențiile care participă la colaborare, fără agenția curentă. */
async function participatingOrgIds(
  actor: Actor,
): Promise<Map<string, { name: string; city: string | null }>> {
  const admin = await loadAdmin();
  const { data, error } = await admin
    .from("organizations")
    .select("id,name,city,status,archived_at,collaboration_enabled")
    .neq("id", actor.organizationId);
  if (error) throw error;
  const map = new Map<string, { name: string; city: string | null }>();
  for (const org of data ?? []) {
    if (org.collaboration_enabled === false) continue;
    if (org.archived_at) continue;
    if (org.status !== "active" && org.status !== "trial") continue;
    map.set(org.id, { name: org.name, city: org.city ?? null });
  }
  return map;
}

const filtersSchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    city: z.string().trim().max(80).optional(),
    propertyType: z.string().trim().max(40).optional(),
    transaction: z.enum(["all", "sale", "rent"]).optional(),
    priceMin: z.number().nonnegative().nullable().optional(),
    priceMax: z.number().nonnegative().nullable().optional(),
    roomsMin: z.number().int().min(0).max(30).nullable().optional(),
    surfaceMin: z.number().nonnegative().nullable().optional(),
    limit: z.number().int().min(1).max(120).optional(),
  })
  .default({});

export type CollaborationFilters = z.infer<typeof filtersSchema>;

/** Coloanele publicabile ale unei oferte de colaborare. Nimic confidențial. */
const OFFER_COLUMNS =
  "id,organization_id,reference,title,description,property_type,transaction_kind,status,price,currency,for_sale,for_rent,sale_price,rent_price,rooms,bathrooms,surface,usable_surface,land_surface,floor,build_year,city,county,district,features,utilities,collab_commission_percent,collab_terms,updated_at";

type OfferRow = {
  id: string;
  organization_id: string;
  reference: string | null;
  title: string;
  description: string | null;
  property_type: string;
  transaction_kind: string;
  status: string;
  price: number | null;
  currency: string;
  for_sale: boolean;
  for_rent: boolean;
  sale_price: number | null;
  rent_price: number | null;
  rooms: number | null;
  bathrooms: number | null;
  surface: number | null;
  usable_surface: number | null;
  land_surface: number | null;
  floor: number | null;
  build_year: number | null;
  city: string | null;
  county: string | null;
  district: string | null;
  features: string[] | null;
  utilities: string[] | null;
  collab_commission_percent: number | null;
  collab_terms: string | null;
  updated_at: string;
};

/** URL-uri semnate pentru fotografiile publicabile ale unor proprietăți. */
async function signedImages(
  propertyIds: string[],
  perProperty: number,
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (propertyIds.length === 0) return result;
  const admin = await loadAdmin();
  const { data } = await admin
    .from("property_images")
    .select("property_id,storage_path,position,is_primary")
    .in("property_id", propertyIds)
    .eq("is_confidential", false)
    .eq("include_in_publish", true)
    .order("position", { ascending: true });

  const grouped = new Map<string, string[]>();
  for (const row of data ?? []) {
    if (!row.storage_path) continue;
    const list = grouped.get(row.property_id) ?? [];
    if (row.is_primary) list.unshift(row.storage_path);
    else list.push(row.storage_path);
    grouped.set(row.property_id, list);
  }

  const paths: string[] = [];
  grouped.forEach((list) => paths.push(...list.slice(0, perProperty)));
  if (paths.length === 0) return result;

  const { data: signed } = await admin.storage.from(MEDIA_BUCKET).createSignedUrls(paths, 60 * 60);
  const byPath = new Map<string, string>();
  for (const item of signed ?? []) {
    if (item.path && item.signedUrl) byPath.set(item.path, item.signedUrl);
  }
  grouped.forEach((list, propertyId) => {
    const urls = list
      .slice(0, perProperty)
      .map((p) => byPath.get(p))
      .filter((u): u is string => Boolean(u));
    if (urls.length > 0) result.set(propertyId, urls);
  });
  return result;
}

function mapOffer(
  row: OfferRow,
  agency: { name: string; city: string | null },
  images: string[],
  myProposalCount: number,
): CollaborationOffer {
  return {
    id: row.id,
    agencyId: row.organization_id,
    reference: row.reference,
    title: row.title,
    description: row.description,
    propertyType: row.property_type,
    transactionKind: row.transaction_kind,
    status: row.status,
    price: row.price,
    currency: row.currency,
    forSale: Boolean(row.for_sale),
    forRent: Boolean(row.for_rent),
    salePrice: row.sale_price,
    rentPrice: row.rent_price,
    rooms: row.rooms,
    bathrooms: row.bathrooms,
    surface: row.surface,
    usableSurface: row.usable_surface,
    landSurface: row.land_surface,
    floor: row.floor,
    buildYear: row.build_year,
    city: row.city,
    county: row.county,
    district: row.district,
    features: row.features ?? [],
    utilities: row.utilities ?? [],
    collabCommissionPercent: row.collab_commission_percent,
    collabTerms: row.collab_terms,
    agencyName: agency.name,
    agencyCity: agency.city,
    updatedAt: row.updated_at,
    coverUrl: images[0] ?? null,
    images,
    myProposalCount,
  };
}

export const listCollaborationOffers = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => filtersSchema.parse(data ?? {}))
  .handler(async ({ context, data }): Promise<CollaborationOffer[]> => {
    const actor = await loadActor(context as AuthContext);
    requireParticipation(actor);
    const agencies = await participatingOrgIds(actor);
    if (agencies.size === 0) return [];

    const admin = await loadAdmin();
    let query = admin
      .from("properties")
      .select(OFFER_COLUMNS)
      .in("organization_id", [...agencies.keys()])
      .eq("collaboration", true)
      .is("deleted_at", null)
      .in("status", [...OFFERABLE_STATUSES])
      .order("updated_at", { ascending: false })
      .limit(data.limit ?? 60);

    if (data.city && data.city !== "all") query = query.eq("city", data.city);
    if (data.propertyType && data.propertyType !== "all") {
      query = query.eq("property_type", data.propertyType);
    }
    if (data.transaction === "sale") query = query.eq("for_sale", true);
    if (data.transaction === "rent") query = query.eq("for_rent", true);
    if (typeof data.priceMin === "number") query = query.gte("price", data.priceMin);
    if (typeof data.priceMax === "number") query = query.lte("price", data.priceMax);
    if (typeof data.roomsMin === "number") query = query.gte("rooms", data.roomsMin);
    if (typeof data.surfaceMin === "number") query = query.gte("surface", data.surfaceMin);
    if (data.q) {
      const term = data.q.replace(/[%,()]/g, " ").trim();
      if (term) {
        query = query.or(
          `title.ilike.%${term}%,city.ilike.%${term}%,district.ilike.%${term}%,reference.ilike.%${term}%`,
        );
      }
    }

    const { data: rows, error } = await query;
    if (error) throw error;
    const offers = (rows ?? []) as unknown as OfferRow[];
    const ids = offers.map((r) => r.id);

    const [images, mine] = await Promise.all([
      signedImages(ids, 1),
      ids.length > 0
        ? admin
            .from("collaboration_proposals")
            .select("property_id")
            .eq("requester_organization_id", actor.organizationId)
            .in("property_id", ids)
        : Promise.resolve({ data: [] as { property_id: string }[] }),
    ]);

    const counts = new Map<string, number>();
    for (const row of (mine.data ?? []) as { property_id: string }[]) {
      counts.set(row.property_id, (counts.get(row.property_id) ?? 0) + 1);
    }

    return offers.map((row) =>
      mapOffer(
        row,
        agencies.get(row.organization_id) ?? { name: "Agenție Habitoo", city: null },
        images.get(row.id) ?? [],
        counts.get(row.id) ?? 0,
      ),
    );
  });

export const getCollaborationOffer = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<CollaborationOffer | null> => {
    const actor = await loadActor(context as AuthContext);
    requireParticipation(actor);
    const agencies = await participatingOrgIds(actor);
    const admin = await loadAdmin();

    const { data: rows, error } = await admin
      .from("properties")
      .select(OFFER_COLUMNS)
      .eq("id", data.id)
      .eq("collaboration", true)
      .is("deleted_at", null)
      .in("status", [...OFFERABLE_STATUSES])
      .limit(1);
    if (error) throw error;
    const row = (rows ?? [])[0] as unknown as OfferRow | undefined;
    if (!row) return null;
    const agency = agencies.get(row.organization_id);
    if (!agency) return null;

    const images = await signedImages([row.id], 12);
    return mapOffer(row, agency, images.get(row.id) ?? [], 0);
  });

/** Orașele și tipurile disponibile în ofertele de colaborare, pentru filtre. */
export const getCollaborationFacets = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(
    async ({ context }): Promise<{ cities: string[]; types: string[]; participating: boolean }> => {
      const actor = await loadActor(context as AuthContext);
      if (!actor.collaborationEnabled) return { cities: [], types: [], participating: false };
      const agencies = await participatingOrgIds(actor);
      if (agencies.size === 0) return { cities: [], types: [], participating: true };
      const admin = await loadAdmin();
      const { data } = await admin
        .from("properties")
        .select("city,property_type")
        .in("organization_id", [...agencies.keys()])
        .eq("collaboration", true)
        .is("deleted_at", null)
        .in("status", [...OFFERABLE_STATUSES]);
      const cities = new Set<string>();
      const types = new Set<string>();
      for (const row of data ?? []) {
        if (row.city) cities.add(row.city);
        if (row.property_type) types.add(row.property_type);
      }
      return {
        cities: [...cities].sort((a, b) => a.localeCompare(b, "ro")),
        types: [...types].sort(),
        participating: true,
      };
    },
  );

export type CollaborationProposal = {
  id: string;
  propertyId: string;
  propertyTitle: string;
  propertyCity: string | null;
  propertyPrice: number | null;
  propertyCurrency: string;
  collabCommissionPercent: number | null;
  status: CollaborationProposalStatus;
  clientLabel: string;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  ownerAgencyName: string;
  requesterAgencyName: string;
  requesterAgentName: string | null;
  /** Perspectiva utilizatorului curent: propunere trimisă sau primită. */
  direction: "outgoing" | "incoming";
  messageCount: number;
  coverUrl: string | null;
};

type ProposalRow = {
  id: string;
  property_id: string;
  owner_organization_id: string;
  requester_organization_id: string;
  requester_user_id: string;
  client_label: string;
  message: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

async function mapProposals(actor: Actor, rows: ProposalRow[]): Promise<CollaborationProposal[]> {
  if (rows.length === 0) return [];
  const admin = await loadAdmin();
  const propertyIds = [...new Set(rows.map((r) => r.property_id))];
  const orgIds = [
    ...new Set(rows.flatMap((r) => [r.owner_organization_id, r.requester_organization_id])),
  ];
  const userIds = [...new Set(rows.map((r) => r.requester_user_id))];

  const [properties, orgs, profiles, images, messages] = await Promise.all([
    admin
      .from("properties")
      .select("id,title,city,price,currency,collab_commission_percent")
      .in("id", propertyIds),
    admin.from("organizations").select("id,name").in("id", orgIds),
    admin.from("profiles").select("id,full_name").in("id", userIds),
    signedImages(propertyIds, 1),
    admin
      .from("collaboration_messages")
      .select("proposal_id")
      .in(
        "proposal_id",
        rows.map((r) => r.id),
      ),
  ]);

  const propertyById = new Map((properties.data ?? []).map((p) => [p.id, p]));
  const orgById = new Map((orgs.data ?? []).map((o) => [o.id, o.name]));
  const nameById = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
  const msgCount = new Map<string, number>();
  for (const m of (messages.data ?? []) as { proposal_id: string }[]) {
    msgCount.set(m.proposal_id, (msgCount.get(m.proposal_id) ?? 0) + 1);
  }

  return rows.map((row) => {
    const property = propertyById.get(row.property_id);
    return {
      id: row.id,
      propertyId: row.property_id,
      propertyTitle: property?.title ?? "Proprietate indisponibilă",
      propertyCity: property?.city ?? null,
      propertyPrice: property?.price ?? null,
      propertyCurrency: property?.currency ?? "EUR",
      collabCommissionPercent: property?.collab_commission_percent ?? null,
      status: row.status as CollaborationProposalStatus,
      clientLabel: row.client_label,
      message: row.message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ownerAgencyName: orgById.get(row.owner_organization_id) ?? "Agenție Habitoo",
      requesterAgencyName: orgById.get(row.requester_organization_id) ?? "Agenție Habitoo",
      requesterAgentName: nameById.get(row.requester_user_id) ?? null,
      direction: row.owner_organization_id === actor.organizationId ? "incoming" : "outgoing",
      messageCount: msgCount.get(row.id) ?? 0,
      coverUrl: images.get(row.property_id)?.[0] ?? null,
    };
  });
}

export const listCollaborationProposals = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(
    async ({
      context,
    }): Promise<{ outgoing: CollaborationProposal[]; incoming: CollaborationProposal[] }> => {
      const actor = await loadActor(context as AuthContext);
      const admin = await loadAdmin();
      const { data, error } = await admin
        .from("collaboration_proposals")
        .select("*")
        .or(
          `owner_organization_id.eq.${actor.organizationId},requester_organization_id.eq.${actor.organizationId}`,
        )
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const mapped = await mapProposals(actor, (data ?? []) as ProposalRow[]);
      return {
        outgoing: mapped.filter((p) => p.direction === "outgoing"),
        incoming: mapped.filter((p) => p.direction === "incoming"),
      };
    },
  );

async function auditAndNotify(params: {
  organizationId: string;
  actorId: string;
  action: string;
  entityId: string;
  values?: Record<string, unknown>;
  notifyOrganizationId?: string;
  notifyUserIds?: string[];
  notification?: { type: string; title: string; body: string; link: string };
}) {
  const admin = await loadAdmin();
  try {
    await admin.from("audit_logs").insert({
      organization_id: params.organizationId,
      actor_id: params.actorId,
      action: params.action,
      entity: "collaboration_proposal",
      entity_id: params.entityId,
      new_values: (params.values ?? null) as never,
    } as never);
  } catch {
    /* audit best-effort */
  }
  if (params.notification && (params.notifyUserIds ?? []).length > 0) {
    try {
      await admin.from("notifications").insert(
        (params.notifyUserIds ?? []).map((userId) => ({
          organization_id: params.notifyOrganizationId ?? null,
          user_id: userId,
          type: params.notification!.type,
          title: params.notification!.title,
          body: params.notification!.body,
          link: params.notification!.link,
        })) as never,
      );
    } catch {
      /* notificările nu blochează fluxul */
    }
  }
}

/** Cine trebuie anunțat în agenția care deține mandatul: agentul asignat + adminii. */
async function ownerRecipients(
  organizationId: string,
  assignedTo: string | null,
): Promise<string[]> {
  const admin = await loadAdmin();
  const { data: roles } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("role", "agency_admin");
  const ids = new Set<string>((roles ?? []).map((r) => r.user_id));
  if (assignedTo) ids.add(assignedTo);
  return [...ids];
}

export const createCollaborationProposal = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        propertyId: z.string().uuid(),
        contactId: z.string().uuid().nullable().optional(),
        leadId: z.string().uuid().nullable().optional(),
        clientLabel: z.string().trim().min(2).max(160),
        message: z.string().trim().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    const actor = await loadActor(context as AuthContext);
    requireParticipation(actor);
    const agencies = await participatingOrgIds(actor);
    const admin = await loadAdmin();

    const { data: property, error } = await admin
      .from("properties")
      .select("id,organization_id,title,collaboration,status,deleted_at,assigned_to")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (error) throw error;
    if (
      !property ||
      property.collaboration !== true ||
      property.deleted_at ||
      !OFFERABLE_STATUSES.includes(property.status as (typeof OFFERABLE_STATUSES)[number]) ||
      !agencies.has(property.organization_id)
    ) {
      throw new Error("Proprietatea nu este disponibilă pentru colaborare.");
    }

    // Clientul propus trebuie să fie al agenției solicitante.
    if (data.contactId) {
      const { data: contact } = await admin
        .from("contacts")
        .select("id,organization_id")
        .eq("id", data.contactId)
        .maybeSingle();
      if (!contact || contact.organization_id !== actor.organizationId) {
        throw new Error("Contactul selectat nu aparține agenției tale.");
      }
    }
    if (data.leadId) {
      const { data: lead } = await admin
        .from("leads")
        .select("id,organization_id")
        .eq("id", data.leadId)
        .maybeSingle();
      if (!lead || lead.organization_id !== actor.organizationId) {
        throw new Error("Lead-ul selectat nu aparține agenției tale.");
      }
    }

    const { data: inserted, error: insertError } = await admin
      .from("collaboration_proposals")
      .insert({
        property_id: property.id,
        owner_organization_id: property.organization_id,
        requester_organization_id: actor.organizationId,
        requester_user_id: actor.userId,
        contact_id: data.contactId ?? null,
        lead_id: data.leadId ?? null,
        client_label: data.clientLabel,
        message: data.message?.trim() || null,
      } as never)
      .select("id")
      .single();
    if (insertError) throw insertError;

    const [{ data: requesterOrg }, recipients] = await Promise.all([
      admin.from("organizations").select("name").eq("id", actor.organizationId).maybeSingle(),
      ownerRecipients(property.organization_id, property.assigned_to ?? null),
    ]);

    await auditAndNotify({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "collaboration_proposal_created",
      entityId: inserted.id,
      values: { propertyId: property.id, ownerOrganizationId: property.organization_id },
      notifyOrganizationId: property.organization_id,
      notifyUserIds: recipients,
      notification: {
        type: "collaboration_proposal",
        title: "Propunere de colaborare primită",
        body: `${requesterOrg?.name ?? "O agenție Habitoo"} propune un client pentru „${property.title}”.`,
        link: "/app/collaboration",
      },
    });

    return { id: inserted.id };
  });

export type CollaborationThreadMessage = {
  id: string;
  body: string;
  createdAt: string;
  senderName: string | null;
  agencyName: string;
  mine: boolean;
};

export type CollaborationProposalDetail = CollaborationProposal & {
  messages: CollaborationThreadMessage[];
  canChangeStatus: boolean;
  clientContactId: string | null;
  clientLeadId: string | null;
};

async function loadProposal(
  actor: Actor,
  id: string,
): Promise<ProposalRow & { contact_id: string | null; lead_id: string | null }> {
  const admin = await loadAdmin();
  const { data, error } = await admin
    .from("collaboration_proposals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (
    !data ||
    (data.owner_organization_id !== actor.organizationId &&
      data.requester_organization_id !== actor.organizationId)
  ) {
    throw new Error("Propunerea nu există sau nu îți este accesibilă.");
  }
  return data as ProposalRow & { contact_id: string | null; lead_id: string | null };
}

export const getCollaborationProposal = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<CollaborationProposalDetail> => {
    const actor = await loadActor(context as AuthContext);
    const row = await loadProposal(actor, data.id);
    const admin = await loadAdmin();

    const [base] = await mapProposals(actor, [row]);
    const { data: messages } = await admin
      .from("collaboration_messages")
      .select("id,body,created_at,sender_id,sender_organization_id")
      .eq("proposal_id", row.id)
      .order("created_at", { ascending: true });

    const senderIds = [...new Set((messages ?? []).map((m) => m.sender_id))];
    const orgIds = [...new Set((messages ?? []).map((m) => m.sender_organization_id))];
    const [profiles, orgs] = await Promise.all([
      senderIds.length
        ? admin.from("profiles").select("id,full_name").in("id", senderIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      orgIds.length
        ? admin.from("organizations").select("id,name").in("id", orgIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const nameById = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
    const orgById = new Map((orgs.data ?? []).map((o) => [o.id, o.name]));

    return {
      ...base!,
      clientContactId: row.contact_id,
      clientLeadId: row.lead_id,
      canChangeStatus: true,
      messages: (messages ?? []).map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.created_at,
        senderName: nameById.get(m.sender_id) ?? null,
        agencyName: orgById.get(m.sender_organization_id) ?? "Agenție Habitoo",
        mine: m.sender_id === actor.userId,
      })),
    };
  });

export const postCollaborationMessage = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), body: z.string().trim().min(1).max(4000) }).parse(data),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const actor = await loadActor(context as AuthContext);
    const row = await loadProposal(actor, data.id);
    const admin = await loadAdmin();

    const { error } = await admin.from("collaboration_messages").insert({
      proposal_id: row.id,
      sender_id: actor.userId,
      sender_organization_id: actor.organizationId,
      body: data.body,
    } as never);
    if (error) throw error;
    await admin
      .from("collaboration_proposals")
      .update({ updated_at: new Date().toISOString() } as never)
      .eq("id", row.id);

    const otherOrg =
      row.owner_organization_id === actor.organizationId
        ? row.requester_organization_id
        : row.owner_organization_id;
    const recipients =
      otherOrg === row.requester_organization_id
        ? [row.requester_user_id]
        : await ownerRecipients(otherOrg, null);

    await auditAndNotify({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "collaboration_message_sent",
      entityId: row.id,
      notifyOrganizationId: otherOrg,
      notifyUserIds: recipients,
      notification: {
        type: "collaboration_message",
        title: "Mesaj nou pe o colaborare",
        body: data.body.slice(0, 140),
        link: "/app/collaboration",
      },
    });
    return { ok: true };
  });

export const setCollaborationProposalStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "accepted", "viewing", "declined", "closed"]),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const actor = await loadActor(context as AuthContext);
    const row = await loadProposal(actor, data.id);
    const admin = await loadAdmin();

    const { error } = await admin
      .from("collaboration_proposals")
      .update({ status: data.status } as never)
      .eq("id", row.id);
    if (error) throw error;

    const otherOrg =
      row.owner_organization_id === actor.organizationId
        ? row.requester_organization_id
        : row.owner_organization_id;
    const recipients =
      otherOrg === row.requester_organization_id
        ? [row.requester_user_id]
        : await ownerRecipients(otherOrg, null);

    await auditAndNotify({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "collaboration_proposal_status_changed",
      entityId: row.id,
      values: { from: row.status, to: data.status },
      notifyOrganizationId: otherOrg,
      notifyUserIds: recipients,
      notification: {
        type: "collaboration_status",
        title: "Status colaborare actualizat",
        body: `Propunerea este acum: ${COLLAB_STATUS_LABELS[data.status]}.`,
        link: "/app/collaboration",
      },
    });
    return { ok: true };
  });

/* ========================================================================
 * COLABORAREA CA „PORTAL" ÎN FILA PUBLICARE A PROPRIETĂȚII
 * Sursa de adevăr rămâne pe `properties`: `collaboration`,
 * `collab_commission_percent`, `collab_terms`. Nicio coloană nouă.
 * ====================================================================== */

export type PropertyCollaborationRow = {
  /** Agenția participă la Colaborare Habitoo (comutatorul global din Setări). */
  participating: boolean;
  enabled: boolean;
  commissionPercent: number | null;
  terms: string | null;
  /** Statusul proprietății permite expunerea către alte agenții. */
  offerable: boolean;
};

async function loadOwnProperty(actor: Actor, propertyId: string) {
  const admin = await loadAdmin();
  const { data: property, error } = await admin
    .from("properties")
    .select(
      "id,organization_id,assigned_to,status,deleted_at,collaboration,collab_commission_percent,collab_terms",
    )
    .eq("id", propertyId)
    .maybeSingle();
  if (error) throw error;
  if (!property || property.organization_id !== actor.organizationId || property.deleted_at) {
    throw new Error("Proprietatea nu este disponibilă.");
  }
  return property;
}

export const getPropertyCollaboration = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ propertyId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<PropertyCollaborationRow> => {
    const actor = await loadActor(context as AuthContext);
    const property = await loadOwnProperty(actor, data.propertyId);
    return {
      participating: actor.collaborationEnabled,
      enabled: property.collaboration === true,
      commissionPercent: property.collab_commission_percent ?? null,
      terms: property.collab_terms ?? null,
      offerable: OFFERABLE_STATUSES.includes(
        property.status as (typeof OFFERABLE_STATUSES)[number],
      ),
    };
  });

export const setPropertyCollaboration = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        propertyId: z.string().uuid(),
        enabled: z.boolean(),
        commissionPercent: z.number().min(0).max(100).nullable().optional(),
        terms: z.string().trim().max(2000).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<{ ok: true; enabled: boolean }> => {
    const actor = await loadActor(context as AuthContext);
    requireParticipation(actor);
    await loadOwnProperty(actor, data.propertyId);

    if (data.enabled && (data.commissionPercent === null || data.commissionPercent === undefined)) {
      throw new Error("Completează comisionul oferit pentru colaborare.");
    }

    const admin = await loadAdmin();
    const { error } = await admin
      .from("properties")
      .update({
        collaboration: data.enabled,
        collab_commission_percent: data.enabled ? (data.commissionPercent ?? null) : null,
        collab_terms: data.enabled ? (data.terms ?? null) : null,
        updated_by: actor.userId,
      })
      .eq("id", data.propertyId)
      .eq("organization_id", actor.organizationId);
    if (error) throw error;
    return { ok: true, enabled: data.enabled };
  });
