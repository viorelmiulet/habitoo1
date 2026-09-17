/**
 * La Cheie — activare self-service pentru administratorul agenției.
 *
 * La Cheie aprobă automat cererile valide, deci nu trecem prin coada de aprobare
 * a Superadminului: butonul apelează direct `activateLaCheieAgency`. Panoul arată
 * READ-ONLY ce se va trimite (nume, email administrator, telefon, adresă) și
 * câmpurile lipsă. Nicio cheie, niciun jurnal, nicio versiune aici.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/app/StatusBadge";
import { InlineLoading } from "@/components/app/LoadingState";
import {
  activateLaCheieAgency,
  getLaCheieAgencyStatusForAgency,
} from "@/lib/portals/lacheie.functions";

const STATUS_TONE = {
  active: "success",
  suspended: "danger",
  error: "danger",
  inactive: "warning",
  not_registered: "neutral",
} as const;

export function LaCheieActivationPanel() {
  const queryClient = useQueryClient();
  const loadStatus = useServerFn(getLaCheieAgencyStatusForAgency);
  const activate = useServerFn(activateLaCheieAgency);

  const status = useQuery({
    queryKey: ["lacheie-agency-self"],
    queryFn: () => loadStatus({ data: {} }),
  });

  const request = useMutation({
    mutationFn: () => activate({ data: {} }),
    onSuccess: (result) => {
      toast.success(
        result.reactivated
          ? "Agenția a fost reactivată la LaCheie.ro. Retrimite ofertele din fila Publicare."
          : "Agenția a fost activată la LaCheie.ro.",
      );
      void queryClient.invalidateQueries({ queryKey: ["lacheie-agency-self"] });
      void queryClient.invalidateQueries({ queryKey: ["agency-portal-catalog"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (status.isLoading) return <InlineLoading label="Se verifică starea LaCheie.ro…" />;
  if (status.isError || !status.data) return null;

  const view = status.data;
  const rows: { label: string; value: string | null }[] = [
    { label: "Denumire agenție", value: view.data.name },
    { label: "Email administrator", value: view.data.adminEmail },
    { label: "Telefon", value: view.data.phone },
    { label: "Adresa agenției", value: view.data.address },
  ];
  const blocked = !view.canActivate;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={STATUS_TONE[view.status]} dot={view.status === "active"}>
          {view.statusLabel}
        </StatusBadge>
      </div>

      <dl className="grid gap-1 text-xs">
        <p className="text-muted-foreground">Se va trimite la LaCheie.ro:</p>
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className={row.value ? "text-right font-medium" : "text-right text-destructive"}>
              {row.value ?? "lipsește"}
            </dd>
          </div>
        ))}
      </dl>

      {view.missingFields.length > 0 ? (
        <p className="text-xs text-destructive">
          Completează: {view.missingFields.join(", ")}.{" "}
          <Link to="/app/settings" className="underline">
            Deschide setările agenției
          </Link>
        </p>
      ) : null}
      {view.issues.length > 0 ? (
        <p className="text-xs text-muted-foreground">{view.issues.join(" ")}</p>
      ) : null}
      {view.error ? <p className="text-xs text-destructive">{view.error}</p> : null}

      {view.suspended ? (
        <p className="text-xs font-medium text-destructive">Contactați La Cheie.</p>
      ) : null}

      <Button
        size="sm"
        className="w-full"
        disabled={blocked || request.isPending}
        onClick={() => request.mutate()}
      >
        {view.status === "active"
          ? "Activă la LaCheie.ro"
          : request.isPending
            ? "Se trimite…"
            : "Solicită activarea LaCheie.ro"}
      </Button>
    </div>
  );
}
