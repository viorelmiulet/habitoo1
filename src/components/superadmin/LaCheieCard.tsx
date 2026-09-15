/**
 * Card Superadmin pentru integrarea La Cheie: mediu, catalog, testele CRUD
 * cerute înainte de producție, activarea producției și jurnalul operațiilor.
 * Cheia API nu este niciodată afișată: se salvează din cardul de conexiuni.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/app/StatusBadge";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { LACHEIE_READINESS_LABEL } from "@/lib/portals/lacheie/config";
import {
  confirmLaCheieProduction,
  getLaCheieState,
  refreshLaCheieCatalog,
  runLaCheieCrudCheck,
  setLaCheieEnvironment,
} from "@/lib/portals/lacheie.functions";
import { listOrgPropertiesForPortals } from "@/lib/portals.functions";

const READINESS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  connected: "success",
  testing: "warning",
  production_blocked: "warning",
  error: "danger",
  not_configured: "neutral",
};

export function LaCheieCard({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const loadState = useServerFn(getLaCheieState);
  const loadProperties = useServerFn(listOrgPropertiesForPortals);
  const switchEnvironment = useServerFn(setLaCheieEnvironment);
  const confirmProduction = useServerFn(confirmLaCheieProduction);
  const refreshCatalog = useServerFn(refreshLaCheieCatalog);
  const runCrud = useServerFn(runLaCheieCrudCheck);
  const [testPropertyId, setTestPropertyId] = useState("");

  const state = useQuery({
    queryKey: ["lacheie-state", organizationId],
    queryFn: () => loadState({ data: { organizationId } }),
  });

  const properties = useQuery({
    queryKey: ["lacheie-test-properties", organizationId],
    queryFn: () => loadProperties({ data: { organizationId, limit: 25 } }),
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["lacheie-state", organizationId] });

  const environmentMutation = useMutation({
    mutationFn: (environment: "test" | "production") =>
      switchEnvironment({ data: { organizationId, environment } }),
    onSuccess: (result) => {
      toast.success(
        result.environment === "test" ? "Mediu de test activ." : "Mediu de producție activ.",
      );
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const productionMutation = useMutation({
    mutationFn: (active: boolean) => confirmProduction({ data: { organizationId, active } }),
    onSuccess: (result) => {
      toast.success(
        result.productionActive
          ? "Activarea producției a fost confirmată."
          : "Producția a fost dezactivată; integrarea revine pe mediul de test.",
      );
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const catalogMutation = useMutation({
    mutationFn: () => refreshCatalog({ data: { organizationId } }),
    onSuccess: (result) => {
      toast.success(
        `Catalog sincronizat: ${result.counts.counties} județe, ${result.counts.cities} localități.`,
      );
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const crudMutation = useMutation({
    mutationFn: () => runCrud({ data: { organizationId, propertyId: testPropertyId } }),
    onSuccess: (result) => {
      if (result.allPassed) toast.success("Creare, actualizare și retragere: toate au trecut.");
      else {
        const failed = result.steps.find((step) => !step.ok);
        toast.error(failed ? `${failed.operation}: ${failed.message}` : "Testele nu au trecut.");
      }
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (state.isLoading) {
    return (
      <section className="panel p-5">
        <InlineLoading label="Se încarcă integrarea La Cheie…" />
      </section>
    );
  }
  if (state.isError) {
    return (
      <section className="panel p-5">
        <QueryError error={state.error} onRetry={() => state.refetch()} />
      </section>
    );
  }

  const data = state.data!;
  const tone = READINESS_TONE[data.readiness] ?? "neutral";

  return (
    <section className="panel">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
            <PortalLogo portalId="lacheie" name="La Cheie" fallback="LC" size={28} />
            La Cheie
          </h2>
          <p className="text-xs text-muted-foreground">
            Publicare de anunțuri: creare, actualizare și retragere. Fără import de lead-uri și fără
            preluare periodică.
          </p>
        </div>
        <StatusBadge tone={tone} dot>
          {LACHEIE_READINESS_LABEL[data.readiness]}
        </StatusBadge>
      </header>

      <div className="grid gap-5 p-5 lg:grid-cols-2">
        {/* Mediu */}
        <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <Label>Mediu</Label>
          <Select
            value={data.environment}
            onValueChange={(value) => environmentMutation.mutate(value as "test" | "production")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="test">Test</SelectItem>
              <SelectItem value="production">Producție</SelectItem>
            </SelectContent>
          </Select>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>Cheie API salvată: {data.hasApiKey ? "da" : "nu"}</li>
            <li>Adresă test: {data.testBaseUrlSet ? "configurată" : "lipsă"}</li>
            <li>Adresă producție: {data.productionBaseUrlSet ? "configurată" : "lipsă"}</li>
            <li>Cale anunțuri: {data.offersPath}</li>
          </ul>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-medium">Producție activată de La Cheie</p>
              <p className="text-xs text-muted-foreground">
                Se bifează doar după confirmarea primită de la portal.
                {data.productionConfirmedAt
                  ? ` Confirmat: ${new Date(data.productionConfirmedAt).toLocaleString("ro-RO")}.`
                  : ""}
              </p>
            </div>
            <Switch
              checked={data.productionActive}
              disabled={productionMutation.isPending}
              onCheckedChange={(checked) => productionMutation.mutate(checked)}
            />
          </div>
        </div>

        {/* Catalog */}
        <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <Label>Catalog La Cheie</Label>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>
              Ultima sincronizare:{" "}
              {data.catalog.fetchedAt
                ? new Date(data.catalog.fetchedAt).toLocaleString("ro-RO")
                : "niciodată"}
            </li>
            <li>Grupuri de opțiuni: {data.catalog.optionGroups}</li>
            <li>Județe: {data.catalog.counties}</li>
            <li>Localități: {data.catalog.cities}</li>
          </ul>
          {data.catalog.error ? (
            <p className="text-xs text-destructive">{data.catalog.error}</p>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={catalogMutation.isPending}
            onClick={() => catalogMutation.mutate()}
          >
            {catalogMutation.isPending ? "Se sincronizează…" : "Reîmprospătează catalogul"}
          </Button>
        </div>

        {/* Teste CRUD */}
        <div className="space-y-3 rounded-xl border border-border bg-surface p-4 lg:col-span-2">
          <Label>Teste obligatorii înainte de producție</Label>
          <div className="flex flex-wrap gap-2">
            {(["create", "update", "withdraw"] as const).map((operation) => (
              <StatusBadge key={operation} tone={data.crudTests[operation] ? "success" : "neutral"}>
                {operation === "create"
                  ? "Creare"
                  : operation === "update"
                    ? "Actualizare"
                    : "Retragere"}
                {data.crudTests[operation] ? " ✓" : ""}
              </StatusBadge>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[260px] flex-1">
              <Label htmlFor="lacheie-test-property" className="text-xs">
                Ofertă folosită la test
              </Label>
              <Select value={testPropertyId} onValueChange={setTestPropertyId}>
                <SelectTrigger id="lacheie-test-property">
                  <SelectValue placeholder="Alege oferta" />
                </SelectTrigger>
                <SelectContent>
                  {(properties.data ?? []).map((property) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              disabled={!testPropertyId || data.environment !== "test" || crudMutation.isPending}
              onClick={() => crudMutation.mutate()}
            >
              {crudMutation.isPending ? "Se rulează…" : "Rulează creare → actualizare → retragere"}
            </Button>
          </div>
          {data.environment !== "test" ? (
            <p className="text-xs text-muted-foreground">
              Testele rulează numai în mediul de test.
            </p>
          ) : null}
        </div>

        {/* Versiuni */}
        {data.versions.length ? (
          <div className="space-y-2 rounded-xl border border-border bg-surface p-4 lg:col-span-2">
            <Label>Versiuni trimise (X-Source-Version)</Label>
            <ul className="divide-y divide-border text-xs">
              {data.versions.map((version) => (
                <li
                  key={`${version.externalId}-${version.environment}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span className="font-mono">{version.externalId}</span>
                  <span className="text-muted-foreground">
                    {version.environment} • v{version.sourceVersion}
                    {version.acceptedVersion ? ` (acceptată v${version.acceptedVersion})` : ""} •{" "}
                    {version.lastOperation ?? "—"} • {version.lastStatus ?? "—"}
                  </span>
                  {version.conflict ? <StatusBadge tone="danger">Conflict</StatusBadge> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Jurnal */}
        <div className="space-y-2 rounded-xl border border-border bg-surface p-4 lg:col-span-2">
          <Label>Jurnal</Label>
          {data.logs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nicio operație înregistrată.</p>
          ) : (
            <ul className="divide-y divide-border text-xs">
              {data.logs.map((log) => (
                <li key={log.id} className="flex flex-wrap items-center gap-2 py-2">
                  <StatusBadge tone={log.success ? "success" : "danger"}>
                    {log.operation}
                  </StatusBadge>
                  <span className="text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString("ro-RO")}
                    {log.environment ? ` • ${log.environment}` : ""}
                    {log.httpStatus ? ` • HTTP ${log.httpStatus}` : ""}
                    {log.sourceVersion ? ` • v${log.sourceVersion}` : ""}
                    {log.durationMs ? ` • ${log.durationMs} ms` : ""}
                  </span>
                  {log.errorMessage ? (
                    <span className="text-destructive">{log.errorMessage}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
