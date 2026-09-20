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
import {
  getImobiliareLocationStats,
  importImobiliareLocationsFile,
} from "@/lib/imobiliare-locations.functions";
import { appHead } from "@/components/app/app-head";
import { MarketPriceIndexCard } from "@/components/superadmin/MarketPriceIndexCard";
import { PostalCodeBackfillCard } from "@/components/superadmin/PostalCodeBackfillCard";
import { CollectorSourcesCard } from "@/components/superadmin/CollectorSourcesCard";
import { MarketQuerySourcesCard } from "@/components/superadmin/MarketQuerySourcesCard";


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

          <ImobiliareLocationsCard />

          <MarketPriceIndexCard />
          <PostalCodeBackfillCard />
          <CollectorSourcesCard />
          <MarketQuerySourcesCard />

        </>
      )}
    </div>
  );
}

const IMOBILIARE_KEY = ["superadmin", "imobiliare-locations"] as const;

/** Zonele Imobiliare.ro: se încarcă din fișierul livrat de portal. */
function ImobiliareLocationsCard() {
  const queryClient = useQueryClient();
  const fetchStats = useServerFn(getImobiliareLocationStats);
  const runImport = useServerFn(importImobiliareLocationsFile);
  const [file, setFile] = useState<File | null>(null);

  const { data } = useQuery({
    queryKey: IMOBILIARE_KEY,
    queryFn: () => fetchStats(),
    staleTime: 30_000,
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Alege fișierul de locații primit de la Imobiliare.ro.");
      const content = await file.text();
      return runImport({ data: { content, fileName: file.name } });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: IMOBILIARE_KEY });
      toast.success(
        `Locații Imobiliare.ro actualizate: ${result.imported} înregistrări (${result.zones} zone).`,
      );
    },
    onError: (e) => toastError(e),
  });

  return (
    <SectionCard title="Locații Imobiliare.ro" icon={MapPin}>
      <dl className="grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Înregistrări</dt>
          <dd className="text-sm font-medium">{data?.total ?? 0}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Zone publicabile</dt>
          <dd className="text-sm font-medium">{data?.zones ?? 0}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Ultima încărcare</dt>
          <dd className="text-sm font-medium">{fmtDateTime(data?.syncedAt)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".sql,.csv,.txt"
          className="text-sm"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <Button
          variant="outline"
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending || !file}
        >
          <RefreshCw className={importMutation.isPending ? "size-4 animate-spin" : "size-4"} />
          {importMutation.isPending ? "Se încarcă…" : "Încarcă fișierul de locații"}
        </Button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Publicarea pe Imobiliare.ro cere o zonă exactă din lista lor. Aceste date se încarcă doar
        din fișierul primit de la portal (SQL sau CSV, cu coloanele id, parent_id, depth, name); nu
        sunt deduse și nu sunt preluate automat. Reîncărcarea este idempotentă. Fără acest fișier,
        publicarea pe Imobiliare.ro este blocată cu mesaj explicit, nu aproximată.
      </p>
    </SectionCard>
  );
}
