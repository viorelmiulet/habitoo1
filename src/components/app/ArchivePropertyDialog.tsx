import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/components/ui/sonner";
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
import { StatusBadge } from "@/components/app/StatusBadge";
import { toastError } from "@/lib/errors";
import { archiveProperty, getPropertyArchiveState } from "@/lib/property-archive.functions";
import { applyPropertyPortalSelection } from "@/lib/portals.functions";
import { setPropertyCollaboration } from "@/lib/collaboration.functions";

/**
 * Confirmarea arhivării. Arhivarea e reversibilă, deci confirmarea e simplă.
 * Dacă proprietatea e încă activă pe portaluri sau în Colaborare, acțiunea e
 * blocată și utilizatorul retrage explicit, cu fluxul de retragere existent.
 */
export function ArchivePropertyDialog({
  propertyId,
  open,
  onOpenChange,
  onArchived,
}: {
  propertyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchived?: () => void;
}) {
  const queryClient = useQueryClient();
  const stateFn = useServerFn(getPropertyArchiveState);
  const archiveFn = useServerFn(archiveProperty);
  const applyPortalsFn = useServerFn(applyPropertyPortalSelection);
  const collaborationFn = useServerFn(setPropertyCollaboration);

  const {
    data: state,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["property-archive-state", propertyId],
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

  const archive = useMutation({
    mutationFn: async () => await archiveFn({ data: { propertyId } }),
    onSuccess: () => {
      toast.success("Proprietatea a fost arhivată. Datele rămân intacte.");
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
      onOpenChange(false);
      onArchived?.();
    },
    onError: (e: Error) => toastError(e),
  });

  const busy = withdrawAll.isPending || archive.isPending;
  const blocked = Boolean(state && !state.canArchive && state.blockers.length > 0);

  return (
    <Dialog open={open} onOpenChange={(v) => (busy ? undefined : onOpenChange(v))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Arhivează proprietatea</DialogTitle>
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
        ) : blocked ? (
          <div className="space-y-3">
            <div className="flex gap-3 rounded-2xl bg-warning/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
              <p className="text-muted-foreground">
                Proprietatea are anunțuri active. Dacă ar dispărea din CRM, ar rămâne vizibilă
                public, fără să mai poți interveni asupra ei.
              </p>
            </div>
            <ul className="space-y-2">
              {state!.blockers.map((b) => (
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
              disabled={busy}
              onClick={() => withdrawAll.mutate()}
            >
              {withdrawAll.isPending ? "Se retrage…" : "Retrage de pe toate"}
            </Button>
          </div>
        ) : (
          <p className="rounded-2xl bg-secondary/60 p-4 text-sm text-muted-foreground">
            Proprietatea nu va mai apărea în lista de proprietăți, în căutare sau în matching.
            Fotografiile, documentele, lead-urile legate și istoricul rămân intacte, iar oricând o
            poți readuce în circulație din filtrul „Arată și arhivate”.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Renunță
          </Button>
          <Button onClick={() => archive.mutate()} disabled={busy || !state?.canArchive}>
            {archive.isPending ? "Se arhivează…" : "Arhivează"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
