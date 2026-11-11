import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, List } from "lucide-react";
import { appHead } from "@/components/app/app-head";
import { PageHeader } from "@/components/app/PageHeader";
import { SuperadminGate } from "@/components/app/SuperadminGate";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { OutreachImportDialog } from "@/components/app/OutreachImportDialog";
import { Button } from "@/components/ui/button";
import { getOutreachLists } from "@/lib/outreach.functions";
import { outreachStatuses, outreachStatusLabels } from "@/lib/outreach";

export const Route = createFileRoute("/_authenticated/superadmin/campanii-email/")({
  head: () => { const title = "Campanii email — liste destinatari | Habitoo CRM"; const description = "Administrarea listelor de destinatari, importuri CSV și excluderi globale pentru Superadmin."; return { ...appHead(title), meta: [...appHead(title).meta, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }; },
  component: () => <SuperadminGate redirectTo="/app"><OutreachListsPage /></SuperadminGate>,
});

function OutreachListsPage() {
  const fetchLists = useServerFn(getOutreachLists);
  const query = useQuery({ queryKey: ["outreach", "lists"], queryFn: () => fetchLists() });
  return <div className="space-y-6">
    <PageHeader title="Campanii email" actions={<OutreachImportDialog />} />
    {query.isLoading ? <InlineLoading /> : query.error ? <QueryError error={query.error} onRetry={() => query.refetch()} /> : query.data?.length ?
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border text-muted-foreground"><tr><th className="p-3">Listă</th><th className="p-3">Total</th>{outreachStatuses.map(s => <th key={s} className="p-3">{outreachStatusLabels[s]}</th>)}<th className="p-3"><span className="sr-only">Deschide</span></th></tr></thead><tbody>
        {query.data.map(list => <tr key={list.id} className="border-b border-border hover:bg-muted/40"><td className="p-3"><Link className="font-semibold text-primary underline-offset-4 hover:underline" to="/superadmin/campanii-email/$id" params={{ id: list.id }}>{list.name}</Link><p className="mt-1 text-xs text-muted-foreground">{new Date(list.created_at).toLocaleDateString("ro-RO")}</p></td><td className="p-3 font-semibold">{list.total}</td>{outreachStatuses.map(s => <td className="p-3 tabular-nums" key={s}>{list.counts[s]}</td>)}<td className="p-3"><Button variant="ghost" size="icon" asChild><Link aria-label={`Deschide ${list.name}`} to="/superadmin/campanii-email/$id" params={{ id: list.id }}><ArrowRight className="size-4" /></Link></Button></td></tr>)}
      </tbody></table></div> : <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground"><List className="size-10" /><p>Nicio listă de destinatari.</p></div>}
  </div>;
}