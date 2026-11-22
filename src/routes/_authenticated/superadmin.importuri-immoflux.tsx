import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/LoadingState";
import { EmptyState } from "@/components/app/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { appHead } from "@/components/app/app-head";
import { formatDateTime } from "@/lib/format";
import { listImmofluxImports } from "@/lib/property-import/immoflux/api-import.functions";

export const Route = createFileRoute("/_authenticated/superadmin/importuri-immoflux")({
  head: () => appHead("Habitoo CRM — importuri IMMOFLUX"),
  component: ImmofluxImportsPage,
});

const STATUS: Record<string, string> = { queued: "În așteptare", running: "În curs", done: "Finalizat", stopped: "Oprit (dezactivat)", error: "Eșuat" };

function ImmofluxImportsPage() {
  const list = useServerFn(listImmofluxImports);
  const jobs = useQuery({ queryKey: ["superadmin", "immoflux-imports"], queryFn: () => list({ data: {} }), refetchInterval: 15_000 });
  return <div className="space-y-6">
    <PageHeader title="Importuri IMMOFLUX" description="Istoricul preluărilor de anunțuri din IMMOFLUX, pe agenții." />
    {jobs.isPending ? <ListSkeleton /> : jobs.isError ? <p role="alert" className="text-sm text-destructive">Istoricul nu poate fi citit.</p>
      : jobs.data.length === 0 ? <EmptyState title="Niciun import încă" description="Pornește un import din pagina agenției, secțiunea „Import IMMOFLUX”." />
      : <div className="space-y-4">
        <div className="overflow-x-auto rounded-lg border border-border"><Table>
          <TableHeader><TableRow><TableHead>Dată</TableHead><TableHead>Agenție</TableHead><TableHead>Pornit de</TableHead><TableHead>Stare</TableHead><TableHead className="text-right">Importate</TableHead><TableHead className="text-right">Existente</TableHead><TableHead className="text-right">Erori</TableHead><TableHead className="text-right">Poze eșuate</TableHead><TableHead>Coduri nemapate</TableHead></TableRow></TableHeader>
          <TableBody>{jobs.data.map((j) => <TableRow key={j.id}>
            <TableCell className="whitespace-nowrap">{formatDateTime(j.createdAt)}</TableCell>
            <TableCell>{j.organizationName ?? "—"}</TableCell>
            <TableCell>{j.requestedByName ?? "—"}</TableCell>
            <TableCell>{STATUS[j.status] ?? j.status}{j.status === "running" && j.lastPage ? ` (pagina ${j.nextPage}/${j.lastPage})` : ""}</TableCell>
            <TableCell className="text-right">{j.imported}</TableCell>
            <TableCell className="text-right">{j.existing}</TableCell>
            <TableCell className="text-right">{j.errors}</TableCell>
            <TableCell className="text-right">{j.imagesFailed}/{j.imagesTotal}</TableCell>
            <TableCell className="max-w-xs text-xs">{j.unmappedCodes.length ? j.unmappedCodes.join(", ") : "—"}</TableCell>
          </TableRow>)}</TableBody>
        </Table></div>
        {jobs.data.filter((j) => j.report.length > 0 || j.lastError).map((j) => <details key={j.id} className="rounded-lg border border-border p-3 text-sm">
          <summary className="cursor-pointer font-medium">{formatDateTime(j.createdAt)} · {j.organizationName ?? "—"} · {j.report.length} mențiuni</summary>
          {j.lastError ? <p className="mt-2 text-destructive">{j.lastError}</p> : null}
          <ul className="mt-2 space-y-1">{j.report.map((r, i) => <li key={i}><span className="text-muted-foreground">#{r.immofluxId ?? "?"}{r.ref ? ` (${r.ref})` : ""}:</span> {r.message}</li>)}</ul>
        </details>)}
      </div>}
  </div>;
}
