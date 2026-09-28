import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { previewPropertyStatusWithdrawals } from "@/lib/property-status.functions";

type Status = "sold" | "rented" | "archived";

export function isWithdrawStatus(status: string): status is Status {
  return status === "sold" || status === "rented" || status === "archived";
}

/** Lista portalurilor de pe care proprietatea va fi retrasă automat. */
export function StatusWithdrawPreview({
  propertyIds,
  status,
  enabled = true,
}: {
  propertyIds: string[];
  status: Status;
  enabled?: boolean;
}) {
  const previewFn = useServerFn(previewPropertyStatusWithdrawals);
  const ids = [...propertyIds].sort();
  const { data, isLoading } = useQuery({
    queryKey: ["status-withdraw-preview", status, ids],
    queryFn: () => previewFn({ data: { propertyIds: ids, status } }),
    enabled: enabled && ids.length > 0,
  });
  const multi = ids.length > 1;
  if (isLoading) return <p className="text-sm text-muted-foreground">Se verifică portalurile…</p>;
  if (!data || (data.automatic.length === 0 && data.manual.length === 0))
    return (
      <p className="text-sm text-muted-foreground">
        Nu există publicări active pe portaluri. Nu se retrage nimic.
      </p>
    );
  return (
    <div className="space-y-3 text-sm">
      {data.automatic.length > 0 ? (
        <div>
          <p className="font-medium">Se retrage automat, în fundal, de pe:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            {data.automatic.map((p) => (
              <li key={p.portalId}>
                {p.portalName}
                {multi ? ` (${p.count} ${p.count === 1 ? "proprietate" : "proprietăți"})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {data.manual.length > 0 ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
          <p className="font-medium text-warning-foreground">Retragere manuală:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {data.manual.map((p) => (
              <li key={p.portalId}>
                {p.portalName} — trebuie retras manual din contul portalului
                {multi ? ` (${p.count})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Dacă proprietatea redevine „Activă”, nu se republică automat.
      </p>
    </div>
  );
}
