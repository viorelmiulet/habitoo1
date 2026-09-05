import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Building2, Bookmark, Download, Search, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-session";
import { formatMoney, formatNumber, relativeDays } from "@/lib/format";
import {
  propertyStatusLabels,
  propertyStatusTone,
  propertyTypeLabels,
  transactionLabels,
} from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/app/properties/")({
  component: PropertiesPage,
});

type Filters = {
  q: string;
  status: string;
  transaction: string;
  type: string;
  city: string;
  mine: boolean;
};

const emptyFilters: Filters = {
  q: "",
  status: "all",
  transaction: "all",
  type: "all",
  city: "all",
  mine: false,
};

const SAVED_KEY = "imobiflow.savedPropertyFilters";

function readSaved(): { name: string; filters: Filters }[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function PropertiesPage() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState(readSaved);

  const { data: properties = [], isLoading } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const { error } = await supabase
        .from("properties")
        .update({ status: status as never })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      setSelected([]);
      toast.success("Statusul a fost actualizat.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cities = useMemo(
    () => [...new Set(properties.map((p) => p.city).filter(Boolean) as string[])].sort(),
    [properties],
  );

  const rows = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return properties.filter((p) => {
      if (filters.status !== "all" && p.status !== filters.status) return false;
      if (filters.transaction !== "all" && p.transaction_kind !== filters.transaction) return false;
      if (filters.type !== "all" && p.property_type !== filters.type) return false;
      if (filters.city !== "all" && p.city !== filters.city) return false;
      if (filters.mine && p.assigned_to !== user?.userId) return false;
      if (!q) return true;
      return [p.title, p.reference, p.address, p.city, p.district]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [properties, filters, user?.userId]);

  const allSelected = rows.length > 0 && selected.length === rows.length;

  const exportCsv = () => {
    const header = ["Referință", "Titlu", "Tip", "Tranzacție", "Status", "Oraș", "Preț", "Suprafață"];
    const lines = rows.map((p) =>
      [
        p.reference ?? "",
        p.title,
        propertyTypeLabels[p.property_type] ?? p.property_type,
        transactionLabels[p.transaction_kind],
        propertyStatusLabels[p.status],
        p.city ?? "",
        p.price ?? "",
        p.surface ?? "",
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "proprietati.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveFilter = () => {
    const name = window.prompt("Numele filtrului salvat:");
    if (!name) return;
    const next = [...saved.filter((s) => s.name !== name), { name, filters }];
    setSaved(next);
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  };

  return (
    <>
      <PageHeader
        title="Proprietăți"
        description="Portofoliul agenției, cu filtrare avansată, editare rapidă și acțiuni în masă."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="size-4" /> Export CSV
            </Button>
            <Button size="sm" asChild>
              <Link to="/app/properties/new">Adaugă proprietate</Link>
            </Button>
          </>
        }
      />

      <div className="panel space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="Caută după titlu, referință, adresă…"
              className="pl-9"
            />
          </div>

          <Select
            value={filters.status}
            onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate statusurile</SelectItem>
              {Object.entries(propertyStatusLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.transaction}
            onValueChange={(v) => setFilters((f) => ({ ...f, transaction: v }))}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Tranzacție" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate</SelectItem>
              <SelectItem value="sale">Vânzare</SelectItem>
              <SelectItem value="rent">Închiriere</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.type} onValueChange={(v) => setFilters((f) => ({ ...f, type: v }))}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Tip" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate tipurile</SelectItem>
              {Object.entries(propertyTypeLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.city} onValueChange={(v) => setFilters((f) => ({ ...f, city: v }))}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Oraș" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate orașele</SelectItem>
              {cities.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant={filters.mine ? "default" : "outline"}
            size="sm"
            onClick={() => setFilters((f) => ({ ...f, mine: !f.mine }))}
          >
            Doar ale mele
          </Button>
          <Button variant="ghost" size="sm" onClick={saveFilter}>
            <Bookmark className="size-4" /> Salvează filtrul
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setFilters(emptyFilters)}>
            <X className="size-4" /> Resetează
          </Button>
        </div>

        {saved.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">Filtre salvate:</span>
            {saved.map((s) => (
              <Button key={s.name} variant="secondary" size="sm" onClick={() => setFilters(s.filters)}>
                {s.name}
              </Button>
            ))}
          </div>
        ) : null}

        {selected.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
            <span className="text-sm font-medium">{selected.length} selectate</span>
            <Select onValueChange={(v) => updateStatus.mutate({ ids: selected, status: v })}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Schimbă statusul" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(propertyStatusLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              Anulează selecția
            </Button>
          </div>
        ) : null}
      </div>

      <div className="panel overflow-hidden">
        <div className="hidden items-center gap-3 border-b border-border px-4 py-3 text-xs font-medium tracking-wide text-muted-foreground uppercase lg:flex">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(c) => setSelected(c ? rows.map((r) => r.id) : [])}
          />
          <span className="flex-1">Proprietate</span>
          <span className="w-28">Tip</span>
          <span className="w-24">Tranzacție</span>
          <span className="w-28">Status</span>
          <span className="w-28 text-right">Preț</span>
          <span className="w-24 text-right">Suprafață</span>
          <span className="w-24 text-right">Actualizat</span>
        </div>

        {isLoading ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Se încarcă…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Nicio proprietate găsită"
            description="Ajustează filtrele sau adaugă o proprietate nouă în portofoliu."
            action={
              <Button asChild size="sm">
                <Link to="/app/properties/new">Adaugă proprietate</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm lg:flex-nowrap">
                <Checkbox
                  checked={selected.includes(p.id)}
                  onCheckedChange={(c) =>
                    setSelected((s) => (c ? [...s, p.id] : s.filter((id) => id !== p.id)))
                  }
                />
                <div className="min-w-0 flex-1">
                  <Link
                    to="/app/properties/$id"
                    params={{ id: p.id }}
                    className="truncate font-medium hover:text-primary"
                  >
                    {p.title}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.reference ? `${p.reference} · ` : ""}
                    {[p.district, p.city].filter(Boolean).join(", ") || "Locație nespecificată"}
                  </p>
                </div>
                <span className="w-28 text-xs text-muted-foreground">
                  {propertyTypeLabels[p.property_type] ?? p.property_type}
                </span>
                <span className="w-24 text-xs text-muted-foreground">
                  {transactionLabels[p.transaction_kind]}
                </span>
                <span className="w-28">
                  <StatusBadge tone={propertyStatusTone[p.status]}>
                    {propertyStatusLabels[p.status]}
                  </StatusBadge>
                </span>
                <span className="w-28 text-right font-medium">{formatMoney(p.price, p.currency)}</span>
                <span className="w-24 text-right text-xs text-muted-foreground">
                  {p.surface ? `${formatNumber(p.surface)} m²` : "—"}
                </span>
                <span className="w-24 text-right text-xs text-muted-foreground">
                  {relativeDays(p.updated_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
