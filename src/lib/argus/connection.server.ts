/**
 * Conexiunea Argus a unei agenții: cheia API criptată și tokenul de autorizare
 * păstrat pe server. Tabelul `argus_connections` are RLS fără politici —
 * doar clientul de server (service role) îl citește; cheia și tokenul nu
 * părăsesc niciodată serverul și nu se loghează.
 */
import { decryptPortalCredential, encryptPortalCredential } from "@/lib/portals/crypto.server";
import { ArgusError } from "./errors";
import { argusAuthenticate, argusRequest, type ArgusFetch, type ArgusSleep } from "./client.server";
import { argusAuthThrottle, argusApiThrottle } from "./rate-limit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type ArgusConnectionRow = {
  organization_id: string;
  api_key_enc: string;
  api_key_last4: string;
  token_enc: string | null;
  token_obtained_at: string | null;
  connected_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function loadArgusConnection(
  db: Db,
  organizationId: string,
): Promise<ArgusConnectionRow | null> {
  const { data } = await db
    .from("argus_connections")
    .select(
      "organization_id, api_key_enc, api_key_last4, token_enc, token_obtained_at, connected_by, created_at, updated_at",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();
  return (data as ArgusConnectionRow | null) ?? null;
}

/** Salvează (sau înlocuiește) cheia API a agenției; tokenul vechi se invalidează. */
export async function saveArgusConnection(
  db: Db,
  input: { organizationId: string; apiKey: string; userId: string },
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db.from("argus_connections").upsert(
    {
      organization_id: input.organizationId,
      api_key_enc: encryptPortalCredential(input.apiKey),
      api_key_last4: input.apiKey.slice(-4),
      token_enc: null,
      token_obtained_at: null,
      connected_by: input.userId,
      updated_at: now,
    },
    { onConflict: "organization_id" },
  );
  if (error) throw new ArgusError("rejected", "Cheia Argus nu a putut fi salvată. Încearcă din nou.");
}

export async function deleteArgusConnection(db: Db, organizationId: string): Promise<void> {
  await db.from("argus_connections").delete().eq("organization_id", organizationId);
}

function decryptKey(row: ArgusConnectionRow): string {
  const key = decryptPortalCredential(row.api_key_enc);
  if (!key) {
    throw new ArgusError("config", "Cheia Argus salvată nu poate fi citită. Salvează cheia din nou.");
  }
  return key;
}

/**
 * Autentificare cu limita locală /auth (max 5/oră pe IP-ul serverului) și
 * persistarea tokenului pentru refolosire.
 */
async function authenticateAndStore(
  db: Db,
  row: ArgusConnectionRow,
  f: ArgusFetch,
): Promise<string> {
  const wait = argusAuthThrottle();
  if (wait > 0) {
    throw new ArgusError(
      "rate_limit",
      "Prea multe autentificări Argus într-o oră. Încearcă din nou mai târziu.",
    );
  }
  const token = await argusAuthenticate(decryptKey(row), f);
  const now = new Date().toISOString();
  await db
    .from("argus_connections")
    .update({ token_enc: encryptPortalCredential(token), token_obtained_at: now, updated_at: now })
    .eq("organization_id", row.organization_id);
  return token;
}

/**
 * Token valid pentru agenție: refolosește tokenul salvat; autentifică doar
 * când lipsește. La 401 pe o cerere, `argusCall` reautentifică o singură dată.
 */
export async function argusAccessToken(
  db: Db,
  organizationId: string,
  f: ArgusFetch = fetch,
): Promise<{ token: string; row: ArgusConnectionRow }> {
  const row = await loadArgusConnection(db, organizationId);
  if (!row) {
    throw new ArgusError(
      "config",
      "Agenția nu are o cheie API Argus salvată. Adaug-o în Setări → Integrări → Argus.",
    );
  }
  const cached = row.token_enc ? decryptPortalCredential(row.token_enc) : null;
  if (cached) return { token: cached, row };
  return { token: await authenticateAndStore(db, row, f), row };
}

export type ArgusCallOptions = {
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  clientIp?: string | null;
  fetchFn?: ArgusFetch;
  sleep?: ArgusSleep;
};

/**
 * Cerere Argus pentru o agenție: limitare locală (2/s, 60/min, 600/oră pe
 * cheie), token refolosit, reautentificare o singură dată la 401.
 */
export async function argusCall<T = unknown>(
  db: Db,
  organizationId: string,
  opts: ArgusCallOptions,
): Promise<T> {
  const f = opts.fetchFn ?? fetch;
  const wait = argusApiThrottle(organizationId);
  if (wait > 0) {
    if (opts.sleep && wait <= 5_000) {
      await opts.sleep(wait);
    } else {
      throw new ArgusError(
        "rate_limit",
        "Limita de cereri Argus a fost atinsă temporar. Încearcă din nou în câteva secunde.",
      );
    }
  }
  const first = await argusAccessToken(db, organizationId, f);
  try {
    return await argusRequest<T>({ ...opts, token: first.token, fetchFn: f });
  } catch (e) {
    if (!(e instanceof ArgusError) || e.kind !== "auth") throw e;
    // 401: token expirat — reautentificare o singură dată, apoi reluare.
    const token = await authenticateAndStore(db, first.row, f);
    return argusRequest<T>({ ...opts, token, fetchFn: f });
  }
}
