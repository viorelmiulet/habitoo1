import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCurrentUser } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DetailCard } from "./SuperadminUi";
import { getImmofluxConnection, saveImmofluxConnection, testImmofluxConnection } from "@/lib/property-import/immoflux/connection.functions";
import { startImmofluxImport } from "@/lib/property-import/immoflux/api-import.functions";
import { Link } from "@tanstack/react-router";
import { normalizeImmofluxSubdomain, type ImmofluxConnectionView } from "@/lib/property-import/immoflux/connection";

export function ImmofluxConnectionPanel({ organizationId }: { organizationId: string }) {
  const { data: me } = useCurrentUser();
  const load = useServerFn(getImmofluxConnection);
  const config = useQuery({ queryKey: ["superadmin", "immoflux", organizationId], queryFn: () => load({ data: { organizationId } }), enabled: me?.isSuperadmin === true });
  if (!me?.isSuperadmin) return null;
  return <DetailCard title="Import IMMOFLUX">
    {config.isPending ? <p className="text-sm text-muted-foreground">Se încarcă…</p> : config.isError ? <p role="alert" className="text-sm text-destructive">Configurarea nu poate fi citită.</p> : <ConnectionForm key={organizationId} config={config.data} />}
  </DetailCard>;
}

function ConnectionForm({ config }: { config: ImmofluxConnectionView }) {
  const [subdomain, setSubdomain] = useState(config.subdomain);
  const [enabled, setEnabled] = useState(config.enabled);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const save = useServerFn(saveImmofluxConnection);
  const test = useServerFn(testImmofluxConnection);
  const start = useServerFn(startImmofluxImport);
  const client = useQueryClient();
  const dirty = subdomain !== config.subdomain || enabled !== config.enabled || apiKey !== "";
  async function perform(action: "save" | "test" | "import") {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      if (action === "save") {
        await save({ data: { organizationId: config.organizationId, subdomain, enabled, ...(apiKey ? { apiKey } : {}) } });
        setSubdomain(normalizeImmofluxSubdomain(subdomain));
        setApiKey("");
        await client.invalidateQueries({ queryKey: ["superadmin", "immoflux", config.organizationId] });
        await client.invalidateQueries({ queryKey: ["superadmin", "agency", config.organizationId, "audit"] });
        setMessage("Configurarea a fost salvată.");
      } else if (action === "import") {
        await start({ data: { organizationId: config.organizationId } });
        setMessage("Importul a pornit în fundal. Primești o notificare în clopoțel la final.");
      } else {
        const result = await test({ data: { organizationId: config.organizationId } });
        setMessage(result.message);
        await client.invalidateQueries({ queryKey: ["superadmin", "agency", config.organizationId, "audit"] });
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Operația a eșuat."); }
    finally { setBusy(false); }
  }
  return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void perform("save"); }}>
    <div className="flex items-center gap-3"><Switch id="immoflux-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={busy} /><Label htmlFor="immoflux-enabled">Activat</Label></div>
    <div className="space-y-2"><Label htmlFor="immoflux-subdomain">Subdomeniu IMMOFLUX</Label><Input id="immoflux-subdomain" value={subdomain} placeholder="numeagentie" onChange={(e) => setSubdomain(e.target.value)} onBlur={() => { try { setSubdomain(normalizeImmofluxSubdomain(subdomain)); } catch { /* validat la salvare */ } }} disabled={busy} autoComplete="off" /><p className="text-xs text-muted-foreground">Partea „numeagentie” din numeagentie.immoflux.ro. Poți lipi și adresa întreagă.</p></div>
    <div className="space-y-2"><Label htmlFor="immoflux-key">Token API</Label><Input id="immoflux-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} disabled={busy} autoComplete="new-password" />{config.configured && config.tokenLast4 ? <p className="text-xs text-muted-foreground">Token salvat: ••••{config.tokenLast4}</p> : config.configured ? <p className="text-xs text-muted-foreground">Token salvat</p> : null}</div>
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>Salvează</Button><Button type="button" variant="outline" disabled={busy || dirty || !config.configured || !config.subdomain} onClick={() => void perform("test")}>Testează conexiunea</Button><Button type="button" variant="secondary" disabled={busy || dirty || !config.configured || !config.subdomain || !config.enabled} onClick={() => void perform("import")}>Importă acum</Button></div>
    <p className="text-xs text-muted-foreground">Anunțurile noi intră ca ciornă, fără portaluri; cele deja importate nu se modifică. <Link to="/superadmin/importuri-immoflux" className="underline">Istoricul importurilor</Link></p>
    {message ? <p role="status" className="text-sm text-foreground">{message}</p> : null}
  </form>;
}