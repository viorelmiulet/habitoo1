/**
 * Superadmin → Suport: toate tichetele din platformă, cu filtre pe status,
 * agenție și categorie. Răspuns, notițe interne și schimbare de status.
 */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LifeBuoy, Search } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { EmptyState } from "@/components/app/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appHead } from "@/components/app/app-head";
import { SupportStatusBadge, SupportThread } from "@/components/app/SupportThread";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  listAllSupportTickets,
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
} from "@/lib/support.functions";

export const Route = createFileRoute("/_authenticated/superadmin/support")({
  head: () => appHead("Habitoo CRM — suport și tichete"),
  component: SuperadminSupportPage,
});

type StatusFilter = "unresolved" | "open" | "in_progress" | "resolved" | "closed" | "all";

function SuperadminSupportPage() {
  const load = useServerFn(listAllSupportTickets);
  const [status, setStatus] = useState<StatusFilter>("unresolved");
  const [category, setCategory] = useState<string>("all");
  const [organizationId, setOrganizationId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const tickets = useQuery({
    queryKey: ["support-tickets", "all", status, category, search],
    queryFn: () =>
      load({
        data: {
          status,
          category: category === "all" ? undefined : category,
          search: search.trim() || undefined,
        },
      }),
  });

  const rows = tickets.data ?? [];
  const organizations = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows)
      if (r.organizationId) map.set(r.organizationId, r.organizationName ?? r.organizationId);
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name, "ro"),
    );
  }, [rows]);
  const visible =
    organizationId === "all" ? rows : rows.filter((r) => r.organizationId === organizationId);

  return (
    <>
      <PageHeader
        title="Suport și tichete"
        description="Toate solicitările primite din agenții, cele nerezolvate primele."
        meta={
          <span className="text-sm text-muted-foreground">{visible.length} tichete afișate</span>
        }
      />

      <div className="grid gap-3 rounded-xl border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unresolved">Nerezolvate</SelectItem>
              <SelectItem value="open">Deschise</SelectItem>
              <SelectItem value="in_progress">În lucru</SelectItem>
              <SelectItem value="resolved">Rezolvate</SelectItem>
              <SelectItem value="closed">Închise</SelectItem>
              <SelectItem value="all">Toate</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Categorie</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate categoriile</SelectItem>
              {SUPPORT_CATEGORIES.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Agenție</Label>
          <Select value={organizationId} onValueChange={setOrganizationId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate agențiile</SelectItem>
              {organizations.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="support-search">Căutare subiect</Label>
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="support-search"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ex. fotografii"
            />
          </div>
        </div>
      </div>

      {tickets.isLoading ? (
        <InlineLoading label="Se încarcă tichetele…" />
      ) : tickets.error ? (
        <QueryError error={tickets.error} onRetry={() => void tickets.refetch()} />
      ) : visible.length === 0 ? (
        <EmptyState icon={LifeBuoy} title="Niciun tichet pentru filtrele alese" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <ul className="space-y-2">
            {visible.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={cn(
                    "w-full rounded-xl border bg-surface px-3 py-2.5 text-left transition-colors hover:border-gold/50",
                    selected === t.id ? "border-gold/70 ring-1 ring-gold/30" : "border-border",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{t.subject}</span>
                    <SupportStatusBadge status={t.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {t.organizationName ?? "—"} · {t.createdByName ?? "—"} ·{" "}
                    {SUPPORT_CATEGORY_LABELS[t.category] ?? t.category} ·{" "}
                    {formatDateTime(t.lastMessageAt)}
                    {t.lastReplyByStaff ? "" : " · așteaptă răspuns"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          <div>
            {selected ? (
              <SupportThread ticketId={selected} staff />
            ) : (
              <EmptyState
                icon={LifeBuoy}
                title="Selectează un tichet"
                description="Alege un tichet pentru a răspunde."
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
