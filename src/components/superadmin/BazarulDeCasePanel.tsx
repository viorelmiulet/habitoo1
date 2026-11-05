import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/errors";
import { getBazarulFeedLink, testBazarulFeed } from "@/lib/portals/bazaruldecase/bazaruldecase.functions";

type TestResult = { ok: boolean; error: string | null; properties: number; offers: number; warnings: string[] };

/** BazarulDeCase.ro în SuperAdmin: linkul feedului XML al agenției și testul lui. */
export function BazarulDeCasePanel({ organizationId }: { organizationId: string }) {
  const getLink = useServerFn(getBazarulFeedLink);
  const runTest = useServerFn(testBazarulFeed);
  const [link, setLink] = useState<{ configured: boolean; xmlUrl: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  useEffect(() => {
    let alive = true;
    setResult(null);
    getLink({ data: { organizationId } }).then((r) => alive && setLink(r), toastError);
    return () => { alive = false; };
  }, [organizationId, getLink]);

  const test = async () => {
    setBusy(true);
    try { setResult(await runTest({ data: { organizationId } })); } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
      <div>
        <p className="font-medium">Feed XML Kyero v3 (Houzez Property Feed)</p>
        <p className="text-xs text-muted-foreground">Linkul agenției, de pus în pluginul de import al BazarulDeCase.ro.</p>
      </div>
      {link && !link.configured ? (
        <p className="text-xs text-warning-foreground">Cheia indexului BazarulDeCase.ro nu este configurată.</p>
      ) : link?.xmlUrl ? (
        <div className="flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 text-xs">
          <span className="truncate font-mono">{link.xmlUrl}</span>
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="Copiază linkul XML"
            onClick={() => navigator.clipboard.writeText(link.xmlUrl!).then(() => toast.success("Link copiat."))}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" onClick={test} disabled={busy}>{busy ? "Se testează…" : "Testează"}</Button>
        {result ? (
          <span className={result.ok ? "text-foreground" : "text-destructive"}>
            {result.ok ? `XML valid · ${result.properties} ${result.properties === 1 ? "anunț" : "anunțuri"} din ${result.offers} oferte bifate` : result.error}
          </span>
        ) : null}
      </div>
      {result?.warnings.length ? (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-warning-foreground">
          {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
