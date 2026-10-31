import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/errors";
import { downloadFeedDocumentation } from "@/lib/portals/feed-docs.functions";
import { isFeedDocPortal } from "@/lib/portals/feed-docs";

/** „Descarcă documentația (PDF)” pentru portalurile de tip feed. Generează, apoi oferă fișierul gata de salvat. */
export function FeedDocDownloadButton({ portalId, organizationId }: { portalId: string; organizationId: string }) {
  const run = useServerFn(downloadFeedDocumentation);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<{ url: string; filename: string } | null>(null);
  if (!isFeedDocPortal(portalId)) return null;

  const generate = async () => {
    setBusy(true);
    try {
      const res = await run({ data: { portal: portalId, organizationId } });
      const bytes = Uint8Array.from(atob(res.pdfBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      setReady({ url, filename: res.filename });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
      <div>
        <p className="font-medium">Documentația feedului</p>
        <p className="text-xs text-muted-foreground">PDF cu datele de acces confidențiale și documentația tehnică.</p>
      </div>
      {ready ? (
        <Button asChild size="sm">
          <a
            href={ready.url}
            download={ready.filename}
            onClick={() => {
              const url = ready.url;
              setTimeout(() => URL.revokeObjectURL(url), 30_000);
              setReady(null);
            }}
          >
            <FileDown className="mr-1 h-4 w-4" /> Salvează PDF-ul
          </a>
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={generate} disabled={busy}>
          <FileDown className="mr-1 h-4 w-4" />
          {busy ? "Se generează…" : "Descarcă documentația (PDF)"}
        </Button>
      )}
    </div>
  );
}
