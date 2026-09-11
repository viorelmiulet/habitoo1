// Acces temporar al superadminului în contul unui utilizator, cu acordul acestuia.
//
// Sesiunea NU poate fi falsificată din client: superadminul își păstrează propria
// sesiune de autentificare, iar identitatea „acting as” trăiește exclusiv ca rând
// aprobat și neexpirat în `impersonation_requests`. Clientul trimite doar id-ul
// cererii, validat la fiecare apel prin `impersonation_target()` (security definer).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AppRole } from "@/hooks/use-session";
import type { Tables } from "@/integrations/supabase/types";

type AuthContext = {
  supabase: {
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    from: (table: string) => never;
  };
  userId: string;
};

export type ImpersonationRow = {
  id: string;
  superadmin_id: string;
  target_user_id: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "expired" | "revoked";
  mode: "full" | "read_only";
  requested_at: string;
  responded_at: string | null;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  superadmin_name: string | null;
  superadmin_email: string | null;
  target_name: string | null;
  target_email: string | null;
};

export type ImpersonationSession = {
  id: string;
  expiresAt: string;
  mode: "full" | "read_only";
  reason: string;
  realUserId: string;
  realEmail: string | null;
  realName: string | null;
  target: {
    userId: string;
    email: string | null;
    profile: Tables<"profiles"> | null;
    organization: Tables<"organizations"> | null;
    roles: AppRole[];
  };
};

async function assertSuperadmin(context: AuthContext) {
  const { data, error } = await context.supabase.rpc("is_superadmin");
  if (error || data !== true) {
    throw new Error("Acces refuzat: acțiunea este permisă exclusiv superadminului.");
  }
}

/**
 * Refuză acțiunile administrative cât timp superadminul are o sesiune de
 * impersonare activă — verificare server-side, nu doar ascundere în UI.
 */
export async function assertNoActiveImpersonation(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("impersonation_requests")
    .select("id")
    .eq("superadmin_id", userId)
    .eq("status", "approved")
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if (data && data.length > 0) {
    throw new Error(
      "Acțiune blocată: ieși mai întâi din sesiunea de acces la contul utilizatorului.",
    );
  }
}

async function hydrate(rows: Record<string, unknown>[]): Promise<ImpersonationRow[]> {
  if (rows.length === 0) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ids = Array.from(
    new Set(rows.flatMap((r) => [r["superadmin_id"] as string, r["target_user_id"] as string])),
  );
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id,full_name,email")
    .in("id", ids);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return rows.map((r) => {
    const sup = byId.get(r["superadmin_id"] as string);
    const tgt = byId.get(r["target_user_id"] as string);
    return {
      ...(r as unknown as ImpersonationRow),
      superadmin_name: sup?.full_name ?? null,
      superadmin_email: sup?.email ?? null,
      target_name: tgt?.full_name ?? null,
      target_email: tgt?.email ?? null,
    };
  });
}

/** Superadminul cere acces. Motivul este obligatoriu și ajunge în notificare, email și audit. */
export const requestImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ targetUserId: z.string().uuid(), reason: z.string().trim().min(10).max(500) })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ id: string; emailSent: boolean }> => {
    const ctx = context as unknown as AuthContext;
    await assertSuperadmin(ctx);

    const { data: id, error } = await ctx.supabase.rpc("impersonation_request_create", {
      _target: data.targetUserId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);

    // Token pentru aprobarea din email: valoarea brută pleacă doar în email,
    // în baza de date rămâne exclusiv hash-ul SHA-256.
    const { generateToken, sha256Hex } = await import("@/lib/impersonation-token.functions");
    const approveToken = generateToken();
    await ctx.supabase.rpc("impersonation_set_approve_token", {
      _id: id,
      _hash: await sha256Hex(approveToken),
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: target }, { data: requester }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("full_name,email")
        .eq("id", data.targetUserId)
        .maybeSingle(),
      supabaseAdmin.from("profiles").select("full_name,email").eq("id", ctx.userId).maybeSingle(),
    ]);

    let emailSent = false;
    try {
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (apiKey && target?.email) {
        const [{ sendLovableEmail }, { render }, { ImpersonationRequestEmail }] = await Promise.all([
          import("@lovable.dev/email-js"),
          import("@react-email/render"),
          import("@/lib/email-templates/impersonation-request"),
        ]);
        const React = await import("react");
        const base = `https://crm.habitoo.ro/acces-cont?id=${String(id)}&token=${approveToken}`;
        const element = React.createElement(ImpersonationRequestEmail, {
          siteName: "Habitoo CRM",
          appUrl: "https://crm.habitoo.ro/app/settings",
          approveUrl: `${base}&actiune=aprob`,
          rejectUrl: `${base}&actiune=resping`,
          fullName: target.full_name ?? undefined,
          requesterName: requester?.full_name || "Superadmin Habitoo",
          reason: data.reason,
        });
        const [html, text] = await Promise.all([
          render(element),
          render(element, { plainText: true }),
        ]);
        await sendLovableEmail(
          {
            to: target.email,
            from: "Habitoo CRM <noreply@habitoo.ro>",
            sender_domain: "notify.habitoo.ro",
            subject: "Cerere de acces temporar la contul tău Habitoo",
            html,
            text,
            idempotency_key: `impersonation-request-${String(id)}`,
          },
          { apiKey, sendUrl: process.env["LOVABLE_SEND_URL"] },
        );
        emailSent = true;
      }
    } catch (e) {
      console.error("[impersonation] request email failed", e);
    }

    return { id: String(id), emailSent };
  });

