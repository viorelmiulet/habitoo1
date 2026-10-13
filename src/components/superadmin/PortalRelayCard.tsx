import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { checkPortalRelayIp } from "@/lib/portals.functions";

type Result = Awaited<ReturnType<typeof checkPortalRelayIp>>;

export function PortalRelayCard() {
  const check = useServerFn(checkPortalRelayIp);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [failed, setFailed] = useState(false);

  async function run() {
    setBusy(true);
    setFailed(false);
    try {
      setResult(await check());
    } catch {
      setFailed(true);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel flex flex-wrap items-center justify-between gap-3 p-5">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold tracking-wide uppercase">IP fix pentru portaluri</h2>
        <p className="text-xs text-muted-foreground">
          VDI.ro și Imobiliare.ro primesc cererile prin releu. IP așteptat: 185.166.212.65.
        </p>
        {result?.ok ? (
          <p className={result.expected ? "text-sm text-primary" : "text-sm text-destructive"}>
            IP primit: <span className="font-mono">{result.ip}</span>
            {result.expected ? " — corect" : " — diferit de cel așteptat"}
          </p>
        ) : result ? (
          <p className="text-sm text-destructive">{result.message}</p>
        ) : failed ? (
          <p className="text-sm text-destructive">Verificarea nu a putut fi făcută.</p>
        ) : null}
      </div>
      <Button className="h-11" variant="outline" onClick={run} disabled={busy}>
        {busy ? "Se verifică…" : "Verifică"}
      </Button>
    </section>
  );
}
