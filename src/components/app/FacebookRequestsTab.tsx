import { useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, MessageCircle, Phone, SearchX, Send, Sparkles, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchPlacesPicker } from "@/components/app/SearchPlacesPicker";
import { SendOfferDialog } from "@/components/app/SendOfferDialog";
import { ListPagination, PageRange, PageSizeSelect } from "@/components/app/ListPagination";
import { useListState } from "@/hooks/use-list-state";
import { useCurrentUser } from "@/hooks/use-session";
import { normalizeListPageSize } from "@/lib/list-page-size";
import { parsePlaceChoices } from "@/lib/search-places";
import { offerPhone } from "@/lib/offer-client";
import { REQUEST_PROPERTY_TYPES, REQUEST_TRANSACTION_LABELS } from "@/lib/social-requests";
import {
  addSocialRequestLead, getSocialRequestFacets, getSocialRequestMatches, getSocialRequests, type SocialRequest,
} from "@/lib/social-requests.functions";

const ALL = "__all";
const FROM = "/_authenticated/app/anunturi-particulari" as const;
const DAYS = [{ value: "0", label: "De azi" }, { value: "2", label: "Ultimele 2 zile" }, { value: "3", label: "Ultimele 3 zile" }, { value: "7", label: "Ultimele 7 zile" }];
const PUBLISHER: Record<string, string> = { particular: "Particular", neclar: "Neclar", agentie: "Agenție" };
const num = (v: string) => { const n = Number(v.replace(/\s/g, "")); return v.trim() && Number.isFinite(n) && n >= 0 ? n : undefined; };
const fmt = (n: number) => new Intl.NumberFormat("ro-RO").format(n);

export function budgetLabel(r: Pick<SocialRequest, "budgetMin" | "budgetMax" | "currency">): string | null {
  const c = r.currency ?? "EUR";
  if (r.budgetMin !== null && r.budgetMax !== null && r.budgetMin !== r.budgetMax) return `${fmt(r.budgetMin)}–${fmt(r.budgetMax)} ${c}`;
  const v = r.budgetMax ?? r.budgetMin;
  return v === null ? null : `${r.budgetMax !== null ? "max. " : "min. "}${fmt(v)} ${c}`;
}

