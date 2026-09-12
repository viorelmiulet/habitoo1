// Superadmin → Nomenclator SIRUTA. Date de referință read-only pentru agenți;
// importul/actualizarea se face exclusiv de aici și este verificat server-side + auditat.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Building2, DatabaseZap, Landmark, MapPin, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { KpiCard } from "@/components/app/KpiCard";
import { ListSkeleton } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { SectionCard } from "@/components/app/SectionCard";
import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/errors";
import {
  getNomenclatureStats,
  importSiruta,
  type SirutaImportResult,
} from "@/lib/siruta.functions";
import { appHead } from "@/components/app/app-head";

export const Route = createFileRoute("/_authenticated/superadmin/nomenclator")({
  head: () => appHead("Habitoo CRM — nomenclator localități"),
  component: NomenclatorPage,
});

const QUERY_KEY = ["superadmin", "nomenclature"] as const;

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function NomenclatorPage() {
  const queryClient = useQueryClient();
  const fetchStats = useServerFn(getNomenclatureStats);
  const runImport = useServerFn(importSiruta);
  const [lastImport, setLastImport] = useState<SirutaImportResult | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => fetchStats(),
    staleTime: 30_000,
  });

  const importMutation = useMutation({
    mutationFn: () => runImport(),
    onSuccess: (result) => {
      setLastImport(result);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["ro-counties"] });
      queryClient.invalidateQueries({ queryKey: ["ro-localities"] });
      toast.success(
        `Nomenclator actualizat: ${result.counties} județe, ${result.uats} UAT-uri, ${result.localities} localități.`,
      );
    },
    onError: (e) => toastError(e),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nomenclator SIRUTA"
        description="Județele, UAT-urile și localitățile oficiale (INS). Date de referință: agenții le pot doar citi."
        actions={
          <Button onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
            <RefreshCw className={importMutation.isPending ? "size-4 animate-spin" : "size-4"} />
            {importMutation.isPending ? "Se importă…" : "Importă / actualizează"}
          </Button>
        }
      />

      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              label="Județe"
              value={data?.counties ?? 0}
              icon={Landmark}
              hint="42 (inclusiv București)"
            />
            <KpiCard
              label="UAT-uri"
              value={data?.uats ?? 0}
              icon={Building2}
              hint="municipii, orașe, comune"
            />
            <KpiCard
              label="Localități"
              value={data?.localities ?? 0}
              icon={MapPin}
              hint="localități componente, sate, sectoare"
            />
          </div>

          <SectionCard title="Versiune și import" icon={DatabaseZap}>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Versiune nomenclator</dt>
                <dd className="text-sm font-medium">{data?.version ?? "Neimportat"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Data importului</dt>
                <dd className="text-sm font-medium">{fmtDateTime(data?.importedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Sursă oficială</dt>
                <dd className="truncate text-sm font-medium">
                  {data?.sourceUrl ? (
                    <a className="underline" href={data.sourceUrl} target="_blank" rel="noreferrer">
                      data.gov.ro (INS)
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              Importul este idempotent: rulările repetate actualizează denumirile fără să creeze
              duplicate. Anunțurile existente care au deja localitate ca text sunt completate
              automat cu codul SIRUTA atunci când potrivirea este neambiguă; textul introdus de
              agenți nu este șters.
            </p>
            {lastImport && (
              <p className="mt-2 text-xs text-muted-foreground">
                Ultimul import: {lastImport.counties} județe · {lastImport.uats} UAT-uri ·{" "}
                {lastImport.localities} localități · {lastImport.propertiesMigrated} anunțuri
                completate din {lastImport.propertiesChecked} verificate.
              </p>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
