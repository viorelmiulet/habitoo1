import {
  PORTAL_LOGS_PAGE_SIZE,
  logSummary,
  maskSecrets,
  periodStart,
  type PortalLogsFilter,
} from "@/lib/portals/operation-logs";

export type PortalLogRow = {
  id: string;
  createdAt: string;
  organizationId: string | null;
  organizationName: string | null;
  portal: string;
  operation: string;
  propertyId: string | null;
  propertyReference: string | null;
  success: boolean;
  summary: string;
  httpStatus: number | null;
  durationMs: number | null;
  externalId: string | null;
  environment: string | null;
  errorCode: string | null;
  portalResponse: unknown;
};

export type PortalLogsPage = {
  rows: PortalLogRow[];
  total: number;
  page: number;
  pageSize: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Citire DOAR: jurnalul pentru toate agențiile, cu filtre și paginare. */
export async function queryPortalLogs(
  admin: Db,
  filter: PortalLogsFilter,
  now: Date = new Date(),
): Promise<PortalLogsPage> {
  const page = filter.page ?? 1;
  const from = (page - 1) * PORTAL_LOGS_PAGE_SIZE;

  let propertyIds: string[] | null = null;
  if (filter.reference) {
    const safe = filter.reference.replace(/[%_,()]/g, "");
    const { data: props } = await admin
      .from("properties")
      .select("id")
      .ilike("reference", `%${safe}%`)
      .limit(200);
    propertyIds = (props ?? []).map((p: { id: string }) => p.id);
    if (propertyIds.length === 0) return { rows: [], total: 0, page, pageSize: PORTAL_LOGS_PAGE_SIZE };
  }

  let q = admin
    .from("portal_operation_logs")
    .select(
      "id, organization_id, portal, operation, success, error_code, error_message, property_id, created_at, environment, external_id, http_status, duration_ms, portal_response",
      { count: "exact" },
    );
  if (filter.organizationId) q = q.eq("organization_id", filter.organizationId);
  if (filter.portal) q = q.eq("portal", filter.portal);
  if (filter.operation) q = q.eq("operation", filter.operation);
  if (filter.status) q = q.eq("success", filter.status === "success");
  if (filter.period) q = q.gte("created_at", periodStart(filter.period, now));
  if (propertyIds) q = q.in("property_id", propertyIds);
  const { data: rows, count, error } = await q
    .order("created_at", { ascending: false })
    .range(from, from + PORTAL_LOGS_PAGE_SIZE - 1);
  if (error) throw new Error("Jurnalul nu a putut fi încărcat.");

  const list = (rows ?? []) as Array<Record<string, unknown>>;
  const orgIds = [...new Set(list.map((r) => r.organization_id).filter(Boolean))] as string[];
  const propIds = [...new Set(list.map((r) => r.property_id).filter(Boolean))] as string[];
  const [orgs, props] = await Promise.all([
    orgIds.length
      ? admin.from("organizations").select("id, name").in("id", orgIds)
      : Promise.resolve({ data: [] }),
    propIds.length
      ? admin.from("properties").select("id, reference").in("id", propIds)
      : Promise.resolve({ data: [] }),
  ]);
  const orgName = new Map<string, string>(
    (orgs.data ?? []).map((o: { id: string; name: string }) => [o.id, o.name]),
  );
  const propRef = new Map<string, string>(
    (props.data ?? []).map((p: { id: string; reference: string }) => [p.id, p.reference]),
  );

  return {
    page,
    pageSize: PORTAL_LOGS_PAGE_SIZE,
    total: count ?? list.length,
    rows: list.map((r) => ({
      id: r.id as string,
      createdAt: r.created_at as string,
      organizationId: (r.organization_id as string) ?? null,
      organizationName: orgName.get(r.organization_id as string) ?? null,
      portal: r.portal as string,
      operation: r.operation as string,
      propertyId: (r.property_id as string) ?? null,
      propertyReference: propRef.get(r.property_id as string) ?? null,
      success: r.success === true,
      summary: logSummary({
        success: r.success === true,
        error_message: (r.error_message as string) ?? null,
        error_code: (r.error_code as string) ?? null,
        http_status: (r.http_status as number) ?? null,
        external_id: (r.external_id as string) ?? null,
      }),
      httpStatus: (r.http_status as number) ?? null,
      durationMs: (r.duration_ms as number) ?? null,
      externalId: (r.external_id as string) ?? null,
      environment: (r.environment as string) ?? null,
      errorCode: (r.error_code as string) ?? null,
      portalResponse: maskSecrets(r.portal_response ?? null),
    })),
  };
}

/** Lista distinctă de acțiuni (operation) din ultimele înregistrări, pentru filtru. */
export async function listPortalLogOperations(admin: Db): Promise<string[]> {
  const { data } = await admin
    .from("portal_operation_logs")
    .select("operation")
    .order("created_at", { ascending: false })
    .limit(1000);
  return [...new Set((data ?? []).map((r: { operation: string }) => r.operation))].sort() as string[];
}
