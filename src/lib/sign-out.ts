import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { clearImpersonationId } from "@/lib/impersonation-client";

/** Curăță în ordine toate stările legate de identitate înainte de redirecționare. */
export async function clearAuthenticatedSession(queryClient: QueryClient) {
  await queryClient.cancelQueries();
  queryClient.clear();
  clearImpersonationId();

  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw error;
}