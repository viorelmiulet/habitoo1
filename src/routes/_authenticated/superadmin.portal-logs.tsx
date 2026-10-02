/**
 * Superadmin → Jurnal portaluri: operațiile cu portalurile pentru toate
 * agențiile. Doar citire; secretele din răspunsuri sunt mascate pe server.
 */
import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { EmptyState } from "@/components/app/EmptyState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { appHead } from "@/components/app/app-head";
import { formatDateTime } from "@/lib/format";
import { getPortalOperationLogs } from "@/lib/portal-logs.functions";
import { listPortalOrganizations } from "@/lib/portals.functions";
import { PORTALS, portalDisplayName } from "@/lib/portals/registry";

type Search = {
  page?: number;
  org?: string;
  portal?: string;
  operation?: string;
  status?: "success" | "error";
  period?: "today" | "7d" | "30d";
  ref?: string;
};

const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);

export const Route = createFileRoute("/_authenticated/superadmin/portal-logs")({
  head: () => appHead("Habitoo CRM — jurnal portaluri"),
  validateSearch: (s: Record<string, unknown>): Search => {
    const page = Number(s.page);
    const status = str(s.status);
    const period = str(s.period);
    return {
      ...(Number.isInteger(page) && page > 1 ? { page } : {}),
      ...(str(s.org) ? { org: str(s.org) } : {}),
      ...(str(s.portal) ? { portal: str(s.portal) } : {}),
      ...(str(s.operation) ? { operation: str(s.operation) } : {}),
      ...(status === "success" || status === "error" ? { status } : {}),
      ...(period === "today" || period === "7d" || period === "30d" ? { period } : {}),
      ...(str(s.ref) ? { ref: str(s.ref) } : {}),
    };
  },
  component: PortalLogsPage,
});

const ALL = "__all";

function PortalLogsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const loadLogs = useServerFn(getPortalOperationLogs);
  const loadOrgs = useServerFn(listPortalOrganizations);
  const [refDraft, setRefDraft] = useState(search.ref ?? "");
  const [openId, setOpenId] = useState<string | null>(null);

  const set = (patch: Partial<Search>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch, page: undefined }) });

  const orgs = useQuery({ queryKey: ["portal-organizations"], queryFn: () => loadOrgs({}) });
  const logs = useQuery({
    queryKey: ["superadmin", "portal-logs", search],
    placeholderData: keepPreviousData,
    queryFn: () =>
      loadLogs({
        data: {
          page: search.page ?? 1,
          organizationId: search.org,
          portal: search.portal,
          operation: search.operation,
          status: search.status,
          period: search.period,
          reference: search.ref,
        },
      }),
  });

  const page = search.page ?? 1;
  const total = logs.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 50));
  const open = logs.data?.rows.find((r) => r.id === openId) ?? null;

  const filterSelect = (
    label: string,
    value: string | undefined,
    onChange: (v: string | undefined) => void,
    options: { value: string; label: string }[],
  ) => (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger aria-label={label} className="h-10">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}: toate</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jurnal portaluri"
        description="Operațiile cu portalurile imobiliare, pentru toate agențiile. Doar citire."
      />

      <div className="panel grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {filterSelect("Agenție", search.org, (v) => set({ org: v }),
          (orgs.data ?? []).map((o) => ({ value: o.id, label: o.name })))}
        {filterSelect("Portal", search.portal, (v) => set({ portal: v }),
          PORTALS.map((p) => ({ value: p.id, label: portalDisplayName(p.id) })))}
        {filterSelect("Acțiune", search.operation, (v) => set({ operation: v }),
          (logs.data?.operations ?? []).map((o) => ({ value: o, label: o })))}
        {filterSelect("Stare", search.status, (v) => set({ status: v as Search["status"] }), [
          { value: "success", label: "Reușit" },
          { value: "error", label: "Eroare" },
        ])}
        {filterSelect("Perioadă", search.period, (v) => set({ period: v as Search["period"] }), [
          { value: "today", label: "Azi" },
          { value: "7d", label: "Ultimele 7 zile" },
          { value: "30d", label: "Ultimele 30 de zile" },
        ])}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            set({ ref: refDraft.trim() || undefined });
          }}
        >
          <Input
            aria-label="Referința anunțului"
            placeholder="Referință anunț (Enter)"
            value={refDraft}
            onChange={(e) => setRefDraft(e.target.value)}
            className="h-10"
          />
        </form>
      </div>

      <div className="panel overflow-hidden">
        {logs.isLoading ? (
          <div className="p-5"><InlineLoading label="Se încarcă jurnalul…" /></div>
        ) : logs.isError ? (
          <div className="p-5"><QueryError error={logs.error} onRetry={() => logs.refetch()} /></div>
        ) : (logs.data?.rows.length ?? 0) === 0 ? (
          <EmptyState icon={ScrollText} title="Nicio operațiune" description="Nu există înregistrări pentru filtrele alese." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-2.5">Data</th>
                  <th className="px-4 py-2.5">Agenția</th>
                  <th className="px-4 py-2.5">Portalul</th>
                  <th className="px-4 py-2.5">Acțiunea</th>
                  <th className="px-4 py-2.5">Anunțul</th>
                  <th className="px-4 py-2.5">Stare</th>
                  <th className="px-4 py-2.5">Detalii</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.data!.rows.map((r) => (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    onClick={() => setOpenId(r.id)}
                    onKeyDown={(e) => e.key === "Enter" && setOpenId(r.id)}
                    className="cursor-pointer hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                    <td className="px-4 py-2.5">{r.organizationName ?? "—"}</td>
                    <td className="px-4 py-2.5">{portalDisplayName(r.portal)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{r.operation}</td>
                    <td className="px-4 py-2.5">{r.propertyReference ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge tone={r.success ? "success" : "danger"} dot>
                        {r.success ? "Reușit" : "Eroare"}
                      </StatusBadge>
                    </td>
                    <td className="max-w-[320px] truncate px-4 py-2.5 text-muted-foreground">{r.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
          <span className="text-muted-foreground">{total} înregistrări · pagina {page} din {pages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1}
              onClick={() => navigate({ search: (p) => ({ ...p, page: page - 1 > 1 ? page - 1 : undefined }) })}>
              Înapoi
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages}
              onClick={() => navigate({ search: (p) => ({ ...p, page: page + 1 }) })}>
              Înainte
            </Button>
          </div>
        </div>
      </div>

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {open ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  {portalDisplayName(open.portal)} · {open.operation}
                </SheetTitle>
              </SheetHeader>
              <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 px-4 text-sm">
                <dt className="text-muted-foreground">Data</dt><dd>{formatDateTime(open.createdAt)}</dd>
                <dt className="text-muted-foreground">Agenția</dt><dd>{open.organizationName ?? "—"}</dd>
                <dt className="text-muted-foreground">Anunțul</dt><dd>{open.propertyReference ?? "—"}</dd>
                <dt className="text-muted-foreground">Stare</dt><dd>{open.success ? "Reușit" : `Eroare${open.errorCode ? ` (${open.errorCode})` : ""}`}</dd>
                <dt className="text-muted-foreground">HTTP</dt><dd>{open.httpStatus ?? "—"}</dd>
                <dt className="text-muted-foreground">Durată</dt><dd>{open.durationMs != null ? `${open.durationMs} ms` : "—"}</dd>
                <dt className="text-muted-foreground">ID extern</dt><dd className="break-all">{open.externalId ?? "—"}</dd>
                <dt className="text-muted-foreground">Mediu</dt><dd>{open.environment ?? "—"}</dd>
                <dt className="text-muted-foreground">Detalii</dt><dd className="break-words">{open.summary}</dd>
              </dl>
              <div className="mt-4 px-4 pb-6">
                <p className="mb-2 text-sm font-medium">Răspunsul portalului</p>
                <pre className="max-h-[50vh] overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs">
                  {open.portalResponse === "null"
                    ? "—"
                    : JSON.stringify(JSON.parse(open.portalResponse), null, 2)}
                </pre>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
