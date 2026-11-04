import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { FileSignature, Plus, Search, X } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/LoadingState";
import { EmptyState } from "@/components/app/EmptyState";
import { SectionCard } from "@/components/app/SectionCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFilterList } from "@/hooks/use-list-state";
import { validateListSearch } from "@/lib/list-state";
import { useCurrentUser } from "@/hooks/use-session";
import { appHead } from "@/components/app/app-head";
import { NewContractDialog } from "@/components/app/contracts/NewContractDialog";
import { ContractTemplatesDialog } from "@/components/app/contracts/ContractTemplatesDialog";
import { listContracts } from "@/lib/contracts.functions";
import {
  CONTRACT_STATUSES,
  CONTRACT_KINDS,
  contractKindLabels,
  contractStatusLabels,
  contractStatusTone,
} from "@/lib/contracts/templates";
import { formatDateTime } from "@/lib/format";
import { printedContractNumber } from "@/lib/contracts/numbering";

export const Route = createFileRoute("/_authenticated/app/contracts/")({
  head: () => { const title = "Habitoo CRM — contracte și documente"; const description = "Contractele și documentele agenției, cu filtre și starea semnăturilor."; const head = appHead(title); return { ...head, meta: [...head.meta, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }; },
  validateSearch: (search: Record<string, unknown>) => validateListSearch(contractListDefaults, search),
  component: ContractsPage,
});

const contractListDefaults = { status: "all", kind: "all", search: "" };

function ContractsPage() {
  const fetchContracts = useServerFn(listContracts);
  const { data: user } = useCurrentUser();
  const navigate = useNavigate({ from: Route.fullPath });
  const persisted = useFilterList("contracts", user?.userId, contractListDefaults, Route.useSearch(),
    (next) => { void navigate({ search: next, replace: true, resetScroll: false }); });
  const status = persisted.state.status;
  const setStatus = (value: string) => persisted.set("status", value);
  const kind = persisted.state.kind;
  const search = persisted.state.search;
  const setSearch = (value: string) => persisted.set("search", value);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const contracts = useQuery({
    queryKey: ["contracts", status, kind, search],
    queryFn: () =>
      fetchContracts({
        data: {
          ...(status !== "all" ? { status } : {}),
          ...(kind !== "all" ? { kind } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
        },
      }),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Contracte și documente"
        description="Mandate, procese-verbale de vizionare și semnături electronice."
        actions={
          <div className="flex flex-wrap gap-2">
          {user?.role === "agency_admin" ? <Button variant="outline" onClick={() => setTemplatesOpen(true)}>Șabloane</Button> : null}
          <Button data-tour="contract-create-open" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> Document nou
          </Button>
          </div>
        }
      />

      <div data-tour="contracts-filters" className="grid grid-cols-1 gap-2 rounded-[14px] border border-border bg-card p-4 sm:flex sm:flex-wrap sm:items-center sm:gap-3 sm:p-3">
        <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-tour="contracts-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Caută după titlu…"
            className="h-10 rounded-[10px] pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger data-tour="contracts-status" className="h-10 w-full rounded-[10px] sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate stările</SelectItem>
            {CONTRACT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {contractStatusLabels[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={(value) => persisted.set("kind", value)}>
          <SelectTrigger aria-label="Tip contract" className="h-10 w-full rounded-[10px] sm:w-[240px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate tipurile</SelectItem>
            {CONTRACT_KINDS.map((value) => <SelectItem key={value} value={value}>{contractKindLabels[value]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="link" className="h-11 justify-start px-1 text-sm font-semibold text-gold-dark sm:h-10" onClick={persisted.reset}><X className="size-4" /> Șterge filtre</Button>
      </div>

      <SectionCard title="Documente" flush>
        {contracts.isLoading ? (
          <div className="p-5">
            <ListSkeleton rows={5} />
          </div>
        ) : (contracts.data ?? []).length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={FileSignature}
              title="Niciun document"
              description="Creează primul mandat sau proces-verbal de vizionare."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {(contracts.data ?? []).map((c) => (
              <li key={c.id}>
                <Link
                  to="/app/contracts/$id"
                  params={{ id: c.id }}
                  className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-muted sm:flex-nowrap sm:px-5"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileSignature className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-auto">
                    <p className="truncate text-sm font-semibold">{c.title}</p>
                    {c.number || c.docNumber != null ? <p className="truncate text-[13px] text-muted-foreground">{[c.number, c.docNumber != null ? printedContractNumber(c.docSeries, c.docNumber) : null].filter(Boolean).join(" · ")}</p> : null}
                    <p className="truncate text-[13px] text-muted-foreground">
                      {contractKindLabels[c.kind] ?? c.kind}
                      {c.clientName ? ` · ${c.clientName}` : ""}
                      {c.propertyTitle ? ` · ${c.propertyTitle}` : ""} ·{" "}
                      {formatDateTime(c.createdAt)}
                    </p>
                  </div>
                  <span className="text-[13px] text-muted-foreground max-sm:ml-12">
                    {c.partiesSigned}/{c.partiesTotal} semnături
                  </span>
                  <StatusBadge dot tone={contractStatusTone[c.status] ?? "neutral"}>
                    {contractStatusLabels[c.status] ?? c.status}
                  </StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <NewContractDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      {user?.role === "agency_admin" ? <ContractTemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} /> : null}
    </div>
  );
}