export function FacebookRequestsTab() {
  const search = useSearch({ from: FROM });
  const navigate = useNavigate({ from: FROM });
  const { data: user } = useCurrentUser();
  const load = useServerFn(getSocialRequests), loadFacets = useServerFn(getSocialRequestFacets);
  const page = (search.pagina ?? 1) - 1, pageSize = normalizeListPageSize(search.perPagina);
  const rooms = (search.camere ?? "").split(",").map(Number).filter((n) => n >= 1 && n <= 5);
  const transaction = search.tranzactie === "rent" ? "inchiriere" : search.tranzactie === "sale" ? "cumparare" : undefined;
  const [budget, setBudget] = useState({ min: search.pretMin?.toString() ?? "", max: search.pretMax?.toString() ?? "" });
  const go = (patch: Partial<typeof search>) => navigate({ search: (prev) => ({ ...prev, ...patch, lista: "cereri", pagina: undefined }), replace: true });
  const clear = useListState({
    list: "map-cereri", userId: user?.userId, search,
    apply: (saved) => void navigate({ search: { ...(saved as typeof search), lista: "cereri" }, replace: true, resetScroll: false }),
  });
  const facets = useQuery({ queryKey: ["social-request-facets"], queryFn: () => loadFacets(), staleTime: 5 * 60_000 });
  const list = useQuery({
    queryKey: ["social-requests", search.locuri, transaction, search.tip, rooms.join(","), search.pretMin, search.pretMax, search.zile, page, pageSize],
    queryFn: () => load({ data: {
      transaction, propertyType: search.tip, rooms: rooms.length ? rooms : undefined,
      budgetMin: search.pretMin, budgetMax: search.pretMax, places: parsePlaceChoices(search.locuri),
      days: search.zile, page, pageSize,
    } }),
    placeholderData: keepPreviousData,
  });
  const total = list.data?.total ?? 0, pages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = Boolean(search.locuri || transaction || search.tip || rooms.length || search.pretMin !== undefined || search.pretMax !== undefined || search.zile !== undefined);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Cereri publicate în grupuri publice de Facebook, din ultimele 30 de zile. Sunt date personale: folosește-le doar pentru a răspunde cererii.</p>
      <form data-tour="requests-filters" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); go({ pretMin: num(budget.min), pretMax: num(budget.max) }); }}>
        <Select value={transaction ? search.tranzactie : ALL} onValueChange={(v) => go({ tranzactie: v === ALL ? undefined : (v as "sale" | "rent") })}>
          <SelectTrigger aria-label="Tranzacție"><SelectValue placeholder="Tranzacție" /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>Orice tranzacție</SelectItem><SelectItem value="sale">Cumpărare</SelectItem><SelectItem value="rent">Închiriere</SelectItem></SelectContent>
        </Select>
        <Select value={search.tip ?? ALL} onValueChange={(v) => go({ tip: v === ALL ? undefined : v })}>
          <SelectTrigger aria-label="Tip proprietate"><SelectValue placeholder="Tip" /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>Orice tip</SelectItem>{REQUEST_PROPERTY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
        <SearchPlacesPicker options={facets.data?.places ?? []} value={search.locuri ?? ""} onApply={(locuri) => go({ locuri: locuri || undefined })} />
        <Select value={search.zile === undefined ? ALL : String(search.zile)} onValueChange={(v) => go({ zile: v === ALL ? undefined : Number(v) })}>
          <SelectTrigger aria-label="Cereri noi"><SelectValue placeholder="Cereri noi" /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>Toate cererile</SelectItem>{DAYS.map((d) => <SelectItem key={d.value} value={d.value}>Cereri noi: {d.label.toLowerCase()}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Camere">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="flex items-center gap-1.5 text-sm">
              <Checkbox checked={rooms.includes(n)} onCheckedChange={(c) => { const next = c ? [...rooms, n] : rooms.filter((r) => r !== n); go({ camere: next.length ? next.sort().join(",") : undefined }); }} />
              {n === 5 ? "5+" : n} cam.
            </label>
          ))}
        </div>
        <Input inputMode="numeric" aria-label="Buget minim" placeholder="Buget minim" value={budget.min} onChange={(e) => setBudget((b) => ({ ...b, min: e.target.value }))} />
        <Input inputMode="numeric" aria-label="Buget maxim" placeholder="Buget maxim" value={budget.max} onChange={(e) => setBudget((b) => ({ ...b, max: e.target.value }))} />
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">Caută</Button>
          {hasFilters && <Button type="button" variant="ghost" onClick={() => { clear(); setBudget({ min: "", max: "" }); void navigate({ search: { lista: "cereri" }, replace: true }); }}>Șterge filtre</Button>}
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{total} cereri · <PageRange page={page + 1} pageSize={pageSize} total={total} /></span>
        <PageSizeSelect value={pageSize} onChange={(size) => navigate({ search: (prev) => ({ ...prev, pagina: undefined, perPagina: size === 15 ? undefined : size }), replace: true })} />
      </div>
      <ListPagination page={page + 1} pages={pages} onGo={(p) => navigate({ search: (prev) => ({ ...prev, pagina: p > 1 ? p : undefined }) })} />
      {list.isError ? <p className="text-destructive">Cererile nu pot fi încărcate acum. Reîncearcă.</p>
        : list.isLoading ? <div className="flex flex-col gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
        : total === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
            <SearchX className="size-8 text-muted-foreground" />
            <p className="font-medium">Nicio cerere găsită</p>
            <p className="text-sm text-muted-foreground">{hasFilters ? "Încearcă alte filtre." : "Cererile apar aici după primul import."}</p>
          </div>
        ) : <div className="flex flex-col gap-3">{list.data?.items.map((r) => <RequestRow key={r.id} request={r} />)}</div>}
      <ListPagination page={page + 1} pages={pages} onGo={(p) => navigate({ search: (prev) => ({ ...prev, pagina: p > 1 ? p : undefined }) })} />
    </div>
  );
}