/** Utilizatorul acceptă sau respinge cererea primită. */
export const respondImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), accept: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthContext;
    const { error } = await ctx.supabase.rpc("impersonation_respond", {
      _id: data.id,
      _accept: data.accept,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Revocare: de către utilizator oricând, sau de superadmin la ieșirea din sesiune. */
export const revokeImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthContext;
    const { error } = await ctx.supabase.rpc("impersonation_revoke", { _id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Validează sesiunea și întoarce identitatea în care lucrează superadminul.
 * `null` înseamnă sesiune inexistentă, respinsă, revocată sau expirată.
 */
export const getImpersonationSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<ImpersonationSession | null> => {
    const ctx = context as unknown as AuthContext;
    const { data: targetId, error } = await ctx.supabase.rpc("impersonation_target", {
      _id: data.id,
    });
    if (error || !targetId || typeof targetId !== "string") return null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: row }, { data: profile }, { data: roleRows }, { data: real }] = await Promise.all(
      [
        supabaseAdmin
          .from("impersonation_requests")
          .select("expires_at,mode,reason")
          .eq("id", data.id)
          .single(),
        supabaseAdmin.from("profiles").select("*").eq("id", targetId).maybeSingle(),
        supabaseAdmin.from("user_roles").select("role").eq("user_id", targetId),
        supabaseAdmin.from("profiles").select("full_name,email").eq("id", ctx.userId).maybeSingle(),
      ],
    );

    let organization: Tables<"organizations"> | null = null;
    if (profile?.organization_id) {
      const { data: org } = await supabaseAdmin
        .from("organizations")
        .select("*")
        .eq("id", profile.organization_id)
        .maybeSingle();
      organization = org ?? null;
    }

    const roles = (roleRows ?? []).map((r) => r.role as AppRole);
    return {
      id: data.id,
      expiresAt: row?.expires_at ?? new Date().toISOString(),
      mode: (row?.mode as "full" | "read_only") ?? "full",
      reason: row?.reason ?? "",
      realUserId: ctx.userId,
      realEmail: real?.email ?? null,
      realName: real?.full_name ?? null,
      target: {
        userId: targetId,
        email: profile?.email ?? null,
        profile: profile ?? null,
        organization,
        roles: roles.length > 0 ? roles : ["agent"],
      },
    };
  });

/** Ecranul de transparență al utilizatorului: cereri primite, sesiune activă, istoric. */
export const listMyImpersonationAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImpersonationRow[]> => {
    const ctx = context as unknown as AuthContext;
    await ctx.supabase.rpc("impersonation_expire_stale");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("impersonation_requests")
      .select(
        "id,superadmin_id,target_user_id,reason,status,mode,requested_at,responded_at,expires_at,revoked_at,last_used_at",
      )
      .eq("target_user_id", ctx.userId)
      .order("requested_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return hydrate((data ?? []) as unknown as Record<string, unknown>[]);
  });

/** Cererile/sesiunile iniţiate de superadminul curent. */
export const listMyImpersonationRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImpersonationRow[]> => {
    const ctx = context as unknown as AuthContext;
    await assertSuperadmin(ctx);
    await ctx.supabase.rpc("impersonation_expire_stale");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("impersonation_requests")
      .select(
        "id,superadmin_id,target_user_id,reason,status,mode,requested_at,responded_at,expires_at,revoked_at,last_used_at",
      )
      .eq("superadmin_id", ctx.userId)
      .order("requested_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return hydrate((data ?? []) as unknown as Record<string, unknown>[]);
  });
