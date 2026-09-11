// Calea de aprobare din email: funcționează fără autentificare, pe baza unui
// token imprevizibil, stocat doar ca hash SHA-256, de unică folosință și valabil
// exclusiv cât timp cererea este în așteptare.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type TokenPreview =
  | { ok: false; reason: "invalid" }
  | {
      ok: true;
      status: "pending" | "approved" | "rejected" | "expired" | "revoked";
      used: boolean;
      reasonText: string;
      superadminName: string | null;
      requestedAt: string;
      expiresAt: string;
    };

export type TokenRespond =
  | { ok: false; reason: "invalid" | "used" | "closed"; status?: string }
  | {
      ok: true;
      accepted: boolean;
      reasonText: string;
      superadminName: string | null;
      expiresAt: string | null;
      revokeToken: string | null;
    };

/** Client publishable, fără sesiune: apelează doar funcțiile SECURITY DEFINER dedicate. */
function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 32 de octeți aleatori — imposibil de ghicit, fără informație despre cerere. */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const tokenInput = z.object({ id: z.string().uuid(), token: z.string().min(32).max(200) });

/** Ce anume se aprobă — afișat înainte de orice acțiune. */
export const previewAccessRequestByToken = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => tokenInput.parse(data))
  .handler(async ({ data }): Promise<TokenPreview> => {
    const { data: raw } = await publicClient().rpc("impersonation_preview_by_token", {
      _id: data.id,
      _hash: await sha256Hex(data.token),
    });
    const r = (raw ?? { ok: false, reason: "invalid" }) as Record<string, unknown>;
    if (r["ok"] !== true) return { ok: false, reason: "invalid" };
    return {
      ok: true,
      status: r["status"] as TokenPreview extends { ok: true } ? never : never,
      used: r["used"] === true,
      reasonText: String(r["reason_text"] ?? ""),
      superadminName: (r["superadmin_name"] as string | null) ?? null,
      requestedAt: String(r["requested_at"] ?? ""),
      expiresAt: String(r["expires_at"] ?? ""),
    } as TokenPreview;
  });

/** Aprobare sau respingere din email. Tokenul se consumă la prima folosire. */
export const respondAccessRequestByToken = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => tokenInput.extend({ accept: z.boolean() }).parse(data))
  .handler(async ({ data }): Promise<TokenRespond> => {
    const { data: raw, error } = await publicClient().rpc("impersonation_respond_by_token", {
      _id: data.id,
      _hash: await sha256Hex(data.token),
      _accept: data.accept,
    });
    if (error) return { ok: false, reason: "invalid" };
    const r = (raw ?? {}) as Record<string, unknown>;
    if (r["ok"] !== true) {
      return {
        ok: false,
        reason: (r["reason"] as "invalid" | "used" | "closed") ?? "invalid",
        status: r["status"] as string | undefined,
      };
    }
    return {
      ok: true,
      accepted: r["accepted"] === true,
      reasonText: String(r["reason_text"] ?? ""),
      superadminName: (r["superadmin_name"] as string | null) ?? null,
      expiresAt: (r["expires_at"] as string | null) ?? null,
      revokeToken: (r["revoke_token"] as string | null) ?? null,
    };
  });

/** Revocare imediată din pagina de confirmare, tot fără autentificare. */
export const revokeAccessByToken = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => tokenInput.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { data: raw, error } = await publicClient().rpc("impersonation_revoke_by_token", {
      _id: data.id,
      _hash: await sha256Hex(data.token),
    });
    if (error) return { ok: false };
    return { ok: (raw as Record<string, unknown> | null)?.["ok"] === true };
  });
