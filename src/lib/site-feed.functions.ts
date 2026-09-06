// Server functions pentru cardul „Integrare API / Feed portaluri” din Setări.
// Tokenul în clar este returnat o singură dată, la generare; ulterior există doar hash-ul.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FeedTokenInfo = {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  requestCount: number;
};

export type FeedAccessLogEntry = {
  endpoint: string;
  method: string;
  status: number;
  items: number | null;
  createdAt: string;
};

export type FeedStatus = {
  organizationId: string;
  apiVersion: string;
  basePath: string;
  token: FeedTokenInfo | null;
  logs: FeedAccessLogEntry[];
};

type AuthContext = {
  supabase: {
    rpc: (fn: "is_org_admin") => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
    from: (table: "profiles") => {
      select: (cols: string) => {
        eq: (
          col: string,
          value: string,
        ) => { maybeSingle: () => PromiseLike<{ data: { organization_id: string | null } | null }> };
      };
    };
  };
  userId: string;
};

async function requireOrgAdmin(context: AuthContext): Promise<string> {
  const { data: isAdmin, error } = await context.supabase.rpc("is_org_admin");
  if (error || isAdmin !== true) {
    throw new Error("Acces refuzat: doar administratorul agenției poate gestiona integrarea API.");
  }
  const { data: profile } = await context.supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (!profile?.organization_id) throw new Error("Agenția nu este configurată.");
  return profile.organization_id;
}

async function loadServer() {
  const [{ supabaseAdmin }, feed] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("@/lib/site-feed/auth.server"),
  ]);
  return { admin: supabaseAdmin, feed };
}

export const getSiteFeedStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FeedStatus> => {
    const organizationId = await requireOrgAdmin(context as unknown as AuthContext);
    const { admin, feed } = await loadServer();

    const [{ data: tokens }, { data: logs }] = await Promise.all([
      admin
        .from("site_feed_tokens")
        .select("id, name, token_prefix, created_at, last_used_at, request_count")
        .eq("organization_id", organizationId)
        .is("revoked_at", null)
        .order("created_at", { ascending: false })
        .limit(1),
      admin
        .from("site_feed_access_logs")
        .select("endpoint, method, status, items, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const row = tokens?.[0];
    return {
      organizationId,
      apiVersion: feed.FEED_API_VERSION,
      basePath: feed.FEED_BASE_PATH,
      token: row
        ? {
            id: row.id,
            name: row.name,
            tokenPrefix: row.token_prefix,
            createdAt: row.created_at,
            lastUsedAt: row.last_used_at,
            requestCount: Number(row.request_count ?? 0),
          }
        : null,
      logs: (logs ?? []).map((l) => ({
        endpoint: l.endpoint,
        method: l.method,
        status: l.status,
        items: l.items,
        createdAt: l.created_at,
      })),
    };
  });

/** Generează un token nou și revocă tokenurile active anterioare ale agenției. */
export const generateSiteFeedToken = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ name: z.string().trim().min(2).max(60).optional() }).parse(data ?? {}),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ token: string; prefix: string }> => {
    const organizationId = await requireOrgAdmin(context as unknown as AuthContext);
    const { admin, feed } = await loadServer();
    const generated = feed.generateFeedToken();

    await admin
      .from("site_feed_tokens")
      .update({ revoked_at: new Date().toISOString(), updated_by: context.userId })
      .eq("organization_id", organizationId)
      .is("revoked_at", null);

    const { error } = await admin.from("site_feed_tokens").insert({
      organization_id: organizationId,
      name: data.name ?? "Feed portaluri",
      token_prefix: generated.prefix,
      token_hash: generated.hash,
      created_by: context.userId,
      updated_by: context.userId,
    });
    if (error) throw new Error("Tokenul nu a putut fi generat.");

    await admin.from("audit_logs").insert({
      organization_id: organizationId,
      actor_id: context.userId,
      action: "site_feed.token_generated",
      entity: "site_feed_tokens",
      new_values: { token_prefix: generated.prefix },
    });

    return { token: generated.token, prefix: generated.prefix };
  });

export const revokeSiteFeedToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ revoked: number }> => {
    const organizationId = await requireOrgAdmin(context as unknown as AuthContext);
    const { admin } = await loadServer();
    const { data, error } = await admin
      .from("site_feed_tokens")
      .update({ revoked_at: new Date().toISOString(), updated_by: context.userId })
      .eq("organization_id", organizationId)
      .is("revoked_at", null)
      .select("id");
    if (error) throw new Error("Tokenul nu a putut fi revocat.");

    await admin.from("audit_logs").insert({
      organization_id: organizationId,
      actor_id: context.userId,
      action: "site_feed.token_revoked",
      entity: "site_feed_tokens",
      new_values: { revoked: data?.length ?? 0 },
    });
    return { revoked: data?.length ?? 0 };
  });

/** Test de conexiune: numără proprietățile și agenții eligibili pentru feed. */
export const testSiteFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ properties: number; agents: number; hasToken: boolean }> => {
    const organizationId = await requireOrgAdmin(context as unknown as AuthContext);
    const { admin } = await loadServer();
    const [properties, agents, tokens] = await Promise.all([
      admin
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("publish_status", "published")
        .is("deleted_at", null)
        .in("status", ["active", "reserved", "negotiation"]),
      admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("is_active", true),
      admin
        .from("site_feed_tokens")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("revoked_at", null),
    ]);
    return {
      properties: properties.count ?? 0,
      agents: agents.count ?? 0,
      hasToken: (tokens.count ?? 0) > 0,
    };
  });
