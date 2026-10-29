import { OFERA_MISSING_MESSAGE, OFERA_SECRET_NAMES, oferaConfigured } from "./config";
import { object, type OferaResponse } from "./response";
import { oferaTransport, type OferaTransportDeps } from "./transport.server";
export type OferaToken = { token: string; expiresAt: number; scope: string; revision: string };
export interface OferaTokenStore {
  read(): Promise<OferaToken | null>;
  claim(owner: string, rejectedRevision?: string): Promise<boolean>;
  save(owner: string, token: OferaToken): Promise<boolean>;
  release(owner: string): Promise<void>;
}
export type OferaAuthDeps = OferaTransportDeps & { env: Record<string, string | undefined>; store: OferaTokenStore; now?: () => number; sleep?: (ms: number) => Promise<void> };
export class OferaAuthError extends Error {
  constructor(public result: OferaResponse) { super(result.message); }
}
const failed = (message: string): OferaResponse => ({ ok: false, status: null, message, data: null, logTrackId: null });
export async function getOferaToken(deps: OferaAuthDeps, rejectedRevision?: string): Promise<OferaToken> {
  if (!oferaConfigured(deps.env)) throw new OferaAuthError(failed(OFERA_MISSING_MESSAGE));
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const owner = crypto.randomUUID();
  // Bounded polling also crosses Worker instances; the database owns the global lease.
  for (let attempt = 0; attempt < 220; attempt++) {
    const cached = await deps.store.read();
    if (cached && cached.expiresAt > now() + 300_000 && cached.revision !== rejectedRevision) return cached;
    if (!await deps.store.claim(owner, rejectedRevision)) { await sleep(200); continue; }
    try {
      const form = new URLSearchParams({ grant_type: "password", username: deps.env["OFERA_USERNAME"] ?? "", password: deps.env["OFERA_PASSWORD"] ?? "", client_id: deps.env["OFERA_CLIENT_ID"] ?? "", client_secret: deps.env["OFERA_CLIENT_SECRET"] ?? "" });
      const call = await oferaTransport("/get-token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() }, { ...deps, secrets: OFERA_SECRET_NAMES.map((name) => deps.env[name] ?? "") });
      if (!call.result.ok) throw new OferaAuthError({ ...call.result, message: call.result.status === 404 ? `Date invalide, cont Ofera negăsit.${call.result.logTrackId ? ` Referință Ofera: ${call.result.logTrackId}.` : ""}` : call.result.message });
      const root = object(call.body);
      const fields = object(root?.["data"]) ?? root;
      const token = fields?.["access_token"];
      const seconds = Number(fields?.["expires_in"]);
      if (typeof token !== "string" || !token || String(fields?.["token_type"]).toLowerCase() !== "bearer" || !Number.isFinite(seconds) || seconds <= 300) throw new OferaAuthError(failed("Răspuns Ofera neașteptat"));
      const issued = { token, expiresAt: now() + seconds * 1000, scope: typeof fields?.["scope"] === "string" ? fields["scope"] : "", revision: crypto.randomUUID() };
      if (await deps.store.save(owner, issued)) return issued;
      // A lost lease may never overwrite the next owner's token.
    } finally { await deps.store.release(owner); }
  }
  throw new OferaAuthError(failed("Autorizarea Ofera este în curs. Reîncearcă în câteva momente."));
}