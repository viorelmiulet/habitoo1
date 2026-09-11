import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { EyeOff, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { revokeImpersonation } from "@/lib/impersonation.functions";
import { clearImpersonationId, formatRemaining } from "@/lib/impersonation-client";
import { currentUserQueryKey, type CurrentUser } from "@/hooks/use-session";

/**
 * Banner permanent, imposibil de ratat: superadminul trebuie să știe în orice
 * moment că nu lucrează în contul lui și cât timp mai are.
 */
export function ImpersonationBanner({ user }: { user: CurrentUser }) {
  const session = user.impersonation;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const revoke = useServerFn(revokeImpersonation);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const expired = session ? new Date(session.expiresAt).getTime() <= now : false;

  useEffect(() => {
    if (!expired) return;
    clearImpersonationId();
    toast.info("Sesiunea de acces a expirat. Ai revenit în contul tău.");
    void queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
    void navigate({ to: "/superadmin/users" });
  }, [expired, navigate, queryClient]);

  if (!session) return null;

  const exit = async () => {
    try {
      await revoke({ data: { id: session.id } });
    } catch {
      /* sesiunea poate fi deja închisă */
    }
    clearImpersonationId();
    await queryClient.invalidateQueries();
    toast.success("Ai ieșit din contul utilizatorului.");
    void navigate({ to: "/superadmin/users" });
  };

  const name = user.profile?.full_name || user.email || "utilizator";

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-b border-gold/50 bg-gold/20 px-4 py-2 text-center text-sm font-medium text-foreground"
    >
      <EyeOff className="size-4 shrink-0" />
      <span>
        Ești conectat ca <strong>{name}</strong> ({user.email ?? "—"})
      </span>
      <span className="text-muted-foreground">·</span>
      <span>Expiră în {formatRemaining(session.expiresAt, now)}</span>
      <span className="text-muted-foreground">·</span>
      <Button size="sm" variant="outline" onClick={() => void exit()}>
        <LogOut className="size-4" /> Ieși din cont
      </Button>
    </div>
  );
}

/** Bannerul văzut de utilizatorul al cărui cont este accesat. */
export function ImpersonatedUserBanner({
  requestId,
  superadminName,
  expiresAt,
}: {
  requestId: string;
  superadminName: string;
  expiresAt: string;
}) {
  const queryClient = useQueryClient();
  const revoke = useServerFn(revokeImpersonation);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-b border-warning/40 bg-warning/15 px-4 py-2 text-center text-sm font-medium text-warning-foreground"
    >
      <span>
        <strong>{superadminName}</strong> are acces temporar la contul tău · expiră în{" "}
        {formatRemaining(expiresAt, now)}
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          try {
            await revoke({ data: { id: requestId } });
            toast.success("Accesul a fost revocat.");
            await queryClient.invalidateQueries();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Revocarea a eșuat.");
          }
        }}
      >
        Revocă acum
      </Button>
    </div>
  );
}
