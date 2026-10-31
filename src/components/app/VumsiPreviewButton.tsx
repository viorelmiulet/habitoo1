/** „Previzualizare Vumsi”: payloadurile exacte (anunț, agent, agenție), fără nicio scriere la Vumsi. Doar SuperAdmin. */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { previewVumsiPayload } from "@/lib/portals/vumsi/mappings.functions";

export function VumsiPreviewButton({ propertyId }: { propertyId: string }) {
  const [open, setOpen] = useState(false);
  const run = useServerFn(previewVumsiPayload);
  const preview = useMutation({ mutationFn: () => run({ data: { propertyId } }) });
  return (
    <>
      <Button type="button" size="sm" variant="outline" className="pointer-events-auto mt-2" onClick={() => { setOpen(true); preview.mutate(); }}>
        Previzualizare Vumsi
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Previzualizare Vumsi</DialogTitle></DialogHeader>
          {preview.isPending ? <p className="text-sm text-muted-foreground">Se calculează…</p> : null}
          {preview.error instanceof Error ? <p role="alert" className="text-sm text-destructive">{preview.error.message}</p> : null}
          {preview.data ? (
            <div className="space-y-3 text-sm">
              {preview.data.reasons.length ? (
                <ul role="alert" className="list-disc space-y-1 pl-5 text-destructive">
                  {preview.data.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              ) : <p className="text-muted-foreground">Fără motive de blocare.</p>}
              {preview.data.warnings.length ? (
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  {preview.data.warnings.map((r) => <li key={r}>{r}</li>)}
                </ul>
              ) : null}
              {preview.data.setupMissing ? null : (
                <>
                  <pre className="max-h-[30vh] overflow-auto rounded-md bg-muted p-3 text-xs">{preview.data.summaryJson}</pre>
                  <pre className="max-h-[40vh] overflow-auto rounded-md bg-muted p-3 text-xs">{preview.data.payloadsJson}</pre>
                </>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
