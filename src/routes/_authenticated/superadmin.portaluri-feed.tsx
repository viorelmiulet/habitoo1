import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Copy, KeyRound, Plus, ShieldOff } from "lucide-react";
import { listPortalIndexKeys, createPortalIndexKey, revokePortalIndexKey } from "@/lib/site-feed/index-keys.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/app/PageHeader";
import { SuperadminGate } from "@/components/app/SuperadminGate";
import { toast } from "@/components/ui/sonner";
import { getPortalDefinition } from "@/lib/portals/registry";
import { AddFeedPortalDialog } from "@/components/superadmin/AddFeedPortalDialog";
import { updateDynamicFeedPortal } from "@/lib/dynamic-feed-portals.functions";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const keysOptions = queryOptions({ queryKey: ["superadmin", "portal-index-keys"], queryFn: () => listPortalIndexKeys() });
export const Route = createFileRoute("/_authenticated/superadmin/portaluri-feed")({
  head: () => ({ meta: [
    { title: "Habitoo CRM — Portaluri cu feed" }, { name: "description", content: "Administrarea securizată a cheilor de index pentru portalurile cu feed Habitoo." },
    { property: "og:title", content: "Habitoo CRM — Portaluri cu feed" }, { property: "og:description", content: "Chei de index și ultima utilizare pentru portalurile integrate." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(keysOptions),
  component: () => <SuperadminGate><FeedKeysPage /></SuperadminGate>,
});
type Portal = Parameters<typeof createPortalIndexKey>[0]["data"]["portal"];
type Revocation = { portal: Portal; id?: string; legacy: boolean; label: string };
const usedAt = (value: string | null) => value ? new Date(value).toLocaleString("ro-RO") : "Nefolosită încă";
function FeedKeysPage() {
  const { data: portals } = useSuspenseQuery(keysOptions);
  const qc = useQueryClient();
  const create = useServerFn(createPortalIndexKey);
  const revoke = useServerFn(revokePortalIndexKey);
  const update = useServerFn(updateDynamicFeedPortal);
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmation, setConfirmation] = useState<Revocation | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: keysOptions.queryKey });
  const generate = useMutation({ mutationFn: (portal: Portal) => create({ data: { portal } }),
    onSuccess: result => { setCopied(false); setSecret(result.key); refresh(); generate.reset(); },
    onError: () => toast.error("Cheia nu a putut fi generată."),
  });
  const withdraw = useMutation({ mutationFn: (target: Revocation) => revoke({ data: { portal: target.portal, id: target.id, legacy: target.legacy } }),
    onSuccess: () => { setConfirmation(null); refresh(); toast.success("Cheia a fost revocată."); },
    onError: () => toast.error("Cheia nu a putut fi revocată."),
  });
  const changePortal = useMutation({ mutationFn: (data: { slug: string; active?: boolean; show_public?: boolean }) => update({ data }),
    onSuccess: () => { refresh(); qc.invalidateQueries({ queryKey: ["dynamic-feed-registry"] }); qc.invalidateQueries({ queryKey: ["agency-portal-catalog"] }); },
    onError: () => toast.error("Portalul nu a putut fi actualizat."),
  });
  return <div className="space-y-6">
    <PageHeader title="Portaluri cu feed" actions={<Button onClick={() => setAdding(true)}><Plus />Adaugă portal cu feed</Button>} />
    <div className="grid gap-4 xl:grid-cols-2">{portals.map(portal => <article key={portal.portal} className="min-w-0 rounded-lg border bg-card p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><KeyRound className="size-5 text-gold-dark" />{portal.displayName ?? getPortalDefinition(portal.portal)?.display_name ?? portal.portal}</h2>
      {portal.dynamic && <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <Label className="flex items-center gap-2"><Checkbox checked={portal.active} disabled={changePortal.isPending} onCheckedChange={value => changePortal.mutate({ slug: portal.portal, active: value === true })} />Activ</Label>
        <Label className="flex items-center gap-2"><Checkbox checked={portal.showPublic} disabled={changePortal.isPending} onCheckedChange={value => changePortal.mutate({ slug: portal.portal, show_public: value === true })} />Afișează public</Label>
        <span className="text-muted-foreground">JSON{portal.xmlEnabled ? " + XML Kyero" : ""}</span>
      </div>}
      <p className="mt-3 break-all font-mono text-xs text-muted-foreground">{portal.indexUrl}</p>
      <div className="mt-4 space-y-3">
        {portal.keys.filter(key => key.status === "active").map(key => <div key={key.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div><p className="font-mono text-sm">{key.prefix}…{key.last4}</p><p className="text-xs text-muted-foreground">Ultima folosire: {usedAt(key.last_used_at)}</p></div>
          <Button variant="outline" size="sm" onClick={() => setConfirmation({ portal: portal.portal, id: key.id, legacy: false, label: `${key.prefix}…${key.last4}` })}><ShieldOff />Revocă</Button>
        </div>)}
        {portal.legacy ? <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div><p className="font-mono text-sm">{portal.legacy.prefix}…{portal.legacy.last4}</p><p className="text-xs text-muted-foreground">Cheie existentă din secrete · {portal.legacy.status === "active" ? "Activă" : "Revocată"}</p><p className="text-xs text-muted-foreground">Ultima folosire: {usedAt(portal.legacy.last_used_at)}</p></div>
          {portal.legacy.status === "active" && <Button variant="outline" size="sm" onClick={() => setConfirmation({ portal: portal.portal, legacy: true, label: "cheia existentă din secrete" })}><ShieldOff />Revocă</Button>}
        </div> : <p className="text-sm text-muted-foreground">Fără cheie din secrete.</p>}
        {!portal.keys.some(key => key.status === "active") && <p className="text-sm text-muted-foreground">Nicio cheie nouă activă.</p>}
      </div>
      <Button className="mt-5" disabled={generate.isPending || !portal.active} onClick={() => generate.mutate(portal.portal)}><Plus />Generează cheie nouă</Button>
    </article>)}</div>
    <AddFeedPortalDialog open={adding} onOpenChange={setAdding} prefixes={portals.map(p => p.prefix)} onCreated={key => { setSecret(key); setCopied(false); refresh(); qc.invalidateQueries({ queryKey: ["dynamic-feed-registry"] }); }} />
    <Dialog open={secret !== null} onOpenChange={open => { if (!open) { setSecret(null); generate.reset(); } }}>
      <DialogContent><DialogHeader><DialogTitle>Cheia nouă</DialogTitle></DialogHeader>
        <p className="font-semibold text-warning">Nu va mai fi afișată</p>
        <p className="text-sm text-muted-foreground">Păstrează cheia în siguranță înainte de a închide această fereastră.</p>
        <code className="break-all rounded-md bg-muted p-3 text-sm">{secret}</code>
        <Button onClick={async () => { if (!secret) return; try { await navigator.clipboard.writeText(secret); setCopied(true); } catch { toast.error("Copierea nu este disponibilă. Selectează cheia pentru a o copia."); } }}><Copy />{copied ? "Copiat" : "Copiază"}</Button>
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirmation !== null} onOpenChange={open => { if (!open && !withdraw.isPending) setConfirmation(null); }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Revoci {confirmation?.label}?</AlertDialogTitle><AlertDialogDescription>Cheia și tokenurile de feed emise prin aceasta nu vor mai permite accesul. Asigură-te că portalul a primit și folosește o cheie nouă.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={withdraw.isPending}>Renunță</AlertDialogCancel><AlertDialogAction disabled={withdraw.isPending} onClick={event => { event.preventDefault(); if (confirmation) withdraw.mutate(confirmation); }}>Revocă</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}