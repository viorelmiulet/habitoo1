import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, FileJson, Upload } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toastError } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import {
  importImmofluxProperties,
  type ImmofluxImportResult,
  type ImportItemReport,
} from "@/lib/property-import/import.functions";

const MAX_BYTES = 24 * 1024 * 1024;

const ACTION_LABELS: Record<ImportItemReport["action"], string> = {
  create: "De creat",
  update: "De actualizat",
  skip: "Sărit",
};
const ACTION_VARIANT: Record<ImportItemReport["action"], "default" | "secondary" | "outline"> = {
  create: "default",
  update: "secondary",
  skip: "outline",
};
const JOB_STATUS: Record<string, string> = {
  processing: "În curs",
  completed: "Finalizat",
  failed: "Eșuat",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: { id: string; name: string } | null;
};

type LoadedFile = { name: string; text: string; count: number };

function groupWarnings(items: ImportItemReport[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const w of [...(item.warnings ?? []), ...(item.action === "skip" ? (item.reasons ?? []) : [])]) {
      // Grupăm după mesaj, fără codurile variabile din paranteze.
      const key = w.replace(/\s*\([^)]*\)/g, "");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ItemRow({ item }: { item: ImportItemReport }) {
  const notes = [...(item.reasons ?? []), ...(item.warnings ?? [])];
  return (
    <Collapsible className="rounded-md border border-border">
      <CollapsibleTrigger className="flex w-full items-center gap-2 p-2 text-left text-sm">
        <Badge variant={ACTION_VARIANT[item.action]} className="shrink-0">
          {ACTION_LABELS[item.action]}
        </Badge>
        <span className="min-w-0 flex-1 truncate">{item.title ?? "(fără titlu)"}</span>
        <span className="shrink-0 text-xs text-muted-foreground">#{item.externalId ?? "—"}</span>
        {notes.length > 0 ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : null}
      </CollapsibleTrigger>
      {notes.length > 0 ? (
        <CollapsibleContent className="border-t border-border px-3 py-2">
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

function ResultView({ result }: { result: ImmofluxImportResult }) {
  const warnings = useMemo(() => groupWarnings(result.items), [result]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Counter label={result.mode === "preview" ? "De creat" : "Create"} value={result.counts.create} />
        <Counter label={result.mode === "preview" ? "De actualizat" : "Actualizate"} value={result.counts.update} />
        <Counter label="Sărite" value={result.counts.skip + result.counts.failed} />
        <Counter label="Poze de descărcat" value={result.counts.images} />
      </div>
      {warnings.length > 0 ? (
        <div className="rounded-md border border-border p-3">
          <div className="mb-1 text-sm font-medium">Avertismente și motive</div>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {warnings.map(([msg, n]) => (
              <li key={msg}>
                <span className="font-medium tabular-nums text-foreground">{n} ×</span> {msg}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {result.items.map((item, i) => (
          <ItemRow key={`${item.externalId ?? "x"}-${i}`} item={item} />
        ))}
      </div>
    </div>
  );
}

function JobProgress({ jobId, active }: { jobId: string; active: boolean }) {
  const { data: job } = useQuery({
    queryKey: ["superadmin", "property-import-job", jobId],
    enabled: active,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_import_jobs")
        .select("status,images_total,images_done,images_failed")
        .eq("id", jobId)
        .single();
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) => (active && q.state.data?.status === "processing" ? 5000 : false),
  });
  const { data: failed } = useQuery({
    queryKey: ["superadmin", "property-import-failed", jobId, job?.images_failed ?? 0],
    enabled: active && (job?.images_failed ?? 0) > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_import_images")
        .select("id,source_url,last_error")
        .eq("job_id", jobId)
        .eq("status", "failed")
        .order("updated_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (!job) return null;
  const total = job.images_total || 0;
  const processed = job.images_done + job.images_failed;
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Poze</span>
        <span className="text-muted-foreground">{JOB_STATUS[job.status] ?? job.status}</span>
      </div>
      <Progress value={total > 0 ? (processed / total) * 100 : 100} />
      <div className="text-xs text-muted-foreground">
        {job.images_done} descărcate · {job.images_failed} eșuate · {total} total
      </div>
      {failed && failed.length > 0 ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
          {failed.map((f) => (
            <li key={f.id} className="break-all">
              <span className="text-destructive">{f.last_error ?? "Eroare necunoscută."}</span>{" "}
              <span className="text-muted-foreground">{f.source_url}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PreviousJobs({ organizationId, active }: { organizationId: string; active: boolean }) {
  const { data: jobs } = useQuery({
    queryKey: ["superadmin", "property-import-jobs", organizationId],
    enabled: active,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_import_jobs")
        .select(
          "id,created_at,file_name,status,created_count,updated_count,skipped_count,images_total,images_done,images_failed,report",
        )
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (!jobs || jobs.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Importuri anterioare</div>
      {jobs.map((job) => {
        const report = (Array.isArray(job.report) ? job.report : []) as ImportItemReport[];
        return (
          <Collapsible key={job.id} className="rounded-md border border-border">
            <CollapsibleTrigger className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-2 text-left text-xs">
              <span className="font-medium">{formatDate(job.created_at)}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{job.file_name ?? "—"}</span>
              <span>
                +{job.created_count} · ↻{job.updated_count} · sărite {job.skipped_count} · poze{" "}
                {job.images_done}/{job.images_total}
                {job.images_failed ? ` (${job.images_failed} eșuate)` : ""}
              </span>
              <Badge variant="outline">{JOB_STATUS[job.status] ?? job.status}</Badge>
            </CollapsibleTrigger>
            <CollapsibleContent className="max-h-60 space-y-1 overflow-y-auto border-t border-border p-2">
              {report.length === 0 ? (
                <div className="text-xs text-muted-foreground">Raport gol.</div>
              ) : (
                report.map((item, i) => <ItemRow key={i} item={item} />)
              )}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

export function PropertyImportDialog({ open, onOpenChange, organization }: Props) {
  const queryClient = useQueryClient();
  const runImport = useServerFn(importImmofluxProperties);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState("");
  const [preview, setPreview] = useState<ImmofluxImportResult | null>(null);
  const [committed, setCommitted] = useState<ImmofluxImportResult | null>(null);

  const orgId = organization?.id ?? null;

  useEffect(() => {
    if (!open) {
      setFile(null);
      setFileError(null);
      setAgentId("");
      setPreview(null);
      setCommitted(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [open]);

  const { data: agents } = useQuery({
    queryKey: ["superadmin", "org-agents", orgId],
    enabled: open && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .eq("organization_id", orgId!)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function onFile(f: File | undefined) {
    setPreview(null);
    setCommitted(null);
    setFile(null);
    setFileError(null);
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setFileError("Fișierul depășește 24 MB. Împarte exportul în mai multe fișiere.");
      return;
    }
    const text = await f.text();
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        setFileError("Fișierul trebuie să conțină o listă de proprietăți (JSON care începe cu „[”).");
        return;
      }
      setFile({ name: f.name, text, count: parsed.length });
    } catch {
      setFileError("Fișierul nu este un JSON valid.");
    }
  }

  const previewMutation = useMutation({
    mutationFn: () =>
      runImport({
        data: {
          organizationId: orgId!,
          assignedTo: agentId,
          fileName: file!.name,
          fileText: file!.text,
          mode: "preview",
        },
      }),
    onSuccess: (r) => setPreview(r),
    onError: (e: Error) => toastError(e),
  });

  const commitMutation = useMutation({
    mutationFn: () =>
      runImport({
        data: {
          organizationId: orgId!,
          assignedTo: agentId,
          fileName: file!.name,
          fileText: file!.text,
          mode: "commit",
        },
      }),
    onSuccess: (r) => {
      setCommitted(r);
      queryClient.invalidateQueries({ queryKey: ["superadmin", "property-import-jobs", orgId] });
      queryClient.invalidateQueries({ queryKey: ["superadmin", "agencies"] });
    },
    onError: (e: Error) => toastError(e),
  });

  const busy = previewMutation.isPending || commitMutation.isPending;
  const canPreview = !!file && !!agentId && !busy && !committed;
  const canCommit = !!preview && !!file && !!agentId && !busy && !committed;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importă proprietăți</DialogTitle>
          <DialogDescription>
            Export IMMOFLUX (JSON) pentru agenția {organization?.name ?? ""}.
          </DialogDescription>
        </DialogHeader>

        {orgId ? (
          <div className="space-y-5">
            {/* Pasul 1 */}
            <section className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="immoflux-file">Fișier</Label>
                <input
                  ref={inputRef}
                  id="immoflux-file"
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  disabled={busy || !!committed}
                  onChange={(e) => void onFile(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  disabled={busy || !!committed}
                  onClick={() => inputRef.current?.click()}
                >
                  <FileJson className="mr-2 size-4" />
                  <span className="truncate">
                    {file ? `${file.name} · ${file.count} elemente` : "Alege fișierul .json"}
                  </span>
                </Button>
                {fileError ? <p className="text-sm text-destructive">{fileError}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label>Agent responsabil</Label>
                <Select
                  value={agentId}
                  onValueChange={(v) => {
                    setAgentId(v);
                    setPreview(null);
                  }}
                  disabled={busy || !!committed}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Alege agentul" />
                  </SelectTrigger>
                  <SelectContent>
                    {(agents ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.full_name || "(fără nume)"}
                        {a.email ? ` · ${a.email}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {agents && agents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Agenția nu are încă utilizatori.</p>
                ) : null}
              </div>
              {!committed ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto"
                  disabled={!canPreview}
                  onClick={() => previewMutation.mutate()}
                >
                  {previewMutation.isPending ? "Se analizează…" : "Previzualizează"}
                </Button>
              ) : null}
            </section>

            {/* Pasul 2 */}
            {preview && !committed ? (
              <section className="space-y-3">
                <div className="text-sm font-medium">Previzualizare</div>
                <ResultView result={preview} />
                <div className="space-y-2 border-t border-border pt-3">
                  <p className="text-sm text-muted-foreground">
                    Proprietățile vor fi active în CRM, dar nepublicate pe site sau pe portaluri.
                  </p>
                  <Button
                    type="button"
                    className="w-full sm:w-auto"
                    disabled={!canCommit}
                    onClick={() => commitMutation.mutate()}
                  >
                    <Upload className="mr-1.5 size-4" />
                    {commitMutation.isPending ? "Se importă…" : "Importă"}
                  </Button>
                </div>
              </section>
            ) : null}

            {/* După import */}
            {committed ? (
              <section className="space-y-3">
                <div className="text-sm font-medium">Import finalizat</div>
                {committed.jobId ? <JobProgress jobId={committed.jobId} active={open} /> : null}
                <ResultView result={committed} />
              </section>
            ) : null}

            <PreviousJobs organizationId={orgId} active={open} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
