/**
 * Conexiunea Meta a agenției: schimb de cod, citirea paginilor, salvare criptată,
 * deconectare și ștergerea datelor. Tokenurile nu părăsesc serverul și nu se loghează.
 */
import { encryptPortalCredential, decryptPortalCredential } from "@/lib/portals/crypto.server";
import {
  META_APP_ID,
  META_GRAPH_BASE,
  META_REDIRECT_URI,
  MetaConnectError,
  disconnectMetaOrg,
  postablePages,
  type GraphPage,
} from "./core";

type Fetch = typeof fetch;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export function metaAppSecret(): string {
  const s = process.env["META_APP_SECRET"];
  if (!s) throw new MetaConnectError("config");
  return s;
}

async function graphGet<T>(f: Fetch, path: string, params: Record<string, string>): Promise<T> {
  const u = new URL(`${META_GRAPH_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await f(u.toString(), { headers: { accept: "application/json" } });
  if (!res.ok) throw new MetaConnectError("exchange_failed");
  return (await res.json()) as T;
}

export async function exchangeMetaCode(code: string, f: Fetch = fetch) {
  const secret = metaAppSecret();
  const short = await graphGet<{ access_token: string }>(f, "/oauth/access_token", {
    client_id: META_APP_ID,
    client_secret: secret,
    redirect_uri: META_REDIRECT_URI,
    code,
  });
  const long = await graphGet<{ access_token: string; expires_in?: number }>(f, "/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: META_APP_ID,
    client_secret: secret,
    fb_exchange_token: short.access_token,
  });
  const me = await graphGet<{ id: string }>(f, "/me", { fields: "id", access_token: long.access_token });
  return { userToken: long.access_token, expiresIn: long.expires_in ?? null, metaUserId: me.id };
}

export async function loadMetaPages(userToken: string, f: Fetch = fetch): Promise<GraphPage[]> {
  const out: GraphPage[] = [];
  let next: string | null = null;
  let first = true;
  for (let i = 0; i < 10 && (first || next); i++) {
    const res: { data?: GraphPage[]; paging?: { next?: string } } = first
      ? await graphGet(f, "/me/accounts", {
          fields: "id,name,access_token,tasks,picture{url}",
          limit: "100",
          access_token: userToken,
        })
      : await f(next!).then((r) => {
          if (!r.ok) throw new MetaConnectError("exchange_failed");
          return r.json();
        });
    first = false;
    out.push(...(res.data ?? []));
    next = res.paging?.next ?? null;
  }
  for (const p of out) {
    if (!p.access_token) continue;
    try {
      const ig = await graphGet<{ instagram_business_account?: GraphPage["instagram_business_account"] }>(f, `/${p.id}`, {
        fields: "instagram_business_account{id,username,profile_picture_url}",
        access_token: p.access_token,
      });
      p.instagram_business_account = ig.instagram_business_account ?? null;
    } catch {
      p.instagram_business_account = null;
    }
  }
  return out;
}

/** Salvează conexiunea; refuză dacă nu rămâne nicio pagină cu CREATE_CONTENT. */
export async function saveMetaConnection(
  db: Db,
  input: {
    organizationId: string;
    userId: string;
    metaUserId: string;
    userToken: string;
    expiresIn: number | null;
    pages: GraphPage[];
  },
  enc: (s: string) => string = encryptPortalCredential,
): Promise<{ pages: number; instagram: number }> {
  if (input.pages.length === 0) throw new MetaConnectError("no_pages");
  const pages = postablePages(input.pages);
  if (pages.length === 0) throw new MetaConnectError("no_postable_pages");

  const now = new Date().toISOString();
  const { data: existing } = await db
    .from("meta_connections")
    .select("default_page_id")
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  const keepDefault = pages.some((p) => p.id === existing?.default_page_id) ? existing.default_page_id : pages[0]!.id;

  const { data: conn, error } = await db
    .from("meta_connections")
    .upsert(
      {
        organization_id: input.organizationId,
        meta_user_id: input.metaUserId,
        user_token_enc: enc(input.userToken),
        token_expires_at: input.expiresIn ? new Date(Date.now() + input.expiresIn * 1000).toISOString() : null,
        status: "connected",
        default_page_id: keepDefault,
        connected_by: input.userId,
        connected_at: now,
        disconnected_at: null,
        updated_at: now,
      },
      { onConflict: "organization_id" },
    )
    .select("id")
    .single();
  if (error || !conn) throw new MetaConnectError("exchange_failed");

  await db.from("meta_pages").delete().eq("organization_id", input.organizationId);
  let instagram = 0;
  for (const p of pages) {
    const { data: row } = await db
      .from("meta_pages")
      .insert({
        organization_id: input.organizationId,
        connection_id: conn.id,
        page_id: p.id,
        name: p.name,
        picture_url: p.picture?.data?.url ?? null,
        tasks: p.tasks ?? [],
        page_token_enc: enc(p.access_token!),
      })
      .select("id")
      .single();
    const ig = p.instagram_business_account;
    if (row && ig?.id) {
      instagram++;
      await db.from("meta_instagram_accounts").insert({
        organization_id: input.organizationId,
        page_row_id: row.id,
        ig_user_id: ig.id,
        username: ig.username ?? null,
        picture_url: ig.profile_picture_url ?? null,
      });
    }
  }
  return { pages: pages.length, instagram };
}

/** Șterge tokenurile și paginile; conexiunea rămâne doar ca stare „deconectat”. */
export async function clearMetaTokens(db: Db, filter: { organizationId?: string; metaUserId?: string }) {
  const now = new Date().toISOString();
  let q = db.from("meta_connections").select("id, organization_id");
  q = filter.organizationId ? q.eq("organization_id", filter.organizationId) : q.eq("meta_user_id", filter.metaUserId);
  const { data: rows } = await q;
  for (const r of (rows ?? []) as { id: string; organization_id: string }[]) {
    await db.from("meta_pages").delete().eq("connection_id", r.id);
    await db
      .from("meta_connections")
      .update({ user_token_enc: null, token_expires_at: null, status: "disconnected", disconnected_at: now, default_page_id: null, updated_at: now })
      .eq("id", r.id);
  }
  return ((rows ?? []) as { organization_id: string }[]).map((r) => r.organization_id);
}

export async function disconnectMeta(db: Db, organizationId: string, f: Fetch = fetch) {
  return disconnectMetaOrg({
    loadUserToken: async () => {
      const { data } = await db
        .from("meta_connections")
        .select("user_token_enc")
        .eq("organization_id", organizationId)
        .maybeSingle();
      try {
        return decryptPortalCredential(data?.user_token_enc ?? null);
      } catch {
        return null;
      }
    },
    revoke: async (token) => {
      const u = new URL(`${META_GRAPH_BASE}/me/permissions`);
      u.searchParams.set("access_token", token);
      const res = await f(u.toString(), { method: "DELETE" });
      if (!res.ok) throw new Error("revoke_failed");
    },
    clearTokens: async () => {
      await clearMetaTokens(db, { organizationId });
    },
  });
}

export async function metaAudit(db: Db, organizationId: string, actorId: string | null, action: string, details?: Record<string, unknown>) {
  try {
    await db.from("audit_logs").insert({
      organization_id: organizationId,
      actor_id: actorId,
      action,
      entity: "meta_connection",
      entity_id: null,
      new_values: details ?? null,
    });
  } catch {
    /* best-effort */
  }
}

/** Citește `signed_request` din corpul POST (form-urlencoded sau JSON). */
export async function readSignedRequest(request: Request): Promise<string | null> {
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const j = (await request.json()) as { signed_request?: string };
      return j.signed_request ?? null;
    }
    const form = await request.formData();
    const v = form.get("signed_request");
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}
