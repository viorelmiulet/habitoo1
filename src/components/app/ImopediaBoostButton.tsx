import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/sonner";
import { getImopediaBoostInfo, runImopediaBoost } from "@/lib/portals/imopedia/boost.functions";

export const IMOPEDIA_BOOST_CONFIRM =
  "Consumă 1 boost din pachetul agenției. Oferta urcă pe primul loc în categoria ei (Gold sau Standard), dar poate fi depășită de boost-uri ulterioare.";

/** Butonul „Ridică pe primul loc (boost)” — doar pentru oferte publicate pe Imopedia. */
export function ImopediaBoostButton({ organizationId, propertyId }: { organizationId?: string; propertyId: string }) {
  const infoFn = useServerFn(getImopediaBoostInfo);
  const boostFn = useServerFn(runImopediaBoost);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const payload = { ...(organizationId ? { organizationId } : {}), propertyId };
  const key = ["imopedia-boost", organizationId, propertyId] as const;
  const info = useQuery({ queryKey: key, queryFn: () => infoFn({ data: payload }), staleTime: 5 * 60_000 });
  const boost = useMutation({
    mutationFn: () => boostFn({ data: payload }),
    onSuccess: (r) => {
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      void qc.invalidateQueries({ queryKey: key });
    },
  });
  if (!info.data?.published) return null;
  const available = info.data.available;
  const none = available === 0;
  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs text-muted-foreground">
        {info.data.error ? `Boost-uri: necunoscute (${info.data.error})` : `Boost-uri disponibile: ${available ?? "necunoscut"}`}
      </p>
      <Button size="sm" variant="outline" disabled={none || boost.isPending} onClick={() => setOpen(true)}>
        Ridică pe primul loc (boost)
      </Button>
      {none ? <p className="text-xs text-muted-foreground">Agenția nu mai are boost-uri în pachetul Imopedia.</p> : null}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ridici oferta pe primul loc?</AlertDialogTitle>
            <AlertDialogDescription>{IMOPEDIA_BOOST_CONFIRM}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Renunță</AlertDialogCancel>
            <AlertDialogAction onClick={() => boost.mutate()}>Folosește 1 boost</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
