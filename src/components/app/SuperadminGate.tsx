import { Navigate, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCurrentUser } from "@/hooks/use-session";
import { superadminGateDecision } from "@/lib/superadmin-status";
import { ShellLoading } from "@/components/app/LoadingState";

/**
 * Pagina este rezervată SuperAdmin: oricine altcineva e trimis la ACP, iar
 * conținutul nu se montează deloc — deci nici nu se cer datele de piață.
 */
export function SuperadminGate({
  children,
  redirectTo = "/app/acp",
}: {
  children: ReactNode;
  redirectTo?: LinkProps["to"];
}) {
  const { data: user, isLoading } = useCurrentUser();
  const decision = superadminGateDecision(user, isLoading);

  if (decision === "loading") return <ShellLoading label="Se încarcă…" />;
  if (decision === "signed_out") return <Navigate to="/login" />;
  if (decision === "denied") return <Navigate to={redirectTo} replace />;

  return <>{children}</>;
}
