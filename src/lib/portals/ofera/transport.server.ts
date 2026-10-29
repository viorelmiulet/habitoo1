import { OFERA_BASE_URL } from "./config";
import { object, oferaRedact, readOferaResponse, type OferaResponse } from "./response";
export type OferaLog = { path: string; httpStatus: number | null; result: OferaResponse; raw: string };
export type OferaTransportDeps = { fetch?: typeof fetch; secrets?: string[]; journal: (entry: OferaLog) => Promise<void> };
/** Internal transport keeps the token response in memory only; journals contain redacted text. */
export async function oferaTransport(path: string, init: RequestInit, deps: OferaTransportDeps): Promise<{ result: OferaResponse; body: unknown }> {
  if (!/^\/[a-zA-Z0-9/_?=&:%.-]+$/.test(path) || path.includes("..")) throw new Error("Adresă Ofera invalidă.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let raw = "";
  let body: unknown = null;
  let httpStatus: number | null = null;
  let result: OferaResponse;
  let sensitive = deps.secrets ?? [];
  try {
    const response = await (deps.fetch ?? ((url, options) => fetch(url, options)))(`${OFERA_BASE_URL}${path}`, {
      ...init, redirect: "manual", signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "Habitoo CRM (+https://habitoo.ro)", ...init.headers },
    });
    httpStatus = response.status;
    raw = await response.text();
    try { body = JSON.parse(raw); } catch { body = null; }
    const root = object(body);
    const tokenData = object(root?.["data"]) ?? root;
    sensitive = [...sensitive, ...[tokenData?.["access_token"], tokenData?.["refresh_token"]].filter((v): v is string => typeof v === "string")];
    const safeText = oferaRedact(raw, sensitive);
    let safeBody: unknown = null;
    try { safeBody = JSON.parse(safeText); } catch { /* unexpected response */ }
    // OAuth's documented token response has no operation envelope; validate its complete shape.
    const oauth = path === "/get-token" && !root?.["code"] && typeof tokenData?.["access_token"] === "string" && String(tokenData?.["token_type"]).toLowerCase() === "bearer" && Number(tokenData?.["expires_in"]) > 0;
    result = oauth ? { ok: true, status: 200, message: "Autorizare Ofera reușită.", data: null, logTrackId: null } : readOferaResponse(safeBody);
  } catch {
    result = { ok: false, status: null, message: controller.signal.aborted ? "Ofera nu a răspuns în 30 de secunde." : "Ofera nu a putut fi contactat.", data: null, logTrackId: null };
  } finally { clearTimeout(timer); }
  await deps.journal({ path, httpStatus, result, raw: oferaRedact(raw, sensitive).slice(0, result.message === "Răspuns Ofera neașteptat" ? 500 : 20_000) });
  return { result, body };
}