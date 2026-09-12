/**
 * Colaborare Habitoo: rețeaua internă de colaborare între agențiile din platformă.
 *
 * Trei perspective într-o singură pagină:
 *  1. Oferte partenere — proprietățile marcate pentru colaborare de ALTE agenții;
 *  2. Propunerile mele — clienții pe care i-am propus pe ofertele altora;
 *  3. Cereri primite — cine a propus un client pe proprietățile agenției mele.
 *
 * Datele vin exclusiv prin server functions cu proiecție de coloane sigure:
 * nu se expun proprietarul, notele interne sau agentul agenției sursă.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Building2, Handshake, Inbox, MessageCircle, Search, Send, X } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { CardGridSkeleton } from "@/components/app/LoadingState";
import { EmptyState } from "@/components/app/EmptyState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-session";
import { toastError } from "@/lib/errors";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { propertyTypeLabels, transactionLabels } from "@/lib/labels";
import {
  COLLAB_STATUS_LABELS,
  createCollaborationProposal,
  getCollaborationFacets,
  getCollaborationOffer,
  getCollaborationProposal,
  listCollaborationOffers,
  listCollaborationProposals,
  postCollaborationMessage,
  setCollaborationProposalStatus,
  type CollaborationOffer,
  type CollaborationProposalStatus,
} from "@/lib/collaboration.functions";
import { appHead } from "@/components/app/app-head";

export const Route = createFileRoute("/_authenticated/app/collaboration")({
  head: () => appHead("Habitoo CRM — colaborare"),
  component: CollaborationPage,
});

const statusTone: Record<
  CollaborationProposalStatus,
  "primary" | "success" | "info" | "neutral" | "danger"
> = {
  pending: "info",
  accepted: "success",
  viewing: "primary",
  declined: "danger",
  closed: "neutral",
};

type Filters = {
  q: string;
  city: string;
  type: string;
  transaction: "all" | "sale" | "rent";
  priceMin: string;
  priceMax: string;
  rooms: string;
  surfaceMin: string;
};

const emptyFilters: Filters = {
  q: "",
  city: "all",
  type: "all",
  transaction: "all",
  priceMin: "",
  priceMax: "",
  rooms: "",
  surfaceMin: "",
};

function num(value: string): number | null {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
}

function CollaborationPage() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [proposeFor, setProposeFor] = useState<CollaborationOffer | null>(null);
  const [detailOffer, setDetailOffer] = useState<CollaborationOffer | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);

  const fetchOffers = useServerFn(listCollaborationOffers);
  const fetchFacets = useServerFn(getCollaborationFacets);
  const fetchProposals = useServerFn(listCollaborationProposals);

  const participating = user?.organization?.collaboration_enabled !== false;

  const facets = useQuery({
    queryKey: ["collab-facets"],
    enabled: participating,
    queryFn: () => fetchFacets(),
  });

  const offers = useQuery({
    queryKey: ["collab-offers", filters],
    enabled: participating,
    queryFn: () =>
      fetchOffers({
        data: {
          q: filters.q.trim() || undefined,
          city: filters.city,
          propertyType: filters.type,
          transaction: filters.transaction,
          priceMin: num(filters.priceMin),
          priceMax: num(filters.priceMax),
          roomsMin: num(filters.rooms),
          surfaceMin: num(filters.surfaceMin),
        },
      }),
  });

  const proposals = useQuery({
    queryKey: ["collab-proposals"],
    queryFn: () => fetchProposals(),
  });

  const incomingPending = (proposals.data?.incoming ?? []).filter(
    (p) => p.status === "pending",
  ).length;
  const partnerAgencies = useMemo(() => {
    const grouped = new Map<
      string,
      { id: string; name: string; city: string | null; offers: CollaborationOffer[] }
    >();
    for (const offer of offers.data ?? []) {
      const agency = grouped.get(offer.agencyId) ?? {
        id: offer.agencyId,
        name: offer.agencyName,
        city: offer.agencyCity,
        offers: [],
      };
      agency.offers.push(offer);
      grouped.set(offer.agencyId, agency);
    }
    return [...grouped.values()].sort(
      (a, b) => b.offers.length - a.offers.length || a.name.localeCompare(b.name, "ro"),
    );
  }, [offers.data]);

  return (
    <>
      <PageHeader
        title="Colaborare Habitoo"
        description="Proprietăți deschise spre colaborare de alte agenții Habitoo. Propui un client, comunicați direct, comisionul de colaborare este cel afișat de agenția care deține mandatul."
      />

      {/* Agenția a ieșit din rețea: ofertele dispar, dar discuțiile în curs rămân. */}
      {!participating ? (
        <div className="panel border-warning/40 bg-warning/10 p-4 text-sm">
          <p className="font-medium">Agenția ta nu participă la Colaborare Habitoo</p>
          <p className="mt-1 text-muted-foreground">
            Ofertele partenere nu sunt disponibile, iar proprietățile tale nu mai apar la celelalte
            agenții. Propunerile începute rămân aici, ca să poți continua discuțiile. Poți reactiva
            participarea din Setări → Agenție.
          </p>
        </div>
      ) : null}

      <Tabs defaultValue={participating ? "offers" : "outgoing"}>
        <TabsList className="flex-wrap">
          {participating ? (
            <TabsTrigger value="offers">Oferte partenere ({offers.data?.length ?? 0})</TabsTrigger>
          ) : null}
          <TabsTrigger value="outgoing">
            Propunerile mele ({proposals.data?.outgoing.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="incoming">
            Cereri primite ({proposals.data?.incoming.length ?? 0})
            {incomingPending > 0 ? (
              <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                {incomingPending}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="offers" className="space-y-4">
          <div className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative sm:col-span-2">
              <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
              <Input
                value={filters.q}
                placeholder="Caută după titlu, oraș, zonă sau referință"
                className="pl-9"
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              />
            </div>
            <Select
              value={filters.city}
              onValueChange={(v) => setFilters((f) => ({ ...f, city: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Oraș" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toate orașele</SelectItem>
                {(facets.data?.cities ?? []).map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.type}
              onValueChange={(v) => setFilters((f) => ({ ...f, type: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Tip" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toate tipurile</SelectItem>
                {(facets.data?.types ?? []).map((t) => (
                  <SelectItem key={t} value={t}>
                    {propertyTypeLabels[t] ?? t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.transaction}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, transaction: v as Filters["transaction"] }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Tranzacție" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Vânzare și închiriere</SelectItem>
                <SelectItem value="sale">Vânzare</SelectItem>
                <SelectItem value="rent">Închiriere</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={filters.priceMin}
              inputMode="numeric"
              placeholder="Preț minim"
              onChange={(e) => setFilters((f) => ({ ...f, priceMin: e.target.value }))}
            />
            <Input
              value={filters.priceMax}
              inputMode="numeric"
              placeholder="Preț maxim"
              onChange={(e) => setFilters((f) => ({ ...f, priceMax: e.target.value }))}
            />
            <Input
              value={filters.rooms}
              inputMode="numeric"
              placeholder="Camere (minim)"
              onChange={(e) => setFilters((f) => ({ ...f, rooms: e.target.value }))}
            />
            <div className="flex gap-2">
              <Input
                value={filters.surfaceMin}
                inputMode="numeric"
                placeholder="Suprafață min. (m²)"
                onChange={(e) => setFilters((f) => ({ ...f, surfaceMin: e.target.value }))}
              />
              <Button
                variant="outline"
                onClick={() => setFilters(emptyFilters)}
                aria-label="Resetează filtrele"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          {offers.isLoading ? (
            <CardGridSkeleton />
          ) : (offers.data ?? []).length === 0 ? (
            <EmptyState
              icon={Handshake}
              title="Nicio ofertă de colaborare disponibilă"
              description="Colaborarea înseamnă că o agenție deschide o proprietate din portofoliul ei către celelalte agenții Habitoo și afișează comisionul pe care îl împarte. Momentan nicio ofertă nu corespunde filtrelor tale. Îți poți marca propriile proprietăți pentru colaborare din pagina proprietății, secțiunea Colaborare, unde stabilești comisionul și condițiile."
            />
          ) : (
            <div className="panel overflow-hidden">
              <Accordion type="multiple" className="divide-y divide-border">
                {partnerAgencies.map((agency) => (
                  <AccordionItem key={agency.id} value={agency.id} className="border-0 px-4">
                    <AccordionTrigger className="gap-3 py-4 hover:no-underline">
                      <span className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Building2 className="size-5" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{agency.name}</span>
                          <span className="block text-xs font-normal text-muted-foreground">
                            {[agency.city, `${agency.offers.length} ${agency.offers.length === 1 ? "ofertă" : "oferte"}`]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <StatusBadge tone="success">Partener activ</StatusBadge>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {agency.offers.map((offer) => (
                          <li key={offer.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
                  <button
                    type="button"
                    onClick={() => setDetailOffer(offer)}
                    className="relative block aspect-[1.82/1] w-full overflow-hidden bg-muted text-left"
                  >
                    {offer.coverUrl ? (
                      <img
                        src={offer.coverUrl}
                        alt={offer.title}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
                        Fără fotografii
                      </span>
                    )}
                    {offer.collabCommissionPercent !== null ? (
                      <span className="absolute top-3 left-3 rounded-full bg-gold px-3 py-1 text-sm font-semibold text-gold-foreground shadow-sm">
                        {offer.collabCommissionPercent}% comision
                      </span>
                    ) : null}
                  </button>
                  <div className="flex flex-1 flex-col gap-1.5 p-3.5">
                    <h3 className="line-clamp-2 text-sm font-semibold">{offer.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {[offer.district, offer.city, offer.county].filter(Boolean).join(", ") ||
                        "Locație nespecificată"}
                    </p>
                    <p className="text-lg font-semibold">
                      {formatMoney(offer.price, offer.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        propertyTypeLabels[offer.propertyType] ?? offer.propertyType,
                        transactionLabels[offer.transactionKind as "sale" | "rent"],
                        offer.rooms ? `${offer.rooms} camere` : null,
                        offer.surface ? `${formatNumber(offer.surface)} m²` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className="mt-auto flex gap-2 pt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setDetailOffer(offer)}
                      >
                        Detalii
                      </Button>
                      <Button size="sm" className="flex-1" onClick={() => setProposeFor(offer)}>
                        Propune unui client
                      </Button>
                    </div>
                    <p className="border-t border-border pt-2 text-[11px] text-muted-foreground">
                      {offer.myProposalCount > 0
                        ? `${offer.myProposalCount} propunere(i) trimise`
                        : "Nicio propunere trimisă"}
                    </p>
                  </div>
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}
        </TabsContent>

        <TabsContent value="outgoing">
          <ProposalList
            proposals={proposals.data?.outgoing ?? []}
            loading={proposals.isLoading}
            emptyTitle="Nu ai trimis propuneri"
            emptyText="Alege o ofertă din „Oferte partenere” și propune-o unui client din portofoliul tău."
            onOpen={setThreadId}
            perspective="outgoing"
          />
        </TabsContent>

        <TabsContent value="incoming">
          <ProposalList
            proposals={proposals.data?.incoming ?? []}
            loading={proposals.isLoading}
            emptyTitle="Nicio cerere primită"
            emptyText="Când o altă agenție Habitoo propune un client pentru una dintre proprietățile tale deschise spre colaborare, cererea apare aici."
            onOpen={setThreadId}
            perspective="incoming"
          />
        </TabsContent>
      </Tabs>

      <OfferDetailDialog
        offer={detailOffer}
        onClose={() => setDetailOffer(null)}
        onPropose={(offer) => {
          setDetailOffer(null);
          setProposeFor(offer);
        }}
      />

      <ProposeDialog
        offer={proposeFor}
        onClose={() => setProposeFor(null)}
        onDone={() => {
          setProposeFor(null);
          queryClient.invalidateQueries({ queryKey: ["collab-proposals"] });
          queryClient.invalidateQueries({ queryKey: ["collab-offers"] });
        }}
      />

      <ThreadDialog id={threadId} onClose={() => setThreadId(null)} />
    </>
  );
}

type ProposalItem = NonNullable<
  Awaited<ReturnType<typeof listCollaborationProposals>>
>["outgoing"][number];

function ProposalList({
  proposals,
  loading,
  emptyTitle,
  emptyText,
  onOpen,
  perspective,
}: {
  proposals: ProposalItem[];
  loading: boolean;
  emptyTitle: string;
  emptyText: string;
  onOpen: (id: string) => void;
  perspective: "incoming" | "outgoing";
}) {
  if (loading) return <CardGridSkeleton />;
  if (proposals.length === 0) {
    return <EmptyState icon={Inbox} title={emptyTitle} description={emptyText} />;
  }
  return (
    <ul className="panel divide-y divide-border overflow-hidden">
      {proposals.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 text-sm">
          <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
            {p.coverUrl ? (
              <img src={p.coverUrl} alt="" className="size-full object-cover" loading="lazy" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{p.propertyTitle}</p>
            <p className="truncate text-xs text-muted-foreground">
              Client: <span className="text-foreground">{p.clientLabel}</span>
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
              <Building2 className="size-3 shrink-0" />
              {perspective === "incoming"
                ? `${p.requesterAgencyName}${p.requesterAgentName ? ` · ${p.requesterAgentName}` : ""}`
                : p.ownerAgencyName}
              {" · "}
              {formatDateTime(p.updatedAt)}
            </p>
          </div>
          {p.collabCommissionPercent !== null ? (
            <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-semibold text-gold-foreground">
              {p.collabCommissionPercent}%
            </span>
          ) : null}
          <StatusBadge tone={statusTone[p.status]} dot>
            {COLLAB_STATUS_LABELS[p.status]}
          </StatusBadge>
          <Button size="sm" variant="outline" onClick={() => onOpen(p.id)}>
            <MessageCircle className="size-4" /> Mesaje ({p.messageCount})
          </Button>
        </li>
      ))}
    </ul>
  );
}

function OfferDetailDialog({
  offer,
  onClose,
  onPropose,
}: {
  offer: CollaborationOffer | null;
  onClose: () => void;
  onPropose: (offer: CollaborationOffer) => void;
}) {
  const fetchOffer = useServerFn(getCollaborationOffer);
  const detail = useQuery({
    queryKey: ["collab-offer", offer?.id],
    enabled: Boolean(offer?.id),
    queryFn: () => fetchOffer({ data: { id: offer!.id } }),
  });
  const full = detail.data ?? offer;

  return (
    <Dialog open={Boolean(offer)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{full?.title ?? "Ofertă de colaborare"}</DialogTitle>
        </DialogHeader>
        {full ? (
          <div className="space-y-4 text-sm">
            {full.images.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {full.images.slice(0, 6).map((src: string) => (
                  <img
                    key={src}
                    src={src}
                    alt=""
                    className="aspect-[4/3] w-full rounded-lg object-cover"
                  />
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-semibold">
                {formatMoney(full.price, full.currency)}
              </span>
              {full.collabCommissionPercent !== null ? (
                <StatusBadge tone="success">
                  Comision colaborare {full.collabCommissionPercent}%
                </StatusBadge>
              ) : null}
              <StatusBadge tone="primary">{full.agencyName}</StatusBadge>
            </div>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ["Tip", propertyTypeLabels[full.propertyType] ?? full.propertyType],
                ["Tranzacție", transactionLabels[full.transactionKind as "sale" | "rent"]],
                ["Camere", full.rooms ? String(full.rooms) : "—"],
                ["Băi", full.bathrooms ? String(full.bathrooms) : "—"],
                ["Suprafață", full.surface ? `${formatNumber(full.surface)} m²` : "—"],
                ["Etaj", full.floor !== null ? String(full.floor) : "—"],
                ["An construcție", full.buildYear ? String(full.buildYear) : "—"],
                [
                  "Locație",
                  [full.district, full.city, full.county].filter(Boolean).join(", ") || "—",
                ],
                ["Referință", full.reference ?? "—"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            {full.collabTerms ? (
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  Condiții de colaborare
                </p>
                <p className="mt-1 whitespace-pre-line">{full.collabTerms}</p>
              </div>
            ) : null}
            {full.description ? (
              <p className="whitespace-pre-line text-muted-foreground">{full.description}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Datele proprietarului rămân la agenția care deține mandatul. Comunicarea se face prin
              firul de mesaje al propunerii.
            </p>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Închide
          </Button>
          {offer ? <Button onClick={() => onPropose(offer)}>Propune unui client</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProposeDialog({
  offer,
  onClose,
  onDone,
}: {
  offer: CollaborationOffer | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: user } = useCurrentUser();
  const orgId = user?.organization?.id;
  const [pick, setPick] = useState<string>("");
  const [message, setMessage] = useState("");
  const propose = useServerFn(createCollaborationProposal);

  const { data: clients = [] } = useQuery({
    queryKey: ["collab-clients", orgId],
    enabled: Boolean(orgId && offer),
    queryFn: async () => {
      const [contacts, leads] = await Promise.all([
        supabase.from("contacts").select("id,first_name,last_name,phone").order("last_name"),
        supabase.from("leads").select("id,name,stage").not("stage", "in", "(won,lost)"),
      ]);
      const list: { key: string; label: string; kind: "contact" | "lead"; id: string }[] = [];
      for (const c of contacts.data ?? []) {
        list.push({
          key: `contact:${c.id}`,
          id: c.id,
          kind: "contact",
          label: `Contact · ${c.first_name} ${c.last_name}`,
        });
      }
      for (const l of leads.data ?? []) {
        list.push({ key: `lead:${l.id}`, id: l.id, kind: "lead", label: `Lead · ${l.name}` });
      }
      return list;
    },
  });

  const selected = useMemo(() => clients.find((c) => c.key === pick), [clients, pick]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!offer) throw new Error("Ofertă lipsă.");
      if (!selected) throw new Error("Alege clientul pe care îl propui.");
      return propose({
        data: {
          propertyId: offer.id,
          contactId: selected.kind === "contact" ? selected.id : null,
          leadId: selected.kind === "lead" ? selected.id : null,
          clientLabel: selected.label.replace(/^(Contact|Lead) · /, ""),
          message: message.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Propunerea a fost trimisă agenției care deține mandatul.");
      setPick("");
      setMessage("");
      onDone();
    },
    onError: (e: Error) => toastError(e),
  });

  return (
    <Dialog open={Boolean(offer)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Propune unui client</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {offer?.title} · {offer?.agencyName}
            {offer?.collabCommissionPercent !== null && offer?.collabCommissionPercent !== undefined
              ? ` · comision colaborare ${offer.collabCommissionPercent}%`
              : ""}
          </p>
          <div className="space-y-2">
            <Label>Clientul tău</Label>
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger>
                <SelectValue placeholder="Alege un contact sau un lead" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Agenția sursă vede doar numele clientului propus, nu datele lui de contact.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="collab-message">Mesaj (opțional)</Label>
            <Textarea
              id="collab-message"
              rows={4}
              value={message}
              placeholder="Ex. Clientul are creditul aprobat și poate vizita în weekend."
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Anulează
          </Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending || !pick}>
            <Send className="size-4" /> {submit.isPending ? "Se trimite…" : "Trimite propunerea"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ThreadDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const fetchProposal = useServerFn(getCollaborationProposal);
  const send = useServerFn(postCollaborationMessage);
  const changeStatus = useServerFn(setCollaborationProposalStatus);

  const thread = useQuery({
    queryKey: ["collab-thread", id],
    enabled: Boolean(id),
    queryFn: () => fetchProposal({ data: { id: id as string } }),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["collab-thread", id] });
    queryClient.invalidateQueries({ queryKey: ["collab-proposals"] });
  };

  const post = useMutation({
    mutationFn: () => send({ data: { id: id as string, body: body.trim() } }),
    onSuccess: () => {
      setBody("");
      refresh();
    },
    onError: (e: Error) => toastError(e),
  });

  const status = useMutation({
    mutationFn: (next: CollaborationProposalStatus) =>
      changeStatus({ data: { id: id as string, status: next } }),
    onSuccess: () => {
      toast.success("Status actualizat.");
      refresh();
    },
    onError: (e: Error) => toastError(e),
  });

  const data = thread.data;

  return (
    <Dialog open={Boolean(id)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{data?.propertyTitle ?? "Colaborare"}</DialogTitle>
        </DialogHeader>
        {data ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge tone={statusTone[data.status]}>
                {COLLAB_STATUS_LABELS[data.status]}
              </StatusBadge>
              <span className="text-muted-foreground">
                {data.direction === "incoming"
                  ? `${data.requesterAgencyName} · client: ${data.clientLabel}`
                  : `${data.ownerAgencyName} · client propus: ${data.clientLabel}`}
              </span>
            </div>
            {data.message ? (
              <p className="rounded-xl border border-border p-3 text-sm whitespace-pre-line">
                {data.message}
              </p>
            ) : null}

            <div className="rounded-xl border border-border p-3">
              <Label className="text-xs text-muted-foreground">Status colaborare</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    "pending",
                    "accepted",
                    "viewing",
                    "declined",
                    "closed",
                  ] as CollaborationProposalStatus[]
                ).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={data.status === s ? "default" : "outline"}
                    disabled={status.isPending}
                    onClick={() => status.mutate(s)}
                  >
                    {COLLAB_STATUS_LABELS[s]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {data.messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Niciun mesaj încă. Scrie primul mesaj pentru a stabili detaliile (ex. programarea
                  unei vizionări).
                </p>
              ) : (
                <ul className="space-y-4">
                  {data.messages.map((m) => (
                    <li
                      key={m.id}
                      className={m.mine ? "flex flex-col items-end" : "flex flex-col items-start"}
                    >
                      <p className="text-[11px] text-muted-foreground">
                        {m.mine ? "Tu" : (m.senderName ?? "Utilizator")} · {m.agencyName} ·{" "}
                        {formatDateTime(m.createdAt)}
                      </p>
                      <p
                        className={`mt-1 max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-line ${
                          m.mine ? "bg-primary/8 text-foreground" : "bg-muted"
                        }`}
                      >
                        {m.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="collab-reply">Mesaj nou</Label>
              <Textarea
                id="collab-reply"
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Scrie un mesaj agenției partenere…"
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Se încarcă…</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Închide
          </Button>
          <Button onClick={() => post.mutate()} disabled={post.isPending || !body.trim()}>
            <Send className="size-4" /> Trimite mesajul
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
