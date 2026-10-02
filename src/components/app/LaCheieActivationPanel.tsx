import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { InlineLoading } from "@/components/app/LoadingState";
import {
  activateLaCheieAgency,
  getLaCheieAgencyStatusForAgency,
} from "@/lib/portals/lacheie.functions";

export function LaCheieActivationPanel({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const loadStatus = useServerFn(getLaCheieAgencyStatusForAgency);
  const activate = useServerFn(activateLaCheieAgency);

  const status = useQuery({
    queryKey: ["lacheie-agency-self", organizationId],
    queryFn: () => loadStatus({ data: { organizationId } }),
  });

  const request = useMutation({
    mutationFn: () => activate({ data: { organizationId } }),
    onSuccess: () => {
      toast.success("La Cheie a fost activat.");
      void queryClient.invalidateQueries({ queryKey: ["lacheie-agency-self"] });
      void queryClient.invalidateQueries({ queryKey: ["agency-portal-catalog"] });
    },
    onError: () => toast.error("Activarea nu a reușit acum. Încearcă din nou sau scrie-ne."),
  });

  if (status.isLoading) return <InlineLoading label="Se verifică starea…" />;
  if (status.isError || !status.data) {
    return (
      <p className="text-xs text-destructive">
        Activarea nu a reușit acum. Încearcă din nou sau scrie-ne.
      </p>
    );
  }

  const view = status.data;
  const blocked = !view.canActivate;

  return (
    <div className="flex w-full flex-col gap-2">
      {view.missingFields.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Completează datele agenției în{" "}
          <Link to="/app/settings" search={{ tab: "agency" }} className="underline">
            Setări
          </Link>
          , apoi cere activarea.
        </p>
      ) : null}
      <Button
        className="h-11 w-full sm:w-auto"
        disabled={blocked || request.isPending}
        onClick={() => request.mutate()}
      >
        {request.isPending ? "Se trimite…" : "Solicită activarea"}
      </Button>
    </div>
  );
}
