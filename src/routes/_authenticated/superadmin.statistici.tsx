import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Download, Search, X } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/LoadingState";
import { SummaryCard } from "@/components/superadmin/SuperadminUi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { appHead } from "@/components/app/app-head";
import { formatDate, formatDateTime } from "@/lib/format";
import { planLabel, seatLimitLabel } from "@/lib/plans";
import { getPortalDefinition } from "@/lib/portals/registry";
import { toCsv } from "@/lib/superadmin-stats";
import {
  getAgencyAgentStats, getAgencyStats, type AgencyStatsRow,
} from "@/lib/superadmin-stats.functions";

export const Route = createFileRoute("/_authenticated/superadmin/statistici")({
  head: () => appHead("Habitoo CRM — statistici agenții"),
  component: StatsPage,
});

const STATUS: Record<string, string> = {
  active: "activ", draft: "ciornă", reserved: "rezervat", negotiation: "negociere", sold: "vândut",
  rented: "închiriat", expired: "expirat", archived: "arhivat",
};
const ORG_STATUS: Record<string, string> = {
  active: "Activă", trial: "Trial", suspended: "Suspendată", pending_approval: "În așteptare", cancelled: "Anulată",
};
const portalName = (k: string) => getPortalDefinition(k)?.name ?? k;

type Col = { key: string; label: string; num?: (r: AgencyStatsRow) => number; cell: (r: AgencyStatsRow) => React.ReactNode; csv: (r: AgencyStatsRow) => string | number };
const COLS: Col[] = [
  { key: "listings", label: "Anunțuri act./total", num: (r) => r.listings_active,
    cell: (r) => <span title={Object.entries(r.listings_by_status).map(([s, n]) => `${STATUS[s] ?? s}: ${n}`).join("\n") || "fără anunțuri"}>{r.listings_active} / {r.listings_total}</span>,
    csv: (r) => `${r.listings_active}/${r.listings_total}` },
  { key: "pub", label: "Publicate", num: (r) => r.listings_published, cell: (r) => r.listings_published, csv: (r) => r.listings_published },
  { key: "err", label: "Cu erori", num: (r) => r.listings_with_errors, cell: (r) => <span className={r.listings_with_errors ? "text-destructive" : ""}>{r.listings_with_errors}</span>, csv: (r) => r.listings_with_errors },
  { key: "add", label: "Adăugate 30z", num: (r) => r.listings_added_30d, cell: (r) => r.listings_added_30d, csv: (r) => r.listings_added_30d },
  { key: "users", label: "Agenți / locuri", num: (r) => r.users_active, cell: (r) => `${r.users_active}/${seatLimitLabel(r.max_users)}`, csv: (r) => `${r.users_active}/${seatLimitLabel(r.max_users)}` },
  { key: "ln", label: "Lead-uri noi 30z", num: (r) => r.leads_new_30d, cell: (r) => r.leads_new_30d, csv: (r) => r.leads_new_30d },
  { key: "lo", label: "Lead-uri deschise", num: (r) => r.leads_open, cell: (r) => r.leads_open, csv: (r) => r.leads_open },
  { key: "req", label: "Cereri active", num: (r) => r.requests_active, cell: (r) => r.requests_active, csv: (r) => r.requests_active },
  { key: "ct", label: "Contacte", num: (r) => r.contacts, cell: (r) => r.contacts, csv: (r) => r.contacts },
  { key: "por", label: "Portaluri", num: (r) => r.portals.length, cell: (r) => <span title={r.portals.map(portalName).join("\n") || "niciunul"}>{r.portals.length}</span>, csv: (r) => r.portals.map(portalName).join("; ") },
  { key: "last", label: "Ultima activitate", num: (r) => (r.last_activity_at ? Date.parse(r.last_activity_at) : 0), cell: (r) => (r.last_activity_at ? formatDateTime(r.last_activity_at) : "—"), csv: (r) => r.last_activity_at ?? "" },
  { key: "plan", label: "Plan · stare", cell: (r) => <span>{planLabel(r.plan)} · {r.is_trial && r.status === "active" ? "Trial" : ORG_STATUS[r.status] ?? r.status}{r.subscription_expires_at ? ` · exp. ${formatDate(r.subscription_expires_at)}` : ""}</span>, csv: (r) => `${planLabel(r.plan)} ${ORG_STATUS[r.status] ?? r.status} ${r.subscription_expires_at ?? ""}` },
  { key: "catch", label: "Habitoo Catch (30z)", num: (r) => r.catch_imports_30d, cell: (r) => `${r.catch_enabled ? "da" : "nu"} · ${r.catch_imports_30d}`, csv: (r) => `${r.catch_enabled ? "da" : "nu"} ${r.catch_imports_30d}` },
  { key: "ai", label: "AI · credite lună", num: (r) => r.ai_credits_month, cell: (r) => `${r.ai_enabled === false ? "oprit" : "pornit"} · ${r.ai_credits_month}`, csv: (r) => `${r.ai_enabled === false ? "oprit" : "pornit"} ${r.ai_credits_month}` },
];

