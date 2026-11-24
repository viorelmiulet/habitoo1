import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { previewVrexaPayload } from "@/lib/portals/vrexa/preview.functions";

type Listing = { transaction: "sale" | "rent"; body: Record<string, unknown> };
type Preview = { ok: boolean; listings?: Listing[]; reasons?: string[]; warnings: string[] };

/** SuperAdmin read-only Vrexa payload preview; never calls Vrexa. */
export function VrexaPreviewButton({ organizationId, propertyId }: { organizationId?: string | undefined; propertyId: string }) {
  const [open, setOpen] = useState(false);
  const run = useServerFn(previewVrexaPayload);
  const preview = useMutation({ mutationFn: async () => (await run({ data: { ...(organizationId ? { organizationId } : {}), propertyId } })) as Preview });
  const d = preview.data;
  return <>
    <Button type="button" size="sm" variant="outline" onClick={() => { setOpen(true); preview.mutate(); }}>Previzualizare Vrexa</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Previzualizare Vrexa</DialogTitle></DialogHeader>
      {preview.isPending ? <p className="text-sm text-muted-foreground">Se calculează…</p> : null}
      {preview.error ? <p role="alert" className="text-sm text-destructive">{preview.error.message}</p> : null}
      {d ? <div className="space-y-3 text-sm">
        {d.reasons?.length ? <ul role="alert" className="list-disc pl-5 text-destructive">{d.reasons.map(r => <li key={r}>{r}</li>)}</ul> : null}
        {d.warnings.length ? <ul className="list-disc pl-5 text-muted-foreground">{d.warnings.map(r => <li key={r}>{r}</li>)}</ul> : null}
        {(d.listings ?? []).map(l => <div key={l.transaction}>
          <p className="font-semibold">{l.transaction === "sale" ? "Vânzare" : "Închiriere"}</p>
          <pre className="max-h-[50vh] overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(l.body, null, 2)}</pre>
        </div>)}
      </div> : null}
    </DialogContent></Dialog>
  </>;
}
