/** Traduce erorile OLX Partner API (`error.detail`, `error.validation[]`) în mesaje românești. */
export function olxErrorMessage(status: number, body: unknown): string {
  const err =
    body && typeof body === "object" && "error" in body
      ? ((body as { error?: unknown }).error as Record<string, unknown> | undefined)
      : undefined;
  const validation = Array.isArray(err?.["validation"]) ? (err!["validation"] as unknown[]) : [];
  const fields = validation
    .map((v) => {
      if (!v || typeof v !== "object") return null;
      const item = v as Record<string, unknown>;
      const field = typeof item["field"] === "string" ? item["field"] : null;
      const detail =
        typeof item["detail"] === "string"
          ? item["detail"]
          : typeof item["title"] === "string"
            ? item["title"]
            : null;
      return field && detail ? `${field}: ${detail}` : (detail ?? field);
    })
    .filter((s): s is string => Boolean(s))
    .slice(0, 5);
  const detail = typeof err?.["detail"] === "string" ? (err["detail"] as string).slice(0, 200) : "";

  const base =
    status === 401
      ? "OLX a refuzat autorizarea. Reconectează contul OLX."
      : status === 403
        ? "Contul OLX nu are drept pentru această operațiune."
        : status === 404
          ? "OLX nu a găsit resursa cerută."
          : status === 429
            ? "Prea multe cereri către OLX. Reîncearcă peste câteva minute."
            : status >= 500
              ? "OLX nu răspunde momentan. Reîncearcă mai târziu."
              : status === 400 || status === 422
                ? "OLX a respins datele trimise."
                : "Cererea către OLX a eșuat.";
  const extra = [detail, ...fields].filter(Boolean).join("; ");
  return extra ? `${base} Detalii OLX: ${extra}` : base;
}

import { PortalError, codeFromHttpStatus } from "../errors";

/** Textul EXACT al erorii OLX: „HTTP 400 <title>; <detail>; câmp: mesaj”. */
export function olxExactHttpText(status: number, body: unknown): string {
  const err =
    body && typeof body === "object" && "error" in body
      ? (((body as { error?: unknown }).error ?? {}) as Record<string, unknown>)
      : {};
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const validation = (Array.isArray(err["validation"]) ? err["validation"] : []).map((v) => {
    const item = (v ?? {}) as Record<string, unknown>;
    const field = str(item["field"]);
    const msg = str(item["detail"]) ?? str(item["title"]) ?? str(item["message"]);
    return field && msg ? `${field}: ${msg}` : (msg ?? field);
  });
  const raw = !Object.keys(err).length && typeof body === "string" ? str(body)?.slice(0, 300) : null;
  const parts = [str(err["title"]), str(err["detail"]), ...validation, raw].filter((s): s is string => Boolean(s));
  return [`HTTP ${status}`, parts.join("; ")].filter(Boolean).join(" ");
}

/** Eroare HTTP OLX care păstrează statusul și corpul brut pentru jurnal. */
export class OlxHttpError extends PortalError {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    super(codeFromHttpStatus(status), `olx_http_${status}`, olxErrorMessage(status, body));
    this.status = status;
    this.body = body;
  }
}
