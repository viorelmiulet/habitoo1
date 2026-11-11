import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { importOutreachCsv } from "@/lib/outreach.functions";
import { outreachHeaders, prepareOutreachCsv, type ImportSummary } from "@/lib/outreach";

export function OutreachImportDialog({ listId, listName }: { listId?: string; listName?: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(listName ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const qc = useQueryClient();
  const importCsv = useServerFn(importOutreachCsv);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Numele listei este obligatoriu.");
      if (!file) throw new Error("Alege un fișier CSV.");
      if (file.size > 5_000_000) throw new Error("Fișierul CSV este prea mare (maximum 5 MB).");
      const csv = await file.text();
      prepareOutreachCsv(csv);
      return importCsv({ data: { name, csv, listId } });
    },
    onSuccess: result => { setSummary(result); qc.invalidateQueries({ queryKey: ["outreach"] }); },
  });
  return <>
    <Button onClick={() => { setSummary(null); mutation.reset(); setOpen(true); }}><Upload className="size-4" />Importă CSV</Button>
    <Dialog open={open} onOpenChange={v => { if (!mutation.isPending) setOpen(v); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Importă destinatari</DialogTitle><DialogDescription>{listId ? "Adaugă destinatari în lista existentă." : "Creează o listă de destinatari."}</DialogDescription></DialogHeader>
        {summary ? <div className="space-y-5">
          <div role="status" className="grid grid-cols-2 gap-4 rounded-lg border border-border p-4">
            <p><strong className="block text-2xl text-success">{summary.imported}</strong>Importați</p>
            <p><strong className="block text-2xl">{summary.duplicates}</strong>Duplicate</p>
            <p><strong className="block text-2xl">{summary.invalid}</strong>Invalide</p>
            <p><strong className="block text-2xl">{summary.suppressed}</strong>Excluși global</p>
          </div><Button className="w-full" onClick={() => setOpen(false)}>Închide</Button>
        </div> : <form className="space-y-4" onSubmit={e => { e.preventDefault(); mutation.mutate(); }}>
          <div className="space-y-2"><Label htmlFor="outreach-name">Numele listei</Label><Input id="outreach-name" value={name} maxLength={160} required readOnly={Boolean(listId)} onChange={e => setName(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="outreach-file">Fișier CSV</Label><Input id="outreach-file" type="file" accept=".csv,text/csv" required onChange={e => setFile(e.target.files?.[0] ?? null)} /></div>
          <div className="space-y-1"><p className="text-sm text-muted-foreground">Antet CSV</p><code className="block break-all rounded-md bg-muted p-3 text-xs">{outreachHeaders.join(",")}</code></div>
          {mutation.error ? <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>Renunță</Button><Button type="submit" disabled={mutation.isPending}><Upload className="size-4" />{mutation.isPending ? "Se importă…" : "Importă"}</Button></div>
        </form>}
      </DialogContent>
    </Dialog>
  </>;
}