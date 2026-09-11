import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Check, ShieldQuestion, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { ImpersonatedUserBanner } from "@/components/app/ImpersonationBanner";
import { formatDateTime } from "@/lib/format";
import {
  listMyImpersonationAccess,
  respondImpersonation,
  revokeImpersonation,
  type ImpersonationRow,
} from "@/lib/impersonation.functions";

const statusLabels: Record<ImpersonationRow["status"], string> = {
  pending: "În așteptare",
  approved: "Acces activ",
  rejected: "Respinsă",
  expired: "Expirată",
  revoked: "Revocată",
};

const statusTones: Record<ImpersonationRow["status"], "warning" | "success" | "neutral"> = {
  pending: "warning",
  approved: "success",
  rejected: "neutral",
  expired: "neutral",
  revoked: "neutral",
};

export function useMyAccountAccess(enabled = true) {
  const fetchAccess = useServerFn(listMyImpersonationAccess);
  return useQuery({
    queryKey: ["account-access"],
    enabled,
    queryFn: () => fetchAccess({}),
    refetchInterval: 60_000,
  });
}

function isLive(r: ImpersonationRow) {
  return r.status === "approved" && new Date(r.expires_at).getTime() > Date.now();
}

/** Bannerul de transparență pentru utilizatorul al cărui cont este accesat acum. */
export function ActiveAccessBanner({ enabled }: { enabled: boolean }) {
  const access = useMyAccountAccess(enabled);
  const live = (access.data ?? []).find(isLive);
  if (!live) return null;
  return (
    <ImpersonatedUserBanner
      requestId={live.id}
      superadminName={live.superadmin_name || "Un superadmin Habitoo"}
      expiresAt={live.expires_at}
    />
  );
}

/**
 * Transparență completă pentru utilizator: cererile primite, sesiunea activă și
 * istoricul acceselor la contul lui.
 */
export function AccountAccessCard({ highlightedRequestId }: { highlightedRequestId?: string }) {
  const access = useMyAccountAccess();
  const queryClient = useQueryClient();
  const respond = useServerFn(respondImpersonation);
  const revoke = useServerFn(revokeImpersonation);
  const highlightedRef = useRef<HTMLLIElement>(null);
  const [isHighlighted, setIsHighlighted] = useState(Boolean(highlightedRequestId));

  const rows = access.data ?? [];
  const pending = rows.filter((r) => r.status === "pending");
  const live = rows.filter(isLive);
  const history = rows.filter((r) => r.status !== "pending" && !isLive(r));

  useEffect(() => {
    if (!highlightedRequestId || access.isLoading) return;
    setIsHighlighted(true);
    highlightedRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timeout = window.setTimeout(() => setIsHighlighted(false), 3_000);
    return () => window.clearTimeout(timeout);
  }, [access.isLoading, highlightedRequestId]);

  const refresh = () => queryClient.invalidateQueries();

  const answer = async (id: string, accept: boolean) => {
    try {
      await respond({ data: { id, accept } });
      toast.success(accept ? "Ai aprobat accesul pentru 24 de ore." : "Cererea a fost respinsă.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Acțiunea a eșuat.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <h3 className="text-sm font-semibold">Cereri de acces la contul tău</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Echipa Habitoo poate cere acces temporar la contul tău pentru asistență. Accesul durează 24
          de ore de la aprobare, expiră automat și poate fi revocat oricând. Parola, emailul și modul
          de autentificare nu pot fi modificate în timpul accesului, iar fiecare acțiune este
          jurnalizată.
        </p>

        {pending.length === 0 && live.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon={ShieldQuestion} title="Nicio cerere în așteptare" />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {pending.map((r) => (
              <li
                key={r.id}
                ref={r.id === highlightedRequestId ? highlightedRef : undefined}
                className={`rounded-xl border border-warning/40 bg-warning/10 p-3 transition-shadow duration-500 ${
                  r.id === highlightedRequestId && isHighlighted ? "ring-2 ring-primary ring-offset-2" : ""
                }`}
              >
                <p className="text-sm font-medium">
                  {r.superadmin_name || "Superadmin Habitoo"}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({r.superadmin_email ?? "—"})
                  </span>
                </p>
                <p className="mt-1 text-sm">Motiv: {r.reason}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cerută la {formatDateTime(r.requested_at)} · durată 24 de ore · cererea expiră la{" "}
                  {formatDateTime(r.expires_at)}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => void answer(r.id, true)}>
                    <Check className="size-4" /> Acceptă
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void answer(r.id, false)}>
                    <X className="size-4" /> Respinge
                  </Button>
                </div>
              </li>
            ))}
            {live.map((r) => (
              <li key={r.id} className="rounded-xl border border-success/40 bg-success/10 p-3">
                <p className="text-sm font-medium">
                  Acces activ: {r.superadmin_name || "Superadmin Habitoo"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Aprobat la {r.responded_at ? formatDateTime(r.responded_at) : "—"} · expiră la{" "}
                  {formatDateTime(r.expires_at)}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={async () => {
                    try {
                      await revoke({ data: { id: r.id } });
                      toast.success("Accesul a fost revocat.");
                      await refresh();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Revocarea a eșuat.");
                    }
                  }}
                >
                  Revocă acum
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel p-4">
        <h3 className="text-sm font-semibold">Istoricul acceselor</h3>
        {history.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Nimeni nu a accesat contul tău până acum.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border text-sm">
            {history.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                <StatusBadge tone={statusTones[r.status]}>{statusLabels[r.status]}</StatusBadge>
                <span className="min-w-0 flex-1 truncate">
                  {r.superadmin_name || "Superadmin"} — {r.reason}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(r.requested_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
