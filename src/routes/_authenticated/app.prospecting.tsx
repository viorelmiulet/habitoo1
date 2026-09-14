/**
 * Prospecting — interfața modulului de prospectare (Stage 13).
 *
 * Interfața trimite doar intenții către server functions: nu cunoaște sursele,
 * providerul AI sau cheile. Orice import în CRM se face numai după aprobarea
 * explicită a utilizatorului.
 */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { appHead } from "@/components/app/app-head";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createProspectingSearch,
  importProspect,
  listProspects,
  listProspectingRuns,
  listProspectingSearches,
  listProspectingSources,
  resumeProspecting,
  reviewProspect,
  startProspecting,
  type ProspectView,
} from "@/lib/prospecting/prospecting-client";

export const Route = createFileRoute("/_authenticated/app/prospecting")({
  head: () =>
    appHead(
      "Prospectare — oportunități imobiliare",
      "Descoperă, filtrează și importă oportunități imobiliare în CRM, cu aprobare umană la fiecare pas.",
    ),
  component: ProspectingPage;
});

const SELLER_LABELS: Record<string, string> = {
  private: "Proprietar",
  agency: "Agenție",
  developer: "Dezvoltator",
  unknown: "Nedeterminat",
};

const STATUS_LABELS: Record<string, string> = {
  new: "Nouă",
  reviewed: "Analizată",
  approved: "Aprobată",
  imported: "Importată",
  rejected: "Respinsă",
  duplicate: "Duplicat",
  expired: "Expirată",
  error: "Eroare",
};

function money(value: number | null, currency: string | null): string {
  if (value === null) return "Preț nepublicat";
  return `${new Intl.NumberFormat("ro-RO").format(value)} ${currency ?? ""}`.trim();
}

