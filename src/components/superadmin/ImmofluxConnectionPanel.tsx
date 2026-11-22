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
import { normalizeImmofluxHost, normalizeImmofluxSlug, type ImmofluxConnectionView } from "@/lib/property-import/immoflux/connection";

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
  const [host, setHost] = useState(config.host);
  const [slug, setSlug] = useState(config.slug);
  const [enabled, setEnabled] = useState(config.enabled);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const save = useServerFn(saveImmofluxConnection);
  const test = useServerFn(testImmofluxConnection);
  const client = useQueryClient();
  const dirty = host !== config.host || slug !== config.slug || enabled !== config.enabled || apiKey !== "";
  async function perform(action: "save" | "test") {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      if (action === "save") {
        await save({ data: { organizationId: config.organizationId, host, slug, enabled, ...(apiKey ? { apiKey } : {}) } });
        setHost(normalizeImmofluxHost(host));
        setSlug(normalizeImmofluxSlug(slug));
        setApiKey("");
        await client.invalidateQueries({ queryKey: ["superadmin", "immoflux", config.organizationId] });
        await client.invalidateQueries({ queryKey: ["superadmin", "agency", config.organizationId, "audit"] });
        setMessage("Configurarea a fost salvată.");
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
    <div className="space-y-2"><Label htmlFor="immoflux-host">Host IMMOFLUX</Label><Input id="immoflux-host" value={host} onChange={(e) => setHost(e.target.value)} disabled={busy} autoComplete="off" /></div>
    <div className="space-y-2"><Label htmlFor="immoflux-slug">Slug</Label><Input id="immoflux-slug" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={busy} autoComplete="off" /></div>
    <div className="space-y-2"><Label htmlFor="immoflux-key">Cheia API</Label><Input id="immoflux-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} disabled={busy} autoComplete="new-password" />{config.configured ? <p className="text-xs text-muted-foreground">Cheie salvată</p> : null}</div>
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>Salvează</Button><Button type="button" variant="outline" disabled={busy || dirty || !config.configured} onClick={() => void perform("test")}>Testează conexiunea</Button></div>
    {message ? <p role="status" className="text-sm text-foreground">{message}</p> : null}
  </form>;
}