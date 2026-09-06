// Operațiuni administrative pe agenții, disponibile exclusiv superadminului.
// Rolul este re-verificat pe server (RPC acoperit de RLS) și încă o dată în funcția SQL
// `superadmin_delete_organization`, care rulează totul într-o singură tranzacție.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AuthContext = {
  supabase: {
    rpc: (
      fn: "is_superadmin",
    ) => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
  };
  userId: string;
};

async function assertSuperadmin(context: AuthContext) {
  const { data, error } = await context.supabase.rpc("is_superadmin");
  if (error || data !== true) {
    throw new Error("Acces refuzat: acțiunea este permisă exclusiv superadminului.");
  }
  return context.userId;
}

export type DeleteOrganizationResult = {
  organizationId: string;
  organizationName: string;
  deletedRows: Record<string, number>;
  deletedAuthUsers: number;
  authErrors: string[];
  storageRemoved: number;
};

/**
 * Ștergere definitivă (hard delete) a unei agenții și a tuturor datelor ei.
 * Ordinea: fișiere din storage → tranzacția SQL (audit log + cascadă) → conturi de autentificare.
 */
export const deleteOrganizationPermanently = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ organizationId: z.string().uuid(), confirmName: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<DeleteOrganizationResult> => {
    const actorId = await assertSuperadmin(context as AuthContext);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { MEDIA_BUCKET, DOCS_BUCKET } = await import("@/lib/storage");

    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("id,name")
      .eq("id", data.organizationId)
      .maybeSingle();
    if (orgError) throw new Error(orgError.message);
    if (!org) throw new Error("Agenția nu există sau a fost deja ștearsă.");
    if (org.name.trim() !== data.confirmName.trim()) {
      throw new Error("Numele scris nu corespunde numelui agenției.");
    }

    // 1. Fișiere din storage care aparțin exclusiv acestei agenții.
    let storageRemoved = 0;
    const [{ data: images }, { data: docs }] = await Promise.all([
      supabaseAdmin
        .from("property_images")
        .select("storage_path")
        .eq("organization_id", org.id)
        .not("storage_path", "is", null),
      supabaseAdmin
        .from("documents")
        .select("storage_path")
        .eq("organization_id", org.id),
    ]);
    const mediaPaths = (images ?? [])
      .map((r) => r.storage_path)
      .filter((p): p is string => typeof p === "string" && p.length > 0);
    const docPaths = (docs ?? [])
      .map((r) => r.storage_path)
      .filter((p): p is string => typeof p === "string" && p.length > 0);
    for (const [bucket, paths] of [
      [MEDIA_BUCKET, mediaPaths],
      [DOCS_BUCKET, docPaths],
    ] as const) {
      for (let i = 0; i < paths.length; i += 100) {
        const chunk = paths.slice(i, i + 100);
        const { data: removed } = await supabaseAdmin.storage.from(bucket).remove(chunk);
        storageRemoved += removed?.length ?? 0;
      }
    }

    // 2. Tranzacția SQL: audit log permanent + ștergerea în cascadă.
    const { data: result, error } = await supabaseAdmin.rpc("superadmin_delete_organization", {
      _org: org.id,
      _actor: actorId,
    });
    if (error) throw new Error(error.message);

    const payload = (result ?? {}) as {
      deleted_rows?: Record<string, number>;
      auth_user_ids?: string[];
      name?: string;
    };

    // 3. Conturile de autentificare ale membrilor (superadminii sunt excluși în SQL).
    const authErrors: string[] = [];
    let deletedAuthUsers = 0;
    for (const userId of payload.auth_user_ids ?? []) {
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authError) authErrors.push(authError.message);
      else deletedAuthUsers += 1;
    }

    return {
      organizationId: org.id,
      organizationName: payload.name ?? org.name,
      deletedRows: payload.deleted_rows ?? {},
      deletedAuthUsers,
      authErrors,
      storageRemoved,
    };
  });
