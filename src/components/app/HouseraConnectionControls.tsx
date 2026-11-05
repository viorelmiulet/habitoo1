import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/app/StatusBadge";
import { disconnectHousera, startHouseraConnect } from "@/lib/portals/housera.functions";
import { HOUSERA_APPROVAL_NOTE, HOUSERA_DISCONNECT_NOTE, HOUSERA_MISSING_MESSAGE, houseraExpiresSoon, type HouseraOAuthInfo } from "@/lib/portals/housera/config";

const RESULT: Record<string, string> = {
  invalid_state: "Linkul de conectare Housera a expirat sau a fost deja folosit. Reia conectarea.",
  forbidden: "Doar administratorul agenției sau SuperAdmin poate conecta Housera.",
  access_denied: "Accesul a fost refuzat în Housera. Conectarea nu s-a făcut.",
  invalid_request: "Cererea de conectare către Housera nu a fost validă. Reia conectarea.",
  invalid_scope: "Housera nu a aprobat drepturile cerute pentru Habitoo.",
  unsupported_response_type: "Housera nu acceptă tipul de cerere trimis. Reia conectarea.",
  invalid_grant: "Codul a expirat, reia conectarea.",
};

/** Mesajul de întoarcere din callback (`?housera=`), o singură dată. */
export function useHouseraCallbackToast() {
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("housera");
    if (!r) return;
    if (r === "connected") toast.success("Contul Housera al agenției a fost conectat.");
    else toast.error(RESULT[r] ?? "Conectarea Housera nu s-a finalizat. Reia conectarea.");
  }, []);
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });

export function HouseraConnectionControls(props: {
  organizationId: string;
  configured: boolean;
  connected: boolean;
  oauth: HouseraOAuthInfo | null | undefined;
  beforeConnect?: () => Promise<unknown>;
  onChanged?: () => void;
}) {
  const start = useServerFn(startHouseraConnect);
  const disconnect = useServerFn(disconnectHousera);
  const connect = useMutation({
    mutationFn: async () => {
      await props.beforeConnect?.();
      const { url } = await start({ data: { organizationId: props.organizationId } });
      window.location.assign(url);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const drop = useMutation({
    mutationFn: () => disconnect({ data: { organizationId: props.organizationId } }),
    onSuccess: () => { toast.success("Cheia Housera a fost ștearsă din Habitoo."); props.onChanged?.(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const expiresAt = props.oauth?.expiresAt ?? null;
  const soon = props.connected && houseraExpiresSoon(expiresAt, Date.now());
  return (
    <div className="w-full space-y-2">
      {props.connected ? (
        <div className="space-y-1">
          <StatusBadge className="h-7 text-[13px]" tone="success" dot>
            {expiresAt ? `Conectat · valabil până la ${fmt(expiresAt)}` : "Conectat"}
          </StatusBadge>
          {props.oauth?.scopes.length ? (
            <p className="text-[13px] text-muted-foreground">Drepturi: {props.oauth.scopes.join(", ")}</p>
          ) : null}
        </div>
      ) : null}
      {soon ? <p role="alert" className="rounded-xl bg-gold-tint p-3 text-sm font-semibold">Reconectează Housera</p> : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button className="h-auto min-h-11 w-full whitespace-normal sm:w-auto" disabled={!props.configured || connect.isPending} onClick={() => connect.mutate()}>
          {!props.configured ? HOUSERA_MISSING_MESSAGE : props.connected ? "Reconectează Housera" : "Conectează cu Housera"}
        </Button>
        {props.connected ? (
          <Button variant="outline" className="min-h-11 w-full sm:w-auto" disabled={drop.isPending} onClick={() => drop.mutate()}>Deconectează</Button>
        ) : null}
      </div>
      <p className="text-[13px] text-muted-foreground">{HOUSERA_APPROVAL_NOTE}</p>
      {props.connected ? <p className="text-[13px] text-muted-foreground">{HOUSERA_DISCONNECT_NOTE}</p> : null}
    </div>
  );
}