function ProspectingPage() {
  const queryClient = useQueryClient();
  const fetchSources = useServerFn(listProspectingSources);
  const fetchSearches = useServerFn(listProspectingSearches);
  const fetchProspects = useServerFn(listProspects);
  const fetchRuns = useServerFn(listProspectingRuns);
  const createSearch = useServerFn(createProspectingSearch);
  const start = useServerFn(startProspecting);
  const resume = useServerFn(resumeProspecting);
  const review = useServerFn(reviewProspect);
  const doImport = useServerFn(importProspect);

  const [form, setForm] = useState({
    name: "",
    transactionType: "sale",
    propertyType: "",
    county: "",
    city: "",
    zone: "",
    priceMin: "",
    priceMax: "",
    roomsMin: "",
    roomsMax: "",
    surfaceMin: "",
    surfaceMax: "",
    keywords: "",
  });
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [minScore, setMinScore] = useState<string>("");
  const [selected, setSelected] = useState<string[]>([]);

  const sources = useQuery({ queryKey: ["prospecting", "sources"], queryFn: () => fetchSources() });
  const searches = useQuery({
    queryKey: ["prospecting", "searches"],
    queryFn: () => fetchSearches(),
  });
  const runs = useQuery({ queryKey: ["prospecting", "runs"], queryFn: () => fetchRuns() });
  const prospects = useQuery({
    queryKey: ["prospecting", "prospects", statusFilter, sellerFilter, minScore],
    queryFn: () =>
      fetchProspects({
        data: {
          status: statusFilter === "all" ? null : (statusFilter as never),
          sellerType: sellerFilter === "all" ? null : (sellerFilter as never),
          minScore: minScore === "" ? null : Number(minScore),
        },
      }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["prospecting"] });
  };

  const numberOrNull = (value: string) => (value.trim() === "" ? null : Number(value));

  const createMutation = useMutation({
    mutationFn: async () => {
      const created = await createSearch({
        data: {
          name: form.name.trim(),
          transactionType: form.transactionType as "sale" | "rent",
          propertyType: form.propertyType.trim() || null,
          county: form.county.trim() || null,
          city: form.city.trim() || null,
          zone: form.zone.trim() || null,
          priceMin: numberOrNull(form.priceMin),
          priceMax: numberOrNull(form.priceMax),
          roomsMin: numberOrNull(form.roomsMin),
          roomsMax: numberOrNull(form.roomsMax),
          surfaceMin: numberOrNull(form.surfaceMin),
          surfaceMax: numberOrNull(form.surfaceMax),
          keywords: form.keywords
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item !== ""),
          sourceIds: selectedSources,
        },
      });
      if (!created.ok || !created.id) throw new Error(created.message ?? "Căutarea nu a fost salvată.");
      return start({ data: { searchId: created.id } });
    },
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(
          `Am găsit ${result.run.counters.candidatesFound} oportunități. Aprobă-le pentru import.`,
        );
      } else {
        toast.error(result.message);
      }
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Prospectarea nu a putut porni."),
  });

  const startMutation = useMutation({
    mutationFn: (searchId: string) => start({ data: { searchId } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(`Rulare pornită: ${result.run.counters.candidatesFound} candidați.`);
      else toast.error(result.message);
      invalidate();
    },
    onError: () => toast.error("Rularea nu a putut porni."),
  });

  const reviewMutation = useMutation({
    mutationFn: (input: { prospectId: string; decision: "approved" | "rejected" }) =>
      review({ data: input }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      invalidate();
    },
    onError: () => toast.error("Decizia nu a putut fi salvată."),
  });

  const importMutation = useMutation({
    mutationFn: (prospectId: string) => doImport({ data: { prospectId } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      invalidate();
    },
    onError: () => toast.error("Importul nu a reușit."),
  });

  const bulkMutation = useMutation({
    mutationFn: async (input: { runId: string; decision: "approve" | "reject" }) =>
      resume({
        data: {
          runId: input.runId,
          approvedIds: input.decision === "approve" ? selected : [],
          rejectedIds: input.decision === "reject" ? selected : [],
          importApproved: input.decision === "approve",
        },
      }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(
          result.imported && result.imported > 0
            ? `${result.imported} oportunități importate în CRM.`
            : "Deciziile au fost salvate.",
        );
        setSelected([]);
      } else {
        toast.error(result.message);
      }
      invalidate();
    },
    onError: () => toast.error("Deciziile nu au putut fi salvate."),
  });

  const pendingRun = useMemo(
    () => (runs.data ?? []).find((run) => run.status === "suspended") ?? null,
    [runs.data],
  );

  const rows = prospects.data ?? [];
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prospectare"
        description="Agentul caută oportunități în sursele configurate, elimină duplicatele și le punctează. Importul în CRM se face doar după aprobarea ta."
      />

      <Tabs defaultValue="opportunities">
        <TabsList className="flex-wrap">
          <TabsTrigger value="new">Căutare nouă</TabsTrigger>
          <TabsTrigger value="opportunities">Oportunități</TabsTrigger>
          <TabsTrigger value="runs">Rulări</TabsTrigger>
          <TabsTrigger value="sources">Surse</TabsTrigger>
          <TabsTrigger value="history">Istoric</TabsTrigger>
        </TabsList>

        {/* ---------------------------- Căutare nouă --------------------------- */}
        <TabsContent value="new" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Definește o căutare</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="p-name">Nume căutare</Label>
                  <Input
                    id="p-name"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="Ex.: Apartamente 2 camere Militari"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tranzacție</Label>
                  <Select
                    value={form.transactionType}
                    onValueChange={(value) => setForm({ ...form, transactionType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sale">Vânzare</SelectItem>
                      <SelectItem value="rent">Închiriere</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(
                  [
                    ["propertyType", "Tip proprietate"],
                    ["county", "Județ"],
                    ["city", "Oraș"],
                    ["zone", "Zonă"],
                    ["priceMin", "Preț minim"],
                    ["priceMax", "Preț maxim"],
                    ["roomsMin", "Camere minim"],
                    ["roomsMax", "Camere maxim"],
                    ["surfaceMin", "Suprafață minimă"],
                    ["surfaceMax", "Suprafață maximă"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`p-${key}`}>{label}</Label>
                    <Input
                      id={`p-${key}`}
                      value={form[key]}
                      inputMode={key.includes("price") || key.includes("rooms") || key.includes("surface") ? "numeric" : "text"}
                      onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                    />
                  </div>
                ))}
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                  <Label htmlFor="p-keywords">Cuvinte cheie (separate prin virgulă)</Label>
                  <Input
                    id="p-keywords"
                    value={form.keywords}
                    onChange={(event) => setForm({ ...form, keywords: event.target.value })}
                    placeholder="proprietar, comision 0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Surse</Label>
                {(sources.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nu există surse configurate. Configurează o sursă în fila „Surse”.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(sources.data ?? []).map((source) => (
                      <label
                        key={source.id}
                        className="flex items-center gap-2 rounded-md border p-2 text-sm"
                      >
                        <Checkbox
                          checked={selectedSources.includes(source.id)}
                          onCheckedChange={() =>
                            setSelectedSources((prev) =>
                              prev.includes(source.id)
                                ? prev.filter((item) => item !== source.id)
                                : [...prev, source.id],
                            )
                          }
                        />
                        <span className="flex-1">{source.name}</span>
                        {source.fixture ? <Badge variant="outline">date de test</Badge> : null}
                        {!source.enabled ? <Badge variant="secondary">inactivă</Badge> : null}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={form.name.trim().length < 3 || createMutation.isPending}
                >
                  {createMutation.isPending ? "Se caută…" : "Pornește prospectarea"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------------------- Oportunități --------------------------- */}
        <TabsContent value="opportunities" className="mt-4 space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-end gap-3 py-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toate</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tip vânzător</Label>
                <Select value={sellerFilter} onValueChange={setSellerFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toți</SelectItem>
                    {Object.entries(SELLER_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-min-score">Scor minim</Label>
                <Input
                  id="p-min-score"
                  className="w-28"
                  inputMode="numeric"
                  value={minScore}
                  onChange={(event) => setMinScore(event.target.value)}
                />
              </div>
              {pendingRun && selected.length > 0 ? (
                <div className="ml-auto flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      bulkMutation.mutate({ runId: pendingRun.id, decision: "reject" })
                    }
                    disabled={bulkMutation.isPending}
                  >
                    Respinge selecția
                  </Button>
                  <Button
                    onClick={() =>
                      bulkMutation.mutate({ runId: pendingRun.id, decision: "approve" })
                    }
                    disabled={bulkMutation.isPending}
                  >
                    Aprobă selecția ({selected.length})
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {prospects.isLoading ? (
            <p className="text-sm text-muted-foreground">Se încarcă oportunitățile…</p>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                Nicio oportunitate încă. Pornește o căutare în fila „Căutare nouă”.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {rows.map((prospect) => (
                <ProspectCard
                  key={prospect.id}
                  prospect={prospect}
                  selected={selected.includes(prospect.id)}
                  onToggle={() => toggle(prospect.id)}
                  onApprove={() =>
                    reviewMutation.mutate({ prospectId: prospect.id, decision: "approved" })
                  }
                  onReject={() =>
                    reviewMutation.mutate({ prospectId: prospect.id, decision: "rejected" })
                  }
                  onImport={() => importMutation.mutate(prospect.id)}
                  busy={reviewMutation.isPending || importMutation.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* -------------------------------- Rulări ----------------------------- */}
        <TabsContent value="runs" className="mt-4 space-y-3">
          {(runs.data ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                Nu există rulări încă.
              </CardContent>
            </Card>
          ) : (
            (runs.data ?? []).map((run) => (
              <Card key={run.id}>
                <CardContent className="space-y-2 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{run.searchName}</span>
                    <Badge variant={run.status === "suspended" ? "default" : "secondary"}>
                      {run.status === "suspended"
                        ? "așteaptă aprobare"
                        : run.status === "completed"
                          ? "finalizată"
                          : run.status === "failed"
                            ? "eroare"
                            : "în curs"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">pas: {run.currentStep}</span>
                    {run.fixtureUsed ? <Badge variant="outline">date de test</Badge> : null}
                  </div>
                  <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-3">
                    <span>Găsite: {run.counters.itemsFound}</span>
                    <span>Normalizate: {run.counters.itemsNormalized}</span>
                    <span>Duplicate: {run.counters.duplicatesFound}</span>
                    <span>Candidați: {run.counters.candidatesFound}</span>
                    <span>Erori: {run.counters.errorsCount}</span>
                    <span>Actualizat: {new Date(run.updatedAt).toLocaleString("ro-RO")}</span>
                  </div>
                  {run.warnings.map((warning) => (
                    <p key={warning} className="text-xs text-muted-foreground">
                      {warning}
                    </p>
                  ))}
                  {run.status === "suspended" ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() =>
                          resume({
                            data: {
                              runId: run.id,
                              approvedIds: run.candidateIds,
                              rejectedIds: [],
                              importApproved: true,
                            },
                          }).then((result) => {
                            if (result.ok) toast.success("Oportunitățile aprobate au fost importate.");
                            else toast.error(result.message);
                            invalidate();
                          })
                        }
                      >
                        Aprobă toate și importă
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          resume({
                            data: {
                              runId: run.id,
                              approvedIds: [],
                              rejectedIds: run.candidateIds,
                              importApproved: false,
                            },
                          }).then((result) => {
                            if (result.ok) toast.success("Rularea a fost închisă fără import.");
                            else toast.error(result.message);
                            invalidate();
                          })
                        }
                      >
                        Respinge tot
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* -------------------------------- Surse ----------------------------- */}
        <TabsContent value="sources" className="mt-4 space-y-3">
          {(sources.data ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                Nu există surse disponibile. Sursele se configurează de administratorul platformei,
                doar pentru feeduri publice permise.
              </CardContent>
            </Card>
          ) : (
            (sources.data ?? []).map((source) => (
              <Card key={source.id}>
                <CardContent className="flex flex-wrap items-center gap-2 py-4 text-sm">
                  <span className="font-medium">{source.name}</span>
                  <Badge variant="secondary">{source.sourceType}</Badge>
                  {source.global ? <Badge variant="outline">globală</Badge> : null}
                  {source.fixture ? <Badge variant="outline">date de test</Badge> : null}
                  <span className="ml-auto text-muted-foreground">
                    {!source.implemented
                      ? "integrare indisponibilă"
                      : source.enabled
                        ? source.live
                          ? "activă"
                          : "activă (listă proprie)"
                        : "inactivă"}
                  </span>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ------------------------------- Istoric ---------------------------- */}
        <TabsContent value="history" className="mt-4 space-y-3">
          {(searches.data ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                Nu există căutări salvate.
              </CardContent>
            </Card>
          ) : (
            (searches.data ?? []).map((search) => (
              <Card key={search.id}>
                <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
                  <span className="font-medium">{search.name}</span>
                  <Badge variant="secondary">{search.status}</Badge>
                  <span className="text-muted-foreground">
                    {[search.city, search.county].filter(Boolean).join(", ") || "fără localizare"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    onClick={() => startMutation.mutate(search.id)}
                    disabled={startMutation.isPending}
                  >
                    Rulează din nou
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProspectCard(props: {
  prospect: ProspectView;
  selected: boolean;
  busy: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
  onImport: () => void;
}) {
  const { prospect } = props;
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start gap-3">
          <Checkbox checked={props.selected} onCheckedChange={props.onToggle} className="mt-1" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{prospect.title}</span>
              <Badge variant="secondary">{STATUS_LABELS[prospect.status] ?? prospect.status}</Badge>
              {prospect.duplicateCount > 1 ? (
                <Badge variant="outline">posibil duplicat ({prospect.duplicateCount})</Badge>
              ) : null}
              {prospect.fixture ? <Badge variant="outline">date de test</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {money(prospect.price, prospect.currency)}
              {" · "}
              {[prospect.city, prospect.zone].filter(Boolean).join(", ") || "localizare necunoscută"}
              {prospect.rooms !== null ? ` · ${prospect.rooms} camere` : ""}
              {prospect.surfaceUseful !== null ? ` · ${prospect.surfaceUseful} mp` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {SELLER_LABELS[prospect.sellerType] ?? prospect.sellerType}
              {prospect.sellerConfidence !== null
                ? ` (încredere ${Math.round(prospect.sellerConfidence * 100)}%)`
                : ""}
              {prospect.sourceName ? ` · sursă: ${prospect.sourceName}` : ""}
            </p>
            {prospect.sourceUrl ? (
              <a
                href={prospect.sourceUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-xs underline"
              >
                Deschide anunțul
              </a>
            ) : null}
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {prospect.reasons.map((reason) => (
                <li key={reason}>• {reason}</li>
              ))}
            </ul>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold">{prospect.opportunityScore}</div>
            <div className="text-xs text-muted-foreground">scor / 100</div>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {prospect.status === "approved" ? (
            <Button size="sm" onClick={props.onImport} disabled={props.busy}>
              Importă în CRM
            </Button>
          ) : prospect.status === "imported" ? (
            <Badge variant="secondary">deja în CRM</Badge>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={props.onReject} disabled={props.busy}>
                Respinge
              </Button>
              <Button size="sm" onClick={props.onApprove} disabled={props.busy}>
                Aprobă
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
