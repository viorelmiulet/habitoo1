import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  Ban,
  Copy,
  Eye,
  EyeOff,
  FileDown,
  FileSignature,
  Loader2,
  PenLine,
  Send,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/LoadingState";
import { SectionCard } from "@/components/app/SectionCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { InventoryEditor } from "@/components/app/contracts/InventoryEditor";
import { ContractBodyPreview } from "@/components/app/contracts/ContractBodyPreview";
import { gdprNoticeAttached } from "@/lib/contracts/gdpr-notice";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { appHead } from "@/components/app/app-head";
import { formatDateTime } from "@/lib/format";
import { contractKindLabels, contractStatusLabels, contractStatusTone } from "@/lib/contracts/templates";
import type { InventoryItem } from "@/lib/contracts/templates";
import { printedContractNumber } from "@/lib/contracts/numbering";
import {
  cancelContract,
  contractDocumentUrl,
  generateContractPdf,
  getContract,
  sendForSignature,
  updateContractBody,
  updateContractInventory,
} from "@/lib/contracts.functions";

export const Route = createFileRoute("/_authenticated/app/contracts/$id")({
  head: () => { const title = "Habitoo CRM — document"; const description = "Conținutul contractului, părțile semnatare și fișierele PDF."; const head = appHead(title); return { ...head, meta: [...head.meta, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }; },
  component: ContractDetailPage,
});

function ContractDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchContract = useServerFn(getContract);
  const runUpdate = useServerFn(updateContractBody);
  const runInventoryUpdate = useServerFn(updateContractInventory);
  const runPdf = useServerFn(generateContractPdf);
  const runSend = useServerFn(sendForSignature);
  const runCancel = useServerFn(cancelContract);
  const runDocUrl = useServerFn(contractDocumentUrl);

  const [reveal, setReveal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [editingInventory, setEditingInventory] = useState(false);
  const [inventoryDraft, setInventoryDraft] = useState<InventoryItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [links, setLinks] = useState<{ fullName: string; email: string | null; url: string }[]>([]);
  const [cancelOpen, setCancelOpen] = useState(false);

  const detail = useQuery({
    queryKey: ["contract", id, reveal],
    queryFn: () => fetchContract({ data: { id, revealIdData: reveal } }),
  });

  useEffect(() => {
    if (detail.data && !editing) {
      setBody(detail.data.contract.body);
      setTitle(detail.data.contract.title);
    }
  }, [detail.data, editing]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["contract", id] });

  const save = useMutation({
    mutationFn: () => runUpdate({ data: { id, body, title } }),
    onSuccess: () => {
      toast.success("Document actualizat.");
      setEditing(false);
      invalidate();
    },
    onError: (e: Error) => toastError(e),
  });

  const saveInventory = useMutation({
    mutationFn: () => runInventoryUpdate({ data: { id, items: inventoryDraft } }),
    onSuccess: () => {
      toast.success("Inventar actualizat.");
      setEditingInventory(false);
      invalidate();
    },
    onError: (e: Error) => toastError(e),
  });

  const pdf = useMutation({
    mutationFn: async () => {
      const { path } = await runPdf({ data: { id } });
      const { url } = await runDocUrl({ data: { id, path } });
      return url;
    },
    onSuccess: (url) => {
      invalidate();
      if (url) window.open(url, "_blank", "noopener");
      else toast.error("Nu s-a putut deschide documentul.");
    },
    onError: (e: Error) => toastError(e),
  });

  const send = useMutation({
    mutationFn: () => runSend({ data: { id, partyIds: selected } }),
    onSuccess: (result) => {
      setLinks(result.links);
      setSelected([]);
      toast.success("Linkurile de semnare au fost create.");
      invalidate();
    },
    onError: (e: Error) => toastError(e),
  });

  const cancel = useMutation({
    mutationFn: () => runCancel({ data: { id } }),
    onSuccess: () => {
      toast.success("Document anulat.");
      invalidate();
    },
    onError: (e: Error) => toastError(e),
  });

  const openDocument = async (path: string) => {
    try {
      const { url } = await runDocUrl({ data: { id, path } });
      if (url) window.open(url, "_blank", "noopener");
      else toast.error("Nu s-a putut deschide documentul.");
    } catch (e) {
      toastError(e as Error);
    }
  };

  if (detail.isLoading) return <ListSkeleton rows={6} />;
  if (detail.isError || !detail.data)
    return <p className="text-sm text-destructive">Documentul nu a putut fi încărcat.</p>;

  const { contract, parties, documents } = detail.data;
  const contractData =
    contract.data && typeof contract.data === "object" && !Array.isArray(contract.data)
      ? (contract.data as Record<string, unknown>)
      : {};
  const inventoryData =
    contractData["inventory"] && typeof contractData["inventory"] === "object" && !Array.isArray(contractData["inventory"])
      ? (contractData["inventory"] as Record<string, unknown>)
      : null;
  const inventoryItems = Array.isArray(inventoryData?.["items"])
    ? (inventoryData["items"] as InventoryItem[])
    : [];
  const unsigned = parties.filter((p) => !p.signedAt);
  const editable = contract.status === "draft";

  return (
    <div className="space-y-5">
      <PageHeader
        backTo="/app/contracts"
        backLabel="Toate documentele"
        eyebrow={`${contractKindLabels[contract.kind] ?? "Document"}${contract.propertyReference ? ` · ${contract.propertyReference}` : ""}`}
        title={contract.title}
        description={`${contract.number ? `${contract.number} · ` : ""}${contract.docNumber != null ? `${printedContractNumber(contract.docSeries, contract.docNumber)} · ` : ""}Creat la ${formatDateTime(contract.createdAt)}${contract.signedAt ? ` · semnat la ${formatDateTime(contract.signedAt)}` : ""}`}
        meta={
          <StatusBadge dot tone={contractStatusTone[contract.status] ?? "neutral"}>
            {contractStatusLabels[contract.status] ?? contract.status}
          </StatusBadge>
        }
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap [&>*]:h-11 [&>*]:w-full sm:[&>*]:h-10 sm:[&>*]:w-auto">
            <Button variant="outline" asChild>
              <Link to="/app/comisioane" search={{ nou: true, contract: id }}>Adaugă comision</Link>
            </Button>
            <Button data-tour="contract-pdf" variant="outline" onClick={() => pdf.mutate()} disabled={pdf.isPending}>
              {pdf.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileDown className="size-4" />
              )}
              PDF
            </Button>
            {editable ? (
              <Button data-tour="contract-edit" aria-pressed={editing} variant="outline" onClick={() => setEditing((v) => !v)}>
                <PenLine className="size-4" /> {editing ? "Renunță" : "Editează textul"}
              </Button>
            ) : null}
            {contract.status !== "cancelled" && contract.status !== "signed" ? (
              <Button variant="outline" onClick={() => setCancelOpen(true)}>
                <Ban className="size-4" /> Anulează
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <SectionCard
          title="Conținutul documentului"
          icon={FileSignature}
          action={
            editing ? (
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                Salvează
              </Button>
            ) : null
          }
        >
          {editing ? (
            <div className="space-y-3">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[520px] font-mono text-xs"
              />
            </div>
          ) : (
            <ContractBodyPreview body={contract.body} />
          )}
        </SectionCard>
        {gdprNoticeAttached(contract.data) ? (
          <SectionCard title="Notă de informare GDPR" description="Anexă la final, pe pagină nouă, semnată pentru primire de fiecare parte.">
            <ContractBodyPreview body={gdprNoticeAttached(contract.data) ?? ""} />
          </SectionCard>
        ) : null}

          {inventoryData?.["included"] === true ? (
            <SectionCard
              title="Anexa 1 — Inventar imobil"
              description={`${inventoryItems.length} articole inventariate`}
              action={editable ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (editingInventory) {
                      setEditingInventory(false);
                    } else {
                      setInventoryDraft(inventoryItems.map((item) => ({ ...item })));
                      setEditingInventory(true);
                    }
                  }}
                >
                  <PenLine className="size-4" /> {editingInventory ? "Renunță" : "Editează"}
                </Button>
              ) : null}
            >
              {editingInventory ? (
                <div className="space-y-4">
                  <InventoryEditor items={inventoryDraft} onChange={setInventoryDraft} />
                  <Button onClick={() => saveInventory.mutate()} disabled={saveInventory.isPending}>
                    {saveInventory.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    Salvează inventarul
                  </Button>
                </div>
              ) : <>
                <div className="hidden overflow-hidden rounded-[14px] border border-border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Denumire</TableHead>
                        <TableHead>Cant.</TableHead>
                        <TableHead>Stare</TableHead>
                        <TableHead>Locație</TableHead>
                        <TableHead>Observații</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventoryItems.map((item, index) => (
                        <TableRow key={`${item.name}-${index}`} className="h-12">
                          <TableCell className="font-semibold">{item.name}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.condition}</TableCell>
                          <TableCell>{item.location || "—"}</TableCell>
                          <TableCell>{item.notes || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ul className="space-y-2 md:hidden">
                  {inventoryItems.map((item, index) => (
                    <li key={`${item.name}-${index}`} className="min-h-12 min-w-0 rounded-[12px] border border-border bg-card p-3">
                      <p className="text-sm font-semibold break-words">{item.name}</p>
                      <p className="text-[13px] text-muted-foreground break-words">{item.quantity} · {item.condition}{item.location ? ` · ${item.location}` : ""}</p>
                      {item.notes ? <p className="text-[13px] text-muted-foreground break-words">{item.notes}</p> : null}
                    </li>
                  ))}
                </ul>
              </>}
            </SectionCard>
          ) : null}

        <div className="space-y-5">
          <SectionCard
            title="Părți semnatare"
            action={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? "Ascunde datele actului" : "Afișează datele actului"}
              >
                {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            }
          >
            <ul data-tour="contract-parties" className="space-y-3">
              {parties.map((p) => (
                <li key={p.id} className="rounded-[14px] border border-border bg-card p-4">
                  <div className="flex items-start gap-2">
                    {!p.signedAt && contract.status !== "cancelled" ? (
                      <Checkbox
                        checked={selected.includes(p.id)}
                        onCheckedChange={(checked) =>
                          setSelected((prev) =>
                            checked ? [...prev, p.id] : prev.filter((v) => v !== p.id),
                          )
                        }
                        aria-label={`Selectează ${p.fullName}`}
                        className="mt-0.5"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{p.fullName}</p>
                      <p className="text-[13px] text-muted-foreground">{p.roleLabel}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {p.cnp ? `CNP ${p.cnp}` : "CNP nespecificat"}
                        {p.idSeries || p.idNumber
                          ? ` · act ${p.idSeries ?? "—"} ${p.idNumber ?? ""}`
                          : ""}
                      </p>
                      {p.email ? (
                        <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                      ) : null}
                    </div>
                    {p.signedAt ? (
                      <StatusBadge tone="success">Semnat</StatusBadge>
                    ) : p.hasPendingLink ? (
                      <StatusBadge tone="warning">Link trimis</StatusBadge>
                    ) : (
                      <StatusBadge>În așteptare</StatusBadge>
                    )}
                  </div>
                  {p.signedAt ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {formatDateTime(p.signedAt)}
                      {p.signatureIp ? ` · IP ${p.signatureIp}` : ""}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>

            {unsigned.length > 0 && contract.status !== "cancelled" ? (
              <Button
                data-tour="contract-send"
                className="mt-4 h-11 w-full sm:h-10"
                onClick={() => send.mutate()}
                disabled={selected.length === 0 || send.isPending}
              >
                {send.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Trimite la semnat
              </Button>
            ) : null}
          </SectionCard>

          {links.length > 0 ? (
            <SectionCard title="Linkuri de semnare" description="Valabile 7 zile, o singură dată.">
              <ul className="space-y-2">
                {links.map((l) => (
                  <li key={l.url} className="space-y-1 rounded-[14px] border border-border bg-card p-4">
                    <p className="text-sm font-semibold">{l.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.email ? `Trimis pe email la ${l.email}` : "Fără email — trimite manual"}
                    </p>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={l.url} className="h-10 min-w-0 rounded-[10px] text-xs" />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-11 shrink-0 sm:size-10"
                        aria-label="Copiază linkul"
                        onClick={() => {
                          navigator.clipboard.writeText(l.url);
                          toast.success("Link copiat.");
                        }}
                      >
                        <Copy className="size-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}

          <SectionCard title="Fișiere PDF">
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Generează PDF-ul pentru a-l atașa proprietății și contactului.
              </p>
            ) : (
              <ul className="space-y-2">
                {documents.map((d) => (
                  <li key={d.id} className="flex min-h-11 items-center gap-2 text-sm">
                    <FileDown className="size-4 shrink-0 text-muted-foreground" />
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left hover:underline"
                      onClick={() => openDocument(d.path)}
                    >
                      {d.kind === "signed" ? "Document semnat" : "Document nesemnat"} ·{" "}
                      {formatDateTime(d.createdAt)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {contract.propertyId ? (
            <SectionCard title="Legături">
              <Link
                to="/app/properties/$id"
                params={{ id: contract.propertyId }}
                className="text-sm text-primary hover:underline"
              >
                {contract.propertyTitle ?? "Vezi proprietatea"}
              </Link>
            </SectionCard>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Anulezi documentul?"
        description="Linkurile de semnare active vor fi invalidate. Documentul rămâne în listă cu starea „Anulat”."
        confirmLabel="Anulează documentul"
        onConfirm={() => cancel.mutate()}
      />
    </div>
  );
}