function RequestRow({ request: r }: { request: SocialRequest }) {
  const [expanded, setExpanded] = useState(false);
  const [matchesOpen, setMatchesOpen] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);
  const addLead = useServerFn(addSocialRequestLead);
  const lead = useMutation({
    mutationFn: () => addLead({ data: { id: r.id } }),
    onSuccess: (res) => { setLeadId(res.leadId); toast.success("Lead adăugat, fără acord marketing."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lead-ul nu a putut fi adăugat."),
  });
  const text = r.text ?? "";
  const long = text.length > 280;
  const place = [r.zones.join(", ") || null, r.city, r.county].filter(Boolean).join(", ");
  const budget = budgetLabel(r);
  const date = r.postedAt ?? r.firstSeenAt;
  const phone = r.phone ? offerPhone(r.phone) : "";
  return (
    <article className="space-y-3 rounded-lg border border-border bg-card p-4" data-testid="social-request">
      <div className="flex flex-wrap gap-1.5">
        {r.transactionType && <Badge variant="secondary">{REQUEST_TRANSACTION_LABELS[r.transactionType as keyof typeof REQUEST_TRANSACTION_LABELS] ?? r.transactionType}</Badge>}
        {r.propertyType && <Badge variant="outline">{r.propertyType}</Badge>}
        {r.rooms !== null && <Badge variant="outline">{r.rooms} camere</Badge>}
        {budget && <Badge variant="outline">Buget {budget}</Badge>}
        {place && <Badge variant="outline">{place}</Badge>}
        {r.publisherType && <Badge variant="outline">{PUBLISHER[r.publisherType] ?? r.publisherType}</Badge>}
      </div>
      {text && (
        <div className="text-sm">
          <p className="whitespace-pre-line">{expanded || !long ? text : `${text.slice(0, 280).trimEnd()}…`}</p>
          {long && <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setExpanded((v) => !v)}>{expanded ? "Arată mai puțin" : "Arată tot"}</Button>}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {new Date(date).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })}
        {r.groupName ? ` · ${r.groupName}` : ""}{r.authorName ? ` · ${r.authorName}` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {r.url && <Button asChild variant="outline" size="sm"><a href={r.url} target="_blank" rel="noopener noreferrer">Vezi postarea pe Facebook <ExternalLink className="size-4" /></a></Button>}
        {phone && <>
          <Button asChild variant="outline" size="sm"><a href={`tel:+${phone}`}><Phone className="size-4" /> {r.phone}</a></Button>
          <Button asChild variant="outline" size="sm"><a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-4" /> WhatsApp</a></Button>
        </>}
        <Button size="sm" variant="secondary" onClick={() => setMatchesOpen(true)}><Sparkles className="size-4" /> Proprietăți potrivite</Button>
        {leadId ? <Button asChild size="sm" variant="ghost"><Link to="/app/leads/$id" params={{ id: leadId }}>Deschide lead-ul</Link></Button>
          : <Button size="sm" variant="ghost" disabled={lead.isPending} onClick={() => lead.mutate()}><UserPlus className="size-4" /> Adaugă ca lead</Button>}
      </div>
      {matchesOpen && <MatchesDialog request={r} open={matchesOpen} onOpenChange={setMatchesOpen} />}
    </article>
  );
}

function MatchesDialog({ request, open, onOpenChange }: { request: SocialRequest; open: boolean; onOpenChange: (o: boolean) => void }) {
  const loadMatches = useServerFn(getSocialRequestMatches);
  const q = useQuery({ queryKey: ["social-request-matches", request.id], queryFn: () => loadMatches({ data: { id: request.id } }), enabled: open });
  const [sendFor, setSendFor] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[100dvh] max-w-2xl overflow-y-auto max-sm:h-[100dvh] max-sm:max-w-full max-sm:rounded-none">
        <DialogHeader><DialogTitle>Proprietăți potrivite</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Proprietățile active ale agenției care se potrivesc ca tranzacție, tip, camere, buget (±10%) și zonă.</p>
        {q.isLoading ? <Skeleton className="h-24" /> : q.isError ? <p className="text-destructive">Potrivirile nu pot fi încărcate.</p>
          : !q.data?.items.length ? <p className="py-6 text-center text-sm text-muted-foreground">Nicio proprietate activă nu se potrivește.</p>
          : <ul className="divide-y divide-border">{q.data.items.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
              <Badge>{p.score}%</Badge>
              <div className="min-w-0 flex-1">
                <Link to="/app/properties/$id" params={{ id: p.id }} className="font-medium hover:underline">{p.title}</Link>
                <p className="text-xs text-muted-foreground">{[p.code, p.price !== null ? `${fmt(p.price)} ${p.currency ?? ""}` : null, p.rooms !== null ? `${p.rooms} camere` : null, [p.district, p.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</p>
              </div>
              <Button size="sm" variant="outline" disabled={!p.canSend} title={p.canSend ? undefined : "Oferta nu este disponibilă public"} onClick={() => setSendFor(p.id)}><Send className="size-4" /> Trimite oferta</Button>
            </li>))}</ul>}
        {sendFor && <SendOfferDialog propertyId={sendFor} open={Boolean(sendFor)} onOpenChange={(o) => { if (!o) setSendFor(null); }} initialPhone={request.phone ?? ""} />}
      </DialogContent>
    </Dialog>
  );
}
