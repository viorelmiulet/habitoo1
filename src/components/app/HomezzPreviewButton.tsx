import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { previewHomezzPayload } from "@/lib/portals/homezz/preview.functions";

type Ad = { transaction: "sale" | "rent"; params: Record<string, string | number | number[]> };
type Preview = { ok: boolean; ads?: Ad[]; reasons?: string[]; warnings: string[]; location: { ok: boolean; areaSource?: "name" | "direction" } };

/** SuperAdmin read-only HomeZZ payload preview; never calls HomeZZ. */
export function HomezzPreviewButton({ organizationId, propertyId }: { organizationId?: string | undefined; propertyId: string }) {
  const [open, setOpen] = useState(false);
  const run = useServerFn(previewHomezzPayload);
  const preview = useMutation({ mutationFn: async () => (await run({ data: { ...(organizationId ? { organizationId } : {}), propertyId } })) as Preview });
  const d = preview.data;
  const source = d?.location.ok ? (d.location.areaSource === "name" ? "după nume" : "după direcție") : null;
  return <>
    <Button type="button" size="sm" variant="outline" onClick={() => { setOpen(true); preview.mutate(); }}>Previzualizare HomeZZ</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Previzualizare HomeZZ</DialogTitle></DialogHeader>
      {preview.isPending ? <p className="text-sm text-muted-foreground">Se calculează…</p> : null}
      {preview.error ? <p role="alert" className="text-sm text-destructive">{preview.error.message}</p> : null}
      {d ? <div className="space-y-3 text-sm">
        {source ? <p>Zona: {source}</p> : null}
        {d.reasons?.length ? <ul role="alert" className="list-disc pl-5 text-destructive">{d.reasons.map(r => <li key={r}>{r}</li>)}</ul> : null}
        {d.warnings.length ? <ul className="list-disc pl-5 text-muted-foreground">{d.warnings.map(r => <li key={r}>{r}</li>)}</ul> : null}
        {(d.ads ?? []).map(ad => <div key={ad.transaction}>
          <p className="font-semibold">{ad.transaction === "sale" ? "Vânzare" : "Închiriere"}</p>
          <pre className="max-h-[50vh] overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(ad.params, null, 2)}</pre>
        </div>)}
      </div> : null}
    </DialogContent></Dialog>
  </>;
}
