/**
 * Card Superadmin pentru integrarea La Cheie: mediu (production-only),
 * testarea conexiunii, catalogul, versiunile trimise și jurnalul operațiilor.
 * Cheia API nu este niciodată afișată: se salvează din cardul de conexiuni.
 *
 * Testarea conexiunii și sincronizarea catalogului sunt read-only. Publicarea
 * reală (creare/actualizare/retragere) se face doar din pagina proprietății,
 * prin fluxul normal cu aprobare — niciodată automat la încărcarea paginii.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/app/StatusBadge";
import { PortalLogo } from "@/components/app/PortalLogo";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { LACHEIE_READINESS_LABEL } from "@/lib/portals/lacheie/config";
import {
  getLaCheieState,
  refreshLaCheieCatalog,
  testLaCheieConnection,
} from "@/lib/portals/lacheie.functions";

const READINESS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  connected: "success",
  error: "danger",
  not_configured: "neutral",
};

export function LaCheieCard({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const loadState = useServerFn(getLaCheieState);
  const refreshCatalog = useServerFn(refreshLaCheieCatalog);
  const testConnection = useServerFn(testLaCheieConnection);

  const state = useQuery({
    queryKey: ["lacheie-state", organizationId],
    queryFn: () => loadState({ data: { organizationId } }),
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["lacheie-state", organizationId] });

  const testMutation = useMutation({
    mutationFn: () => testConnection({ data: { organizationId } }),
    onSuccess: (result) => {
      toast.success(`Production conectat. ${result.detail ?? ""}`.trim());
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message);
      invalidate();
    },
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
        {/* Conexiune */}
        <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <Label>Conexiune</Label>
            <StatusBadge tone="neutral">Production</StatusBadge>
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>Cheie API salvată: {data.hasApiKey ? "da" : "nu"}</li>
            <li className="font-mono break-all">{data.baseUrl}</li>
            <li>Cale anunțuri: {data.offersPath}</li>
            {data.lastError ? (
              <li className="text-destructive">Ultima eroare: {data.lastError}</li>
            ) : null}
          </ul>
          <Button
            size="sm"
            disabled={!data.hasApiKey || testMutation.isPending}
            onClick={() => testMutation.mutate()}
          >
            {testMutation.isPending ? "Se testează…" : "Testează conexiunea"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Testarea folosește GET /account: nu creează, nu modifică și nu retrage anunțuri.
          </p>
        </div>

        {/* Catalog */}
        <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <Label>Catalog La Cheie (/options, /counties, /cities)</Label>
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
                    v{version.sourceVersion}
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
