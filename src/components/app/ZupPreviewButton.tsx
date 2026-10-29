import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { previewZupPayload } from "@/lib/portals/zup/nomenclature.functions";
export function ZupPreviewButton({ propertyId }: { propertyId: string }) {
  const [open,setOpen] = useState(false); const run = useServerFn(previewZupPayload);
  const preview = useMutation({mutationFn:() => run({data:{propertyId}})});
  return <><Button type="button" size="sm" variant="outline" onClick={() => {setOpen(true);preview.mutate();}}>Previzualizare ZUP</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Previzualizare ZUP</DialogTitle></DialogHeader>
      {preview.isPending ? <p className="text-sm text-muted-foreground">Se calculează…</p> : null}
      {preview.error ? <p role="alert" className="text-sm text-destructive">{preview.error.message}</p> : null}
      {preview.data ? <div className="space-y-3 text-sm">
        {preview.data.reasons.length ? <ul role="alert" className="list-disc pl-5 text-destructive">{preview.data.reasons.map(r => <li key={r}>{r}</li>)}</ul> : null}
        {preview.data.warnings.length ? <ul className="list-disc pl-5 text-muted-foreground">{preview.data.warnings.map(r => <li key={r}>{r}</li>)}</ul> : null}
        {preview.data.bodiesJson ? <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 text-xs">{preview.data.bodiesJson}</pre> : null}
      </div> : null}
    </DialogContent></Dialog></>;
}