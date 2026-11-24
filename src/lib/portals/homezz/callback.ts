/**
 * Notificări HomeZZ (moderare): parsare pură a corpului (JSON sau
 * form-urlencoded cu chei `meta[code]`/`data[key]`), eliminarea cheii și
 * efectul asupra ofertei. Fără importuri server.
 */
export const HOMEZZ_CALLBACK_MAX_BYTES = 64 * 1024;

export type HomezzCallback = {
  code: number | null;
  message: string;
  key: string | null;
  internalId: string | null;
  adError: string | null;
  predefinedMessage: string | null;
  conversationId: string | null;
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** `a[b][c]=v` → `{ a: { b: { c: v } } }`; `a[]`/indici numerici rămân chei de obiect. */
export function parseBracketForm(body: string): Obj {
  const out: Obj = {};
  for (const [rawKey, value] of new URLSearchParams(body)) {
    const m = /^([^[\]]+)((?:\[[^[\]]*\])*)$/.exec(rawKey);
    const parts = m ? [m[1]!, ...Array.from(m[2]!.matchAll(/\[([^[\]]*)\]/g), (x) => x[1]!)] : [rawKey];
    let cur: Obj = out;
    parts.forEach((p, i) => {
      const k = p === "" ? String(Object.keys(cur).length) : p;
      if (i === parts.length - 1) cur[k] = value;
      else { if (!isObj(cur[k])) cur[k] = {}; cur = cur[k] as Obj; }
    });
  }
  return out;
}

/** JSON dacă tipul o spune sau corpul începe cu `{`; altfel form. `null` = corp ilizibil. */
export function decodeHomezzBody(raw: string, contentType: string | null): Obj | null {
  const t = raw.trim();
  if (!t) return null;
  if (/json/i.test(contentType ?? "") || t.startsWith("{")) {
    try { const v = JSON.parse(t); return isObj(v) ? v : null; } catch { return null; }
  }
  const v = parseBracketForm(t);
  return Object.keys(v).length ? v : null;
}

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
};

/** `ad_error` poate fi text, listă sau obiect câmp → mesaj. */
export function homezzAdErrorText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = str(v);
  if (s !== null) return s;
  if (Array.isArray(v)) return v.map(homezzAdErrorText).filter(Boolean).join("; ") || null;
  if (isObj(v)) return Object.entries(v).map(([k, x]) => { const t = homezzAdErrorText(x); return t ? `${k}: ${t}` : k; }).join("; ") || null;
  return null;
}

export function parseHomezzCallback(body: Obj): HomezzCallback {
  const meta = isObj(body["meta"]) ? body["meta"] : {};
  const data = isObj(body["data"]) ? body["data"] : {};
  const codeNum = Number(str(meta["code"]));
  return {
    code: Number.isFinite(codeNum) ? codeNum : null,
    message: str(meta["message"]) ?? "",
    key: str(data["key"]),
    internalId: str(data["internal_id"]),
    adError: homezzAdErrorText(data["ad_error"]),
    predefinedMessage: str(data["predefined_message"]),
    conversationId: str(data["conversation_id"]),
  };
}

/** Copie fără `data.key` (cheia agenției nu se salvează niciodată). */
export function redactHomezzCallback(body: Obj): Obj {
  const copy = JSON.parse(JSON.stringify(body)) as Obj;
  if (isObj(copy["data"])) delete (copy["data"] as Obj)["key"];
  delete copy["key"];
  return copy;
}

export type HomezzCallbackEffect =
  | { kind: "moderation"; code: 501 | 502; lastError: string; title: string }
  | { kind: "none"; note: string };

export function homezzCallbackEffect(c: HomezzCallback): HomezzCallbackEffect {
  const join = (...p: (string | null)[]) => p.filter((x): x is string => !!x).join(" ");
  if (c.code === 501) return { kind: "moderation", code: 501, lastError: `HomeZZ a trimis anunțul spre editare: ${join(c.adError, c.predefinedMessage)}`.trim(), title: "HomeZZ a trimis anunțul spre editare" };
  if (c.code === 502) return { kind: "moderation", code: 502, lastError: `HomeZZ nu a aprobat anunțul: ${join(c.predefinedMessage)}`.trim(), title: "HomeZZ nu a aprobat anunțul" };
  if (c.code === 503) return { kind: "none", note: "mesaj nou (neprocesat în această etapă)" };
  return { kind: "none", note: `cod necunoscut ${c.code ?? "-"}` };
}

/** Comparare în timp constant a două șiruri hex de aceeași lungime. */
export function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function sha256Hex(s: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}
