import { getOferaToken, OferaAuthError, type OferaAuthDeps } from "./auth.server";
import { OFERA_SECRET_NAMES } from "./config";
import { oferaInvalidToken, type OferaResponse } from "./response";
import { oferaTransport } from "./transport.server";
export async function oferaRequest(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, deps: OferaAuthDeps, body?: unknown): Promise<OferaResponse> {
  try {
    let token = await getOferaToken(deps);
    for (let attempt = 0; attempt < 2; attempt++) {
      const call = await oferaTransport(path, { method, headers: { Authorization: `Bearer ${token.token}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, { ...deps, secrets: [...OFERA_SECRET_NAMES.map((name) => deps.env[name] ?? ""), token.token] });
      if (attempt === 0 && oferaInvalidToken(call.result)) { token = await getOferaToken(deps, token.revision); continue; }
      return call.result;
    }
  } catch (error) {
    if (error instanceof OferaAuthError) return error.result;
    return { ok: false, status: null, message: "Conexiunea Ofera nu a putut fi verificată sau jurnalizată.", data: null, logTrackId: null };
  }
  return { ok: false, status: 401, message: "Ofera a refuzat autorizarea.", data: null, logTrackId: null };
}