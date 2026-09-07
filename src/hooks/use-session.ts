import type { OrgBlockReason } from "@/lib/org-access";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type AppRole = "superadmin" | "agency_admin" | "agent";

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
};

export const currentUserQueryKey = ["current-user"] as const;

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

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
  };
}

export function useCurrentUser() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
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
