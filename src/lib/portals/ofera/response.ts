export type OferaResponse = { ok: boolean; status: number | null; message: string; data: unknown; logTrackId: string | null };
export const object = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const text = (v: unknown) => typeof v === "string" || typeof v === "number" ? String(v) : "";
const privateKey = /^(password|client_secret|client_id|username|access_token|refresh_token|authorization|token|token_encrypted)$/i;
/** Redact before truncation; also remove known credentials echoed under unrelated keys. */
export function oferaRedact(raw: string, secrets: string[] = []): string {
  let safe = raw;
  try {
    const visit = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(visit);
      const row = object(value);
      if (row) return Object.fromEntries(Object.entries(row).map(([key, v]) => [key, privateKey.test(key) ? "[ascuns]" : visit(v)]));
      return value;
    };
    safe = JSON.stringify(visit(JSON.parse(raw)));
  } catch {
    // Non-JSON diagnostics may still contain credentials.
    safe = safe.replace(/((?:password|client_secret|client_id|username|access_token|refresh_token|authorization|token)\s*[=:]\s*)[^\s<,;]+/gi, "$1[ascuns]")
      .replace(/("(?:password|client_secret|client_id|username|access_token|refresh_token|authorization|token)"\s*:\s*")[^"]*/gi, "$1[ascuns]");
  }
  for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) {
    for (const representation of [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)]) safe = safe.split(representation).join("[ascuns]");
  }
  return safe.replace(/Bearer\s+[^\s"<]+/gi, "Bearer [ascuns]");
}
export function readOferaResponse(body: unknown): OferaResponse {
  const root = object(body);
  const data = root?.["data"] ?? null;
  const fields = object(data);
  const logTrackId = text(fields?.["log_track_id"] ?? root?.["log_track_id"]) || null;
  const status = typeof root?.["status"] === "number" ? root["status"] : null;
  if (!root || !["SUCCESS", "ERROR"].includes(text(root["code"]))) return { ok: false, status, message: "Răspuns Ofera neașteptat", data: null, logTrackId };
  const ok = root["code"] === "SUCCESS" && status !== null && status >= 200 && status < 300;
  let message = text(root["message"]) || (ok ? "Operația Ofera a reușit." : "Ofera a refuzat operația.");
  if (!ok) {
    if (status === 404) message = "Anunțul nu există la Ofera.";
    if (status === 409) message = `Ofera semnalează un posibil duplicat (ID ${text(fields?.["id_duplicat"] ?? root["id_duplicat"]) || "necunoscut"}).`;
    if (status === 406) message = "Nu mai sunt sloturi de promovare la Ofera.";
    if (status === 412) message = "Anunțul nu e activ la Ofera.";
    if (status === 500) message = `Ofera a refuzat operația: ${message}`;
  }
  return { ok, status, message: `${message}${logTrackId ? ` Referință Ofera: ${logTrackId}.` : ""}`, data, logTrackId };
}
export function oferaInvalidToken(result: OferaResponse): boolean {
  return !result.ok && (result.status === 401 || /(?:token.*(?:invalid|expirat|expired)|(?:invalid|expirat|expired).*token)/i.test(result.message));
}