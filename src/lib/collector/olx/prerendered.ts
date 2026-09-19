/**
 * Extragerea stării încorporate în paginile OLX (logică pură, fără rețea).
 *
 * OLX pune toate datele într-o atribuire de tipul
 * `window.__PRERENDERED_STATE__ = "{\"listing\":{...}}";` într-un `<script>`.
 * Citim EXCLUSIV acest JSON — niciun selector de HTML. Dacă marcajul lipsește
 * sau structura nu e cea așteptată, pagina este raportată ca eșec de citire cu
 * motiv clar, niciodată salvată pe jumătate.
 */

export const OLX_STATE_MARKER = "__PRERENDERED_STATE__";

export type OlxStateResult =
  | { ok: true; state: Record<string, unknown> }
  | { ok: false; reason: string };

/** Citește literalul JavaScript care urmează după `=`, până la `;` de final. */
function readAssignedLiteral(html: string, from: number): string | null {
  let index = from;
  while (index < html.length && /\s/.test(html[index] ?? "")) index += 1;
  const first = html[index];
  if (first === '"' || first === "'") {
    const quote = first;
    let out = quote;
    index += 1;
    while (index < html.length) {
      const char = html[index] ?? "";
      out += char;
      if (char === "\\") {
        out += html[index + 1] ?? "";
        index += 2;
        continue;
      }
      if (char === quote) return out;
      index += 1;
    }
    return null;
  }
  if (first === "{") {
    // Obiect literal: numărăm acoladele, ignorând cele din șiruri.
    let depth = 0;
    let inString: string | null = null;
    let out = "";
    while (index < html.length) {
      const char = html[index] ?? "";
      out += char;
      if (inString) {
        if (char === "\\") {
          out += html[index + 1] ?? "";
          index += 2;
          continue;
        }
        if (char === inString) inString = null;
      } else if (char === '"' || char === "'") {
        inString = char;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) return out;
      }
      index += 1;
    }
    return null;
  }
  return null;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Întoarce obiectul de stare al paginii. Suportă ambele forme întâlnite:
 * valoarea este un șir JSON (deci se decodează de două ori) sau direct un
 * obiect JSON.
 */
export function extractPrerenderedState(html: string): OlxStateResult {
  const marker = html.indexOf(OLX_STATE_MARKER);
  if (marker === -1) {
    return { ok: false, reason: `Marcajul ${OLX_STATE_MARKER} nu a fost găsit în pagină` };
  }
  const equals = html.indexOf("=", marker + OLX_STATE_MARKER.length);
  if (equals === -1) return { ok: false, reason: "Atribuirea stării paginii este incompletă" };

  const literal = readAssignedLiteral(html, equals + 1);
  if (!literal) return { ok: false, reason: "Valoarea stării paginii nu a putut fi izolată" };

  if (literal.startsWith("{")) {
    const direct = parseJsonObject(literal);
    if (!direct) return { ok: false, reason: "Starea paginii nu este un JSON valid" };
    return { ok: true, state: direct };
  }

  // Șir JSON: prima decodare dă textul, a doua obiectul.
  let inner: unknown;
  try {
    inner = JSON.parse(literal.startsWith("'") ? `"${literal.slice(1, -1)}"` : literal);
  } catch {
    return { ok: false, reason: "Șirul cu starea paginii nu este un JSON valid" };
  }
  if (typeof inner !== "string") {
    return { ok: false, reason: "Starea paginii are o formă neașteptată" };
  }
  const state = parseJsonObject(inner);
  if (!state) return { ok: false, reason: "Starea paginii nu este un JSON valid" };
  return { ok: true, state };
}

/** Anunțurile dintr-o pagină de listă (`listing.listing.ads`) sau dintr-un anunț (`ad.ad`). */
export function adsFromState(state: Record<string, unknown>): OlxAdsResult {
  const listing = (state["listing"] as Record<string, unknown> | undefined)?.["listing"] as
    | Record<string, unknown>
    | undefined;
  if (listing && Array.isArray(listing["ads"])) {
    const total = Number(listing["totalElements"] ?? listing["totalCount"] ?? NaN);
    return {
      ok: true,
      ads: listing["ads"] as Record<string, unknown>[],
      totalCount: Number.isFinite(total) ? total : null,
    };
  }
  const single = (state["ad"] as Record<string, unknown> | undefined)?.["ad"];
  if (single && typeof single === "object" && !Array.isArray(single)) {
    return { ok: true, ads: [single as Record<string, unknown>], totalCount: 1 };
  }
  return { ok: false, reason: "Starea paginii nu conține nici listing.listing.ads, nici ad.ad" };
}

export type OlxAdsResult =
  | { ok: true; ads: Record<string, unknown>[]; totalCount: number | null }
  | { ok: false; reason: string };
