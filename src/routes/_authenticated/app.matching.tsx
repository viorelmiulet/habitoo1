import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  ArrowRight,
  Download,
  X,
  Bookmark,
  Check,
  Mail,
  MessageCircle,
  CalendarPlus,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { ActivityDialog } from "@/components/app/ActivityDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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
import { brandingFromOrg, materialSignature } from "@/lib/materials";
import { formatMoney } from "@/lib/format";
import {
  propertyStatusLabels,
  propertyStatusTone,
  propertyTypeLabels,
  requestKindLabels,
} from "@/lib/labels";
import { matchLabel, matchTone, scoreMatch, type MatchScore } from "@/lib/matching";
import { downloadCsv, notifyOnce } from "@/lib/crm";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/app/matching")({
  component: MatchingPage,
});

type RequestRow = Tables<"requests">;
type PropertyRow = Tables<"properties">;
type ProfileRow = Tables<"profiles">;

type Mode = "request-to-property" | "property-to-request";

function ignoredKey(userId: string | undefined) {
  return `matching-ignored:${userId ?? "anon"}`;
}

function loadIgnored(userId: string | undefined): Set<string> {
  try {
    const raw = localStorage.getItem(ignoredKey(userId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveIgnored(userId: string | undefined, set: Set<string>) {
  try {
    localStorage.setItem(ignoredKey(userId), JSON.stringify(Array.from(set)));
  } catch {
    /* best-effort */
  }
}

function activePropertyLabel(p: PropertyRow) {
  return `${p.title} — ${p.city ?? ""}`;
}

function MatchingPage() {
  const { data: me } = useCurrentUser();
  const orgId = me?.organization?.id;
  const userId = me?.userId;
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("request-to-property");
  const [minScore, setMinScore] = useState(60);
  const [agentFilter, setAgentFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [ignored, setIgnored] = useState<Set<string>>(() => new Set());
  const [activityFor, setActivityFor] = useState<{
    propertyId?: string;
    requestId?: string;
    contactId?: string;
    title: string;
  } | null>(null);

  useEffect(() => {
    setIgnored(loadIgnored(userId));
  }, [userId]);

  function ignore(key: string) {
    setIgnored((prev) => {
      const next = new Set(prev);
      next.add(key);
      saveIgnored(userId, next);
      return next;
    });
  }

  const { data: requests = [], isLoading: loadingRequests } = useQuery({
    queryKey: ["matching-requests", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requests")
        .select("*")
        .eq("organization_id", orgId as string)
        .in("status", ["new", "active", "working"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as RequestRow[];
    },
  });

  const { data: properties = [], isLoading: loadingProperties } = useQuery({
    queryKey: ["matching-properties", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("organization_id", orgId as string)
        .in("status", ["active", "reserved", "negotiation"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as PropertyRow[];
    },
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["matching-agents", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("organization_id", orgId as string)
        .order("full_name");
      if (error) throw error;
      return data as ProfileRow[];
    },
  });

  const requestIds = useMemo(() => requests.map((r) => r.id), [requests]);
  const propertyIds = useMemo(() => properties.map((p) => p.id), [properties]);

  const { data: existingLeads = [] } = useQuery({
    queryKey: ["matching-leads", orgId, requestIds, propertyIds],
    enabled: Boolean(orgId) && (requestIds.length > 0 || propertyIds.length > 0),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id,property_id,request_id")
        .eq("organization_id", orgId as string)
        .not("property_id", "is", null)
        .not("request_id", "is", null);
      if (error) throw error;
      return data;
    },
  });

  const contactIds = useMemo(
    () => Array.from(new Set(requests.map((r) => r.contact_id).filter(Boolean))) as string[],
    [requests],
  );

  const { data: contacts = [] } = useQuery({
    queryKey: ["matching-contacts", orgId, contactIds],
    enabled: Boolean(orgId) && contactIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("*").in("id", contactIds);
      if (error) throw error;
      return data;
    },
  });

  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const leadExists = useMemo(() => {
    const set = new Set<string>();
    for (const l of existingLeads) {
      if (l.property_id && l.request_id) set.add(`${l.property_id}:${l.request_id}`);
    }
    return set;
  }, [existingLeads]);

  const cities = useMemo(
    () => Array.from(new Set(properties.map((p) => p.city).filter(Boolean))) as string[],
    [properties],
  );

  const saveLead = useMutation({
    mutationFn: async (params: { request: RequestRow; property: PropertyRow; score: number }) => {
      if (!orgId || !userId) throw new Error("Sesiune invalidă.");
      const contact = params.request.contact_id ? contactById.get(params.request.contact_id) : null;
      const name = contact ? `${contact.first_name} ${contact.last_name}` : params.request.title;
      const { error } = await supabase.from("leads").insert({
        organization_id: orgId,
        contact_id: params.request.contact_id ?? null,
        property_id: params.property.id,
        request_id: params.request.id,
        name,
        created_by: userId,
        assigned_to: params.request.assigned_to ?? userId,
        stage: "new",
      } as never);
      if (error) throw error;
      if (params.score >= 85) {
        await notifyOnce({
          organizationId: orgId,
          userId,
          type: "match",
          title: `Match ${params.score}%: ${params.property.title}`,
          body: `Cererea „${params.request.title}” se potrivește cu proprietatea „${params.property.title}”.`,
          link: `/app/properties/${params.property.id}`,
        });
      }
    },
    onSuccess: () => {
      toast.success("Lead salvat.");
      queryClient.invalidateQueries({ queryKey: ["matching-leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toastError(e),
  });

  type Row = {
    key: string;
    request: RequestRow;
    property: PropertyRow;
    match: MatchScore;
    saved: boolean;
  };

  const allRows: Row[] = useMemo(() => {
    const rows: Row[] = [];
    if (mode === "request-to-property") {
      const reqList = selectedRequestId
        ? requests.filter((r) => r.id === selectedRequestId)
        : requests;
      for (const request of reqList) {
        for (const property of properties) {
          rows.push({
            key: `${request.id}:${property.id}`,
            request,
            property,
            match: scoreMatch(request, property),
            saved: leadExists.has(`${property.id}:${request.id}`),
          });
        }
      }
    } else {
      const propList = selectedPropertyId
        ? properties.filter((p) => p.id === selectedPropertyId)
        : properties;
      for (const property of propList) {
        for (const request of requests) {
          rows.push({
            key: `${request.id}:${property.id}`,
            request,
            property,
            match: scoreMatch(request, property),
            saved: leadExists.has(`${property.id}:${request.id}`),
          });
        }
      }
    }
    return rows;
  }, [mode, requests, properties, selectedRequestId, selectedPropertyId, leadExists]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows
      .filter((r) => r.match.score >= minScore)
      .filter((r) => !ignored.has(r.key))
      .filter((r) =>
        agentFilter === "all"
          ? true
          : r.property.assigned_to === agentFilter || r.request.assigned_to === agentFilter,
      )
      .filter((r) => (cityFilter === "all" ? true : r.property.city === cityFilter))
      .filter((r) => (typeFilter === "all" ? true : r.property.property_type === typeFilter))
      .filter((r) =>
        onlyMine ? r.request.assigned_to === userId || r.property.assigned_to === userId : true,
      )
      .filter((r) =>
        q
          ? r.request.title.toLowerCase().includes(q) || r.property.title.toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, 200);
  }, [allRows, minScore, ignored, agentFilter, cityFilter, typeFilter, onlyMine, userId, search]);

  function shareText(request: RequestRow, property: PropertyRow) {
    return `Bună! Am o proprietate care s-ar putea potrivi: ${property.title}, preț ${formatMoney(
      property.price,
      property.currency,
    )}, în ${property.city ?? "—"}, ${property.rooms ?? "—"} camere, ${property.surface ?? "—"} mp.

${materialSignature(brandingFromOrg(me?.organization))}`;
  }

  function handleExport() {
    if (filteredRows.length === 0) return;
    downloadCsv(
      "matching.csv",
      filteredRows.map((r) => ({
        cerere: r.request.title,
        proprietate: r.property.title,
        scor: r.match.score,
        oras: r.property.city,
        pret: r.property.price,
        potriviri: r.match.reasons.join("; "),
        lipsuri: r.match.misses.join("; "),
      })),
    );
  }

  const isLoading = loadingRequests || loadingProperties;

  return (
    <>
      <PageHeader
        title="Matching"
        description="Confruntă cererile clienților cu portofoliul de proprietăți și acționează direct pe potriviri."
        meta={
          !isLoading ? (
            <>
              <StatusBadge tone="primary" dot>
                {filteredRows.length} potriviri afișate
              </StatusBadge>
              <StatusBadge tone="neutral">
                {requests.length} cereri · {properties.length} proprietăți
              </StatusBadge>
            </>
          ) : undefined
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={filteredRows.length === 0}
          >
            <Download className="mr-1.5 size-4" /> Export CSV
          </Button>
        }
      />

      <div className="panel space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={mode === "request-to-property" ? "default" : "outline"}
            onClick={() => setMode("request-to-property")}
          >
            Cerere → Proprietăți
          </Button>
          <Button
            size="sm"
            variant={mode === "property-to-request" ? "default" : "outline"}
            onClick={() => setMode("property-to-request")}
          >
            Proprietate → Clienți
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {mode === "request-to-property" ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Cerere</Label>
              <Select
                value={selectedRequestId ?? "all"}
                onValueChange={(v) => setSelectedRequestId(v === "all" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Toate cererile" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toate cererile</SelectItem>
                  {requests.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">Proprietate</Label>
              <Select
                value={selectedPropertyId ?? "all"}
                onValueChange={(v) => setSelectedPropertyId(v === "all" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Toate proprietățile" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toate proprietățile</SelectItem>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {activePropertyLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Agent</Label>
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toți agenții</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Oraș</Label>
            <Select value={cityFilter} onValueChange={setCityFilter}>
              <SelectTrigger>
                <SelectValue />
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
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Tip proprietate</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue />
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
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex min-w-56 flex-1 items-center gap-3">
            <Label className="whitespace-nowrap text-xs">Scor minim: {minScore}%</Label>
            <Slider
              value={[minScore]}
              min={0}
              max={100}
              step={5}
              onValueChange={(v) => setMinScore(v[0] ?? 60)}
              className="max-w-xs"
            />
          </div>
          <Input
            placeholder="Caută cerere sau proprietate…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={onlyMine} onCheckedChange={(v) => setOnlyMine(Boolean(v))} />
            Doar ale mele
          </label>
        </div>
      </div>

      {isLoading ? (
        <div className="panel p-6">
          <p className="text-sm text-muted-foreground">Se calculează potrivirile…</p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={Sparkles}
            title="Nicio potrivire la acest scor"
            description="Coboară scorul minim sau schimbă filtrele active."
          />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredRows.map((row) => {
            const contact = row.request.contact_id ? contactById.get(row.request.contact_id) : null;
            const text = shareText(row.request, row.property);
            const tone = matchTone(row.match.score);
            return (
              <article key={row.key} className="panel flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Link
                      to="/app/requests/$id"
                      params={{ id: row.request.id }}
                      className="block truncate text-sm font-semibold hover:text-primary"
                    >
                      {row.request.title}
                    </Link>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ArrowRight className="size-3.5 shrink-0" aria-hidden />
                      <Link
                        to="/app/properties/$id"
                        params={{ id: row.property.id }}
                        className="truncate font-medium text-foreground hover:text-primary"
                      >
                        {row.property.title}
                      </Link>
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <StatusBadge tone={propertyStatusTone[row.property.status]}>
                        {propertyStatusLabels[row.property.status]}
                      </StatusBadge>
                      <span className="text-xs text-muted-foreground">
                        {requestKindLabels[row.request.kind]} · {row.property.city ?? "—"} ·{" "}
                        {formatMoney(row.property.price, row.property.currency)}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`grid size-16 shrink-0 place-items-center rounded-2xl text-center ${
                      tone === "success"
                        ? "bg-success/12 text-success"
                        : tone === "warning"
                          ? "bg-warning/18 text-warning-foreground"
                          : tone === "info"
                            ? "bg-info/12 text-info"
                            : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <div>
                      <p className="text-lg leading-none font-semibold tabular-nums">
                        {row.match.score}%
                      </p>
                      <p className="mt-1 text-[10px] leading-none opacity-80">
                        {matchLabel(row.match.score)}
                      </p>
                    </div>
                  </div>
                </div>

                {row.match.reasons.length > 0 || row.match.misses.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {row.match.reasons.map((r) => (
                      <span
                        key={`ok-${r}`}
                        className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success"
                      >
                        <Check className="size-3" aria-hidden /> {r}
                      </span>
                    ))}
                    {row.match.misses.map((m) => (
                      <span
                        key={`no-${m}`}
                        className="inline-flex items-center gap-1 rounded-md bg-destructive/8 px-2 py-0.5 text-[11px] font-medium text-destructive"
                      >
                        <X className="size-3" aria-hidden /> {m}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                  <Button
                    size="sm"
                    variant={row.saved ? "secondary" : "default"}
                    disabled={row.saved || saveLead.isPending}
                    onClick={() =>
                      saveLead.mutate({
                        request: row.request,
                        property: row.property,
                        score: row.match.score,
                      })
                    }
                  >
                    {row.saved ? (
                      <>
                        <Check className="mr-1 size-3.5" /> Salvat
                      </>
                    ) : (
                      <>
                        <Bookmark className="mr-1 size-3.5" /> Salvează lead
                      </>
                    )}
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/app/properties/$id" params={{ id: row.property.id }}>
                      <ExternalLink className="mr-1 size-3.5" /> Deschide
                    </Link>
                  </Button>
                  {contact?.phone ? (
                    <Button size="sm" variant="outline" title="Trimite pe WhatsApp" asChild>
                      <a
                        href={`https://wa.me/${contact.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(text)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MessageCircle className="size-3.5" />
                      </a>
                    </Button>
                  ) : null}
                  {contact?.email ? (
                    <Button size="sm" variant="outline" title="Trimite pe email" asChild>
                      <a
                        href={`mailto:${contact.email}?subject=${encodeURIComponent(
                          `Proprietate potrivită: ${row.property.title}`,
                        )}&body=${encodeURIComponent(text)}`}
                      >
                        <Mail className="size-3.5" />
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    title="Programează vizionare"
                    onClick={() =>
                      setActivityFor({
                        propertyId: row.property.id,
                        requestId: row.request.id,
                        contactId: row.request.contact_id ?? undefined,
                        title: `Vizionare: ${row.property.title}`,
                      })
                    }
                  >
                    <CalendarPlus className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-muted-foreground"
                    title="Ascunde potrivirea"
                    onClick={() => ignore(row.key)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ActivityDialog
        open={Boolean(activityFor)}
        onOpenChange={(open) => !open && setActivityFor(null)}
        orgId={orgId}
        userId={userId}
        defaults={
          activityFor
            ? {
                kind: "viewing",
                title: activityFor.title,
                propertyId: activityFor.propertyId,
                requestId: activityFor.requestId,
                contactId: activityFor.contactId,
              }
            : undefined
        }
      />
    </>
  );
}