function StatsPage() {
  const fetchStats = useServerFn(getAgencyStats);
  const [includeDemo, setIncludeDemo] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "listings", dir: -1 });
  const [openOrg, setOpenOrg] = useState<AgencyStatsRow | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["superadmin-stats", includeDemo],
    queryFn: () => fetchStats({ data: { includeDemo } }),
  });

  const rows = useMemo(() => {
    const list = (data?.agencies ?? []).filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()));
    const col = COLS.find((c) => c.key === sort.key);
    if (sort.key === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name, "ro") * sort.dir);
    if (!col?.num) return list;
    return [...list].sort((a, b) => (col.num!(a) - col.num!(b)) * sort.dir);
  }, [data, q, sort]);

  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }));
  const exportCsv = () => {
    const csv = toCsv(["Agenție", ...COLS.map((c) => c.label)], rows.map((r) => [r.name, ...COLS.map((c) => c.csv(r))]));
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `statistici-agentii-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  const t = data?.totals;

  return (
    <div className="space-y-5">
      <PageHeader title="Statistici agenții" description="Cât folosește fiecare agenție și fiecare agent Habitoo. Date calculate pe server, doar citire." />
      {t && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <SummaryCard label="Agenții act. / trial / susp." value={`${t.agencies_active} / ${t.agencies_trial} / ${t.agencies_suspended}`} />
          <SummaryCard label="Utilizatori activi" value={t.users_active} />
          <SummaryCard label="Anunțuri active" value={t.listings_active} />
          <SummaryCard label="Anunțuri publicate" value={t.listings_published} tone="success" />
          <SummaryCard label="Lead-uri 30 zile" value={t.leads_30d} />
          <SummaryCard label="Agenții noi 30 zile" value={t.agencies_new_30d} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută agenție…" className="pl-9" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={includeDemo} onCheckedChange={setIncludeDemo} aria-label="Arată și agențiile demo" />
          Arată și agențiile demo
        </label>
        <Button variant="outline" onClick={exportCsv} disabled={!rows.length}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
      </div>
      {isLoading ? <ListSkeleton /> : error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[1400px] text-sm">
            <thead className="bg-muted/40 font-mono text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left"><button onClick={() => toggleSort("name")}>Agenție</button></th>
                {COLS.map((c) => (
                  <th key={c.key} className="whitespace-nowrap px-3 py-2 text-left">
                    {c.num ? <button onClick={() => toggleSort(c.key)}>{c.label}{sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</button> : c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t border-border hover:bg-muted/30" onClick={() => setOpenOrg(r)}>
                  <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium">{r.name}{r.is_demo ? <span className="ml-1 font-mono text-[10px] text-muted-foreground">DEMO</span> : null}</td>
                  {COLS.map((c) => <td key={c.key} className="whitespace-nowrap px-3 py-2 font-mono text-[13px]">{c.cell(r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openOrg && <AgentPanel org={openOrg} onClose={() => setOpenOrg(null)} />}
    </div>
  );
}

function AgentPanel({ org, onClose }: { org: AgencyStatsRow; onClose: () => void }) {
  const fetchAgents = useServerFn(getAgencyAgentStats);
  const { data, isLoading, error } = useQuery({
    queryKey: ["superadmin-agent-stats", org.id],
    queryFn: () => fetchAgents({ data: { organizationId: org.id } }),
  });
  const role = (r: string | null) => (r?.includes("agency_admin") ? "admin" : r?.includes("superadmin") ? "superadmin" : r ? "agent" : "—");
  return (
    <section className="ds-card rounded-xl border border-border p-4" aria-label={`Agenții ${org.name}`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg">Agenții din {org.name}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Închide"><X className="h-4 w-4" /></Button>
      </div>
      {isLoading ? <ListSkeleton /> : error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="font-mono text-[11px] uppercase text-muted-foreground">
              <tr>{["Nume", "Rol", "Stare", "Anunțuri act./total", "Adăugate 30z", "Publicate", "Completare medie", "Lead-uri deschise", "Activități 7z", "Ultima autentificare"].map((h, i) => (
                <th key={h} className={`whitespace-nowrap px-3 py-2 text-left ${i === 0 ? "sticky left-0 bg-card" : ""}`}>{h}</th>))}</tr>
            </thead>
            <tbody>
              {(data ?? []).map((a) => (
                <tr key={a.id ?? "unassigned"} className="border-t border-border">
                  <td className="sticky left-0 bg-card px-3 py-2 font-medium">{a.full_name || "—"}</td>
                  <td className="px-3 py-2">{a.id ? role(a.roles) : "—"}</td>
                  <td className="px-3 py-2">{a.id ? (a.is_active ? "activ" : "dezactivat") : "—"}</td>
                  <td className="px-3 py-2 font-mono">{a.listings_active} / {a.listings_total}</td>
                  <td className="px-3 py-2 font-mono">{a.listings_added_30d}</td>
                  <td className="px-3 py-2 font-mono">{a.listings_published}</td>
                  <td className="px-3 py-2 font-mono">{a.avg_completeness == null ? "—" : `${a.avg_completeness}%`}</td>
                  <td className="px-3 py-2 font-mono">{a.leads_open}</td>
                  <td className="px-3 py-2 font-mono">{a.activities_7d ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{a.last_sign_in_at ? formatDateTime(a.last_sign_in_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
