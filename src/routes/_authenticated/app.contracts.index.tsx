import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { FileSignature, Plus, Search } from "lucide-react";
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
import { appHead } from "@/components/app/app-head";
import { NewContractDialog } from "@/components/app/contracts/NewContractDialog";
import { listContracts } from "@/lib/contracts.functions";
import {
  CONTRACT_STATUSES,
  contractKindLabels,
  contractStatusLabels,
  contractStatusTone,
} from "@/lib/contracts/templates";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/contracts/")({
  head: () => appHead("Habitoo CRM — contracte și documente"),
  component: ContractsPage,
});

function ContractsPage() {
  const fetchContracts = useServerFn(listContracts);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const contracts = useQuery({
    queryKey: ["contracts", status, search],
    queryFn: () =>
      fetchContracts({
        data: {
          ...(status !== "all" ? { status } : {}),
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
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> Document nou
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Caută după titlu…"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[200px]">
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
                  className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileSignature className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {contractKindLabels[c.kind] ?? c.kind}
                      {c.clientName ? ` · ${c.clientName}` : ""}
                      {c.propertyTitle ? ` · ${c.propertyTitle}` : ""} ·{" "}
                      {formatDateTime(c.createdAt)}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
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
    </div>
  );
}
