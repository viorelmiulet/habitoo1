import type { OrgBlockReason } from "@/lib/org-access";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { clearImpersonationId, getImpersonationId } from "@/lib/impersonation-client";
import { getImpersonationSession } from "@/lib/impersonation.functions";

export type AppRole = "superadmin" | "agency_admin" | "agent";

/** Sesiunea de acces temporar în care lucrează un superadmin. */
export type ImpersonationContext = {
  id: string;
  expiresAt: string;
  mode: "full" | "read_only";
  reason: string;
  realUserId: string;
  realEmail: string | null;
  realName: string | null;
};

export type CurrentUser = {
  userId: string;
  email: string | null;
  profile: Tables<"profiles"> | null;
  organization: Tables<"organizations"> | null;
  roles: AppRole[];
  role: AppRole;
  isSuperadmin: boolean;
  isAdmin: boolean;
  orgBlocked: OrgBlockReason | null;
  /** Cererea de înscriere a agenției; organizația se creează abia la aprobare. */
  registration: Tables<"agency_registration_requests"> | null;
  /** Prezent doar când un superadmin lucrează temporar în contul altcuiva. */
  impersonation: ImpersonationContext | null;
};


export const currentUserQueryKey = ["current-user"] as const;

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  // Sesiune de acces temporar: aplicația se vede exact ca la utilizatorul vizat.
  // Serverul revalidează starea cererii, deci un id inventat local nu are efect.
  const impersonationId = getImpersonationId();
  if (impersonationId) {
    const session = await getImpersonationSession({ data: { id: impersonationId } }).catch(
      () => null,
    );
    if (!session) {
      clearImpersonationId();
    } else {
      const roles = session.target.roles;
      return {
        userId: session.target.userId,
        email: session.target.email,
        profile: session.target.profile,
        organization: session.target.organization,
        roles,
        role: roles.includes("agency_admin") ? "agency_admin" : "agent",
        isSuperadmin: false,
        isAdmin: roles.includes("agency_admin"),
        orgBlocked: null,
        registration: null,
        impersonation: {
          id: session.id,
          expiresAt: session.expiresAt,
          mode: session.mode,
          reason: session.reason,
          realUserId: session.realUserId,
          realEmail: session.realEmail,
          realName: session.realName,
        },
      };
    }
  }



  const [{ data: profile }, { data: roleRows }, { data: blockedRaw }, { data: registration }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id),
      supabase.rpc("org_access_blocked"),
      supabase
        .from("agency_registration_requests")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  let organization: Tables<"organizations"> | null = null;
  if (profile?.organization_id) {
    const { data } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", profile.organization_id)
      .maybeSingle();
    organization = data ?? null;
  }

  const roles = (roleRows ?? []).map((r) => r.role as AppRole);
  const role: AppRole = roles.includes("superadmin")
    ? "superadmin"
    : roles.includes("agency_admin")
      ? "agency_admin"
      : "agent";

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: profile ?? null,
    organization,
    roles,
    role,
    isSuperadmin: roles.includes("superadmin"),
    isAdmin: roles.includes("superadmin") || roles.includes("agency_admin"),
    orgBlocked:
      blockedRaw === "suspended" ||
      blockedRaw === "archived" ||
      blockedRaw === "cancelled" ||
      blockedRaw === "pending_approval"
        ? (blockedRaw as OrgBlockReason)
        : null,
    registration: registration ?? null,
    impersonation: null,
  };

}

export function useCurrentUser() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") return;
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        void queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return useQuery({
    queryKey: currentUserQueryKey,
    queryFn: fetchCurrentUser,
    staleTime: 30_000,
  });
}
