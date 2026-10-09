// Lista de contacte a chatului: datele vin din RPC-ul `chat_directory` (doar nume,
// poză, agenție, prezență), rulat ca utilizatorul. Pozele sunt private, deci sunt
// semnate pe server, după ce RPC-ul a confirmat ce utilizatori are voie să vadă.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ChatDirectoryEntry = {
  userId: string;
  fullName: string;
  organizationId: string;
  organizationName: string;
  avatarUrl: string | null;
  lastSeenAt: string | null;
};

export const getChatDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChatDirectoryEntry[]> => {
    const { data, error } = await context.supabase.rpc("chat_directory");
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const paths = rows.map((r) => r.avatar_path).filter((p): p is string => Boolean(p));
    const signed = new Map<string, string>();
    if (paths.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: urls } = await supabaseAdmin.storage
        .from("avatars")
        .createSignedUrls(paths, 3600);
      for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
    }
    return rows.map((r) => ({
      userId: r.user_id,
      fullName: r.full_name,
      organizationId: r.organization_id,
      organizationName: r.organization_name,
      avatarUrl: r.avatar_path ? (signed.get(r.avatar_path) ?? null) : null,
      lastSeenAt: r.last_seen_at,
    }));
  });
