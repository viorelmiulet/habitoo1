/**
 * Încarcă cererile active pe server și întoarce DOAR numere.
 * Cererile altor agenții (doar cele cu colaborarea activă) nu ies niciodată din
 * această funcție ca rânduri: nu se returnează nume, buget, contact sau agenție.
 */
import { SOCIAL_REQUESTS_RETENTION_DAYS } from "../../social-requests";
import {
  countDemand,
  demandFromCrmRequest,
  demandFromSocialRequest,
  type AcpReportDemand,
  type DemandProperty,
  type DemandSource,
  type DemandRequest,
} from "./demand";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
const PAGE = 1000;
const CRM_COLUMNS = "id,organization_id,kind,property_type,rooms_min,rooms_max,surface_min,budget_min,budget_max,currency,cities,areas";

async function pages<T>(run: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

export async function loadReportDemand(
  admin: Admin,
  organizationId: string,
  property: DemandProperty,
  now: Date = new Date(),
): Promise<AcpReportDemand> {
  const asOf = now.toISOString();
  const kinds = property.transaction === "rent" ? ["rent"] : property.transaction === "sale" ? ["buy", "invest"] : ["buy", "invest", "rent"];

  const { data: partners, error: pErr } = await admin
    .from("organizations")
    .select("id")
    .eq("collaboration_enabled", true)
    .neq("id", organizationId);
  if (pErr) throw pErr;
  const partnerIds = ((partners ?? []) as { id: string }[]).map((o) => o.id);

  const crm = (orgs: string[]) =>
    orgs.length
      ? pages((from, to) =>
          admin.from("requests").select(CRM_COLUMNS).eq("status", "active").in("kind", kinds).in("organization_id", orgs).order("id").range(from, to),
        )
      : Promise.resolve([]);
  const since = new Date(now.getTime() - SOCIAL_REQUESTS_RETENTION_DAYS * 86_400_000).toISOString();
  const [own, network, social] = await Promise.all([
    crm([organizationId]),
    crm(partnerIds),
    pages((from, to) =>
      admin
        .from("social_requests")
        .select("id,transaction_type,property_type,rooms,budget_min,budget_max,currency,county,city,zones,publisher_type")
        .gte("first_seen_at", since)
        .or("publisher_type.is.null,publisher_type.neq.agentie")
        .order("id")
        .range(from, to),
    ),
  ]);

  const items: { id: string; source: DemandSource; request: DemandRequest }[] = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(own as any[]).map((r) => ({ id: r.id, source: "own" as const, request: demandFromCrmRequest(r) })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(network as any[]).map((r) => ({ id: r.id, source: "network" as const, request: demandFromCrmRequest(r) })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(social as any[]).map((r) => ({ id: r.id, source: "facebook" as const, request: demandFromSocialRequest(r) })),
  ];
  return countDemand(property, items, asOf);
}

/** Proprietatea din snapshot; prețul cerut sau, dacă lipsește, valoarea optimă estimată. */
export function demandPropertyFromSnapshot(
  subject: Record<string, unknown>,
  estimatedValue: number | null | undefined,
  extra: { title?: string | null; locationLabel?: string | null } = {},
): DemandProperty {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const tx = str(subject.transactionKind) ?? str(subject.transactionType);
  return {
    transaction: tx === "rent" ? "rent" : tx === "sale" ? "sale" : null,
    propertyType: str(subject.propertyType),
    rooms: num(subject.rooms),
    usableArea: num(subject.usableArea),
    price: num(subject.price) ?? num(estimatedValue),
    currency: str(subject.currency) ?? "EUR",
    county: str(subject.county),
    city: str(subject.city),
    district: str(subject.district) ?? str(subject.neighborhood),
    title: extra.title ?? null,
    address: extra.locationLabel ?? null,
  };
}
