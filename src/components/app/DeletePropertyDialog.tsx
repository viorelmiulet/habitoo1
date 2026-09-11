import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/app/StatusBadge";
import { toastError } from "@/lib/errors";
import {
  deletePropertyPermanently,
  getPropertyDeletionState,
} from "@/lib/property-delete.functions";
import { applyPropertyPortalSelection } from "@/lib/portals.functions";
import { setPropertyCollaboration } from "@/lib/collaboration.functions";

/**
 * Ștergere definitivă a unei proprietăți, cu blocaj explicit cât timp există
 * anunțuri active pe portaluri sau în Colaborare. Retragerea rămâne o acțiune
 * separată, confirmată de utilizator — nu se face „din mers”, ca nimeni să nu
 * retragă din greșeală anunțuri active crezând că șterge doar o fișă din CRM.
 */
export function DeletePropertyDialog({
  propertyId,
  open,
  onOpenChange,
  onDeleted,
  onArchive,
  archived,
}: {
  propertyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
  onArchive?: () => void;
  archived?: boolean;
}) {
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState("");

  const stateFn = useServerFn(getPropertyDeletionState);
  const deleteFn = useServerFn(deletePropertyPermanently);
  const applyPortalsFn = useServerFn(applyPropertyPortalSelection);
  const collaborationFn = useServerFn(setPropertyCollaboration);

  const { data: state, isLoading, refetch } = useQuery({
    queryKey: ["property-deletion-state", propertyId],
    queryFn: () => stateFn({ data: { propertyId } }),
    enabled: open,
  });

  const withdrawAll = useMutation({
    mutationFn: async () => {
      const blockers = state?.blockers ?? [];
      const portals = blockers.filter((b) => b.kind === "portal");
      if (portals.length > 0) {
        const res = await applyPortalsFn({
          data: {
            propertyId,
            selections: portals.map((p) => ({ portalId: p.id, enabled: false })),
            syncExisting: false,
          },
        });
        const failed = res.results.filter((r) => !r.ok);
        if (failed.length > 0) {
          throw new Error(
            failed.map((f) => `${f.portalName}: ${f.message ?? "retragere eșuată"}`).join(" · "),
          );
        }
      }
      if (blockers.some((b) => b.kind === "collaboration")) {
        await collaborationFn({ data: { propertyId, enabled: false } });
      }
    },
    onSuccess: async () => {
      toast.success("Anunțurile au fost retrase.");
      queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
      queryClient.invalidateQueries({ queryKey: ["property-portal-status", propertyId] });
      await refetch();
    },
    onError: (e: Error) => toastError(e),
  });

  const remove = useMutation({
    mutationFn: async () => await deleteFn({ data: { propertyId, confirmReference: typed.trim() } }),
    onSuccess: () => {
      toast.success("Proprietatea a fost ștearsă definitiv.");
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      onOpenChange(false);
      onDeleted();
    },
    onError: (e: Error) => toastError(e),
  });

  const reference = state?.reference ?? "";
  const canConfirm = Boolean(state?.canDelete) && typed.trim().toUpperCase() === reference.toUpperCase();
  const busy = withdrawAll.isPending || remove.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        if (!v) setTyped("");
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" /> Șterge definitiv proprietatea
          </DialogTitle>
          <DialogDescription>
            {state ? (
              <>
                <span className="font-medium text-foreground">{state.title}</span>
                {state.reference ? ` · ${state.reference}` : ""}
              </>
            ) : (
              "Se verifică starea proprietății…"
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Se verifică publicările active…</p>
        ) : state && !state.canDelete ? (
          <div className="space-y-3">
            <div className="rounded-2xl bg-destructive/10 p-4 text-sm">
              <p className="font-medium text-destructive">Ștergerea este blocată</p>
              <p className="mt-1 text-muted-foreground">
                Proprietatea are anunțuri active. Dacă am șterge fișa din CRM, am pierde
                identificatorii externi și anunțurile ar rămâne online, fără posibilitatea de a le
                mai retrage.
              </p>
            </div>
            <ul className="space-y-2">
              {state.blockers.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    {b.name}
                    <StatusBadge tone={b.status === "selected" ? "warning" : "success"} dot>
                      {b.status === "selected" ? "Selectat pentru publicare" : "Activ"}
                    </StatusBadge>
                  </span>
                  {b.publicUrl ? (
                    <a
                      href={b.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Deschide anunțul pe ${b.name}`}
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => withdrawAll.mutate()}
              disabled={busy}
            >
              {withdrawAll.isPending ? "Se retrage…" : "Retrage de pe toate"}
            </Button>
          </div>
        ) : state ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-secondary/60 p-4 text-sm">
              <p className="font-medium">Se vor șterge definitiv:</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>{state.counts.images} fotografii (inclusiv fișierele și variantele cu watermark)</li>
                <li>{state.counts.documents} documente atașate</li>
                <li>{state.counts.activities} activități legate de proprietate</li>
                <li>{state.counts.proposals} propuneri de colaborare</li>
                <li>{state.counts.favorites} favorite și tot istoricul de publicare</li>
              </ul>
              <p className="mt-2 text-muted-foreground">
                {state.counts.leads} lead-uri NU se șterg: rămân în CRM, dezlegate de proprietate,
                cu o mențiune în istoricul lor.
              </p>
            </div>
            {!archived && onArchive ? (
              <div className="rounded-2xl bg-primary/5 p-4 text-sm">
                <p>
                  Dacă vrei doar să dispară din listă, o poți arhiva — datele rămân disponibile.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  disabled={busy}
                  onClick={() => {
                    onOpenChange(false);
                    onArchive();
                  }}
                >
                  Arhivează în loc să ștergi
                </Button>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="delete-property-ref">
                Scrie <span className="font-mono font-semibold">{reference || "referința"}</span> pentru
                a confirma
              </Label>
              <Input
                id="delete-property-ref"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoFocus
              />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Renunță
          </Button>
          <Button
            variant="destructive"
            onClick={() => remove.mutate()}
            disabled={!canConfirm || busy}
          >
            {remove.isPending ? "Se șterge…" : "Șterge definitiv"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
