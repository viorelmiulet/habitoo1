import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Search, UserX } from "lucide-react";
import { appHead } from "@/components/app/app-head";
import { PageHeader } from "@/components/app/PageHeader";
import { SuperadminGate } from "@/components/app/SuperadminGate";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { ListPagination } from "@/components/app/ListPagination";
import { OutreachImportDialog } from "@/components/app/OutreachImportDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getOutreachDetail, excludeOutreachRecipient } from "@/lib/outreach.functions";
import { outreachStatuses, outreachStatusLabels, type OutreachRecipient } from "@/lib/outreach";

export const Route = createFileRoute("/_authenticated/superadmin/campanii-email/$id")({
  head: () => { const title = "Destinatarii campaniei | Habitoo CRM"; const description = "Destinatari și excluderi globale, cu filtre după agenție, email, oraș și stare."; return { ...appHead(title), meta: [...appHead(title).meta, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }; },
  component: () => <SuperadminGate redirectTo="/app"><OutreachDetailPage /></SuperadminGate>,
});

function OutreachDetailPage() {
  const { id } = Route.useParams();
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | (typeof outreachStatuses)[number]>("");
  const [city, setCity] = useState("");
  const [page, setPage] = useState(1);
  const [exclude, setExclude] = useState<OutreachRecipient | null>(null);
  const fetchDetail = useServerFn(getOutreachDetail);
  const excludeRecipient = useServerFn(excludeOutreachRecipient);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["outreach", id, q, status, city, page], queryFn: () => fetchDetail({ data: { listId: id, q, status, city, page } }) });
  const mutation = useMutation({ mutationFn: (recipientId: string) => excludeRecipient({ data: { id: recipientId } }), onSuccess: () => { setExclude(null); qc.invalidateQueries({ queryKey: ["outreach"] }); } });
  const data = query.data;
  return <div className="space-y-6">
    <Button asChild variant="ghost" size="sm"><Link to="/superadmin/campanii-email"><ArrowLeft className="size-4" />Liste destinatari</Link></Button>
    <PageHeader title={data?.name ?? "Destinatari"} actions={data ? <OutreachImportDialog listId={id} listName={data.name} /> : undefined} />
    <form className="flex flex-wrap gap-3" onSubmit={e => { e.preventDefault(); setQ(draft.trim()); setPage(1); }}>
      <Input aria-label="Caută agenție sau email" placeholder="Agenție sau email" className="min-w-0 flex-1 basis-64" maxLength={200} value={draft} onChange={e => setDraft(e.target.value)} />
      <Select value={status || "all"} onValueChange={v => { setStatus(outreachStatuses.find(s => s === v) ?? ""); setPage(1); }}><SelectTrigger aria-label="Stare" className="w-44"><SelectValue placeholder="Toate stările" /></SelectTrigger><SelectContent><SelectItem value="all">Toate stările</SelectItem>{outreachStatuses.map(s => <SelectItem key={s} value={s}>{outreachStatusLabels[s]}</SelectItem>)}</SelectContent></Select>
      <Select value={city || "all"} onValueChange={v => { setCity(v === "all" ? "" : v); setPage(1); }}><SelectTrigger aria-label="Oraș" className="w-44"><SelectValue placeholder="Toate orașele" /></SelectTrigger><SelectContent><SelectItem value="all">Toate orașele</SelectItem>{data?.cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
      <Button type="submit"><Search className="size-4" />Caută</Button>
    </form>
    {query.isLoading ? <InlineLoading /> : query.error ? <QueryError error={query.error} onRetry={() => query.refetch()} /> : <>
      <p className="text-sm text-muted-foreground">{data?.total ?? 0} destinatari</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border text-muted-foreground"><tr>{["Agenție / email", "Oraș / regiune", "Telefon", "Website / sursă", "Tip adresă", "Stare", ""].map((h, i) => <th key={i} className="p-3">{h}</th>)}</tr></thead><tbody>
        {data?.rows.map(row => <tr key={row.id} className="border-b border-border hover:bg-muted/40"><td className="p-3"><p className="font-medium">{row.agency_name || "—"}</p><p className="break-all text-muted-foreground">{row.email}</p></td><td className="p-3">{row.city || "—"}<p className="text-muted-foreground">{row.region}</p></td><td className="p-3 whitespace-nowrap">{row.phone || "—"}</td><td className="max-w-48 break-all p-3 text-xs">{row.website || "—"}<p className="mt-1 text-muted-foreground">{row.source_url}</p></td><td className="p-3">{row.address_type || "—"}</td><td className="p-3"><span className="whitespace-nowrap rounded-md bg-muted px-2 py-1 text-xs">{outreachStatusLabels[row.status]}</span>{row.error ? <p className="mt-1 max-w-40 break-words text-xs text-destructive">{row.error}</p> : null}{row.sent_at ? <p className="mt-1 text-xs text-muted-foreground">{new Date(row.sent_at).toLocaleString("ro-RO")}</p> : null}</td><td className="p-3"><Button size="sm" variant="outline" disabled={row.status === "unsubscribed"} onClick={() => { mutation.reset(); setExclude(row); }}><UserX className="size-4" />Exclude</Button></td></tr>)}
        {!data?.rows.length ? <tr><td colSpan={7} className="p-12 text-center text-muted-foreground">Niciun destinatar pentru filtrele alese.</td></tr> : null}
      </tbody></table></div>
      <ListPagination page={page} pages={Math.ceil((data?.total ?? 0) / 24)} onGo={setPage} />
    </>}
    <Dialog open={Boolean(exclude)} onOpenChange={o => { if (!o && !mutation.isPending) setExclude(null); }}><DialogContent><DialogHeader><DialogTitle>Exclude destinatarul?</DialogTitle><DialogDescription className="break-all">{exclude?.email} va fi exclus din toate listele și din importurile viitoare.</DialogDescription></DialogHeader>{mutation.error ? <p role="alert" className="text-destructive">{mutation.error.message}</p> : null}<div className="flex justify-end gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => setExclude(null)}>Renunță</Button><Button variant="destructive" disabled={mutation.isPending} onClick={() => { if (exclude) mutation.mutate(exclude.id); }}><UserX className="size-4" />{mutation.isPending ? "Se exclude…" : "Exclude"}</Button></div></DialogContent></Dialog>
  </div>;
}