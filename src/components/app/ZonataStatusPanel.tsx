/** Statusul anunțurilor ZonaTa pe cardul din Publicare; se verifică la deschidere (max 1/min/anunț). */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getZonataListingStatus } from "@/lib/portals/zonata/status.functions";
import { ZONATA_STATUS_LABEL, type ZonataStatus } from "@/lib/portals/zonata/publish";
import { formatDateTime } from "@/lib/format";

export function ZonataStatusPanel({ organizationId, propertyId }: { organizationId?: string; propertyId: string }) {
  const run = useServerFn(getZonataListingStatus);
  const q = useQuery({
    queryKey: ["zonata-status", organizationId ?? null, propertyId],
    queryFn: () => run({ data: { propertyId, ...(organizationId ? { organizationId } : {}) } }),
    refetchInterval: (query) => ((query.state.data ?? []).some((r) => r.status === "in_review") ? 5 * 60_000 : false),
    staleTime: 60_000,
  });
  const rows = q.data ?? [];
  if (rows.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
      {rows.map((r) => (
        <li key={r.externalId}>
          {rows.length > 1 ? <span className="font-medium text-foreground">{r.transaction === "sale" ? "Vânzare" : "Închiriere"}: </span> : null}
          <span className="font-medium text-foreground">{ZONATA_STATUS_LABEL[r.status as ZonataStatus] ?? r.status}</span>
          {r.status === "rejected" && r.rejectedReason ? ` — ${r.rejectedReason}` : null}
          {r.status === "active" && r.expiresAt ? ` · expiră la ${formatDateTime(r.expiresAt)}` : null}
          {r.status === "active" && r.url ? (
            <>
              {" · "}
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="pointer-events-auto text-primary underline">
                Vezi anunțul
              </a>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
