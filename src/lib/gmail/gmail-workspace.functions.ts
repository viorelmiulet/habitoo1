/**
 * Starea Gmail-ului Habitoos (contul workspace-ului), doar pentru SuperAdmin.
 *
 * Citirea se face prin gateway, iar browserul primește exclusiv adresa și
 * numărătorile — niciodată cheile de acces.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WorkspaceGmailOverview = {
  /** Piesele de configurare lipsă — nume, niciodată valori. */
  configured: boolean;
  missing: string[];
  profile: { email: string; messagesTotal: number; threadsTotal: number } | null;
  /** Configurarea există, dar citirea a eșuat. */
  checkFailed: boolean;
};

export const getWorkspaceGmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkspaceGmailOverview> => {
    const { data: isSuper, error } = await context.supabase.rpc("is_superadmin");
    if (error || isSuper !== true) throw new Error("Acces refuzat.");

    const { workspaceGmailConfigStatus, readWorkspaceGmailProfile } = await import(
      "@/lib/gmail/gmail-workspace.server"
    );
    const { configured, missing } = workspaceGmailConfigStatus();
    if (!configured) return { configured: false, missing, profile: null, checkFailed: false };

    try {
      const profile = await readWorkspaceGmailProfile();
      return { configured: true, missing: [], profile, checkFailed: false };
    } catch {
      return { configured: true, missing: [], profile: null, checkFailed: true };
    }
  });
