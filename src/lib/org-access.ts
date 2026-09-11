// Blocare reală (server-side) a accesului pentru agențiile suspendate, anulate sau arhivate.
// Rulează imediat după validarea tokenului JWT, pe orice server function care
// folosește `requireActiveOrgAuth` în loc de `requireSupabaseAuth`.
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OrgBlockReason = "suspended" | "archived" | "cancelled" | "pending_approval";

/** Prefix distinct, ca frontendul să poată afișa o pagină dedicată. */
export const ORG_BLOCKED_CODE = "ORG_ACCESS_BLOCKED";

export const ORG_BLOCKED_MESSAGES: Record<OrgBlockReason, string> = {
  suspended: "Contul agenției tale este suspendat. Contactează administratorul platformei.",
  archived: "Contul agenției tale a fost arhivat. Contactează administratorul platformei.",
  cancelled: "Contul agenției tale a fost anulat. Contactează administratorul platformei.",
  pending_approval:
    "Contul agenției tale așteaptă aprobare. Vei primi acces imediat ce este validat.",
};

export function orgBlockedError(reason: OrgBlockReason): Error {
  const error = new Error(`${ORG_BLOCKED_CODE}:${reason}: ${ORG_BLOCKED_MESSAGES[reason]}`);
  (error as Error & { code?: string; reason?: OrgBlockReason }).code = ORG_BLOCKED_CODE;
  (error as Error & { code?: string; reason?: OrgBlockReason }).reason = reason;
  return error;
}

/** Extrage motivul blocării dintr-o eroare venită de la server, dacă există. */
export function parseOrgBlocked(error: unknown): OrgBlockReason | null {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!raw.includes(ORG_BLOCKED_CODE)) return null;
  if (raw.includes(":archived")) return "archived";
  if (raw.includes(":cancelled")) return "cancelled";
  if (raw.includes(":pending_approval")) return "pending_approval";
  return "suspended";
}

export function orgBlockReason(
  org:
    | {
        status?: string | null;
        archived_at?: string | null;
      }
    | null
    | undefined,
): OrgBlockReason | null {
  if (!org) return null;
  if (org.archived_at) return "archived";
  if (org.status === "suspended") return "suspended";
  if (org.status === "cancelled") return "cancelled";
  if (org.status === "pending_approval") return "pending_approval";
  return null;
}

export const requireActiveOrgAuth = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = (context as { userId: string }).userId;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();

    // Superadminii nu aparțin unei agenții — nu pot fi blocați de această regulă.
    if (!profile?.organization_id) return next();

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if ((roles ?? []).some((r) => r.role === "superadmin")) return next();

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("status,archived_at")
      .eq("id", profile.organization_id)
      .maybeSingle();

    const reason = orgBlockReason(org);
    if (reason) throw orgBlockedError(reason);

    return next();
  });
