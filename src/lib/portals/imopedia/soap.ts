/**
 * Imopedia.ro — plicuri SOAP 1.1 RPC/encoded și parser de răspuns (pure, fără rețea).
 * Pe Workers nu există client SOAP: plicurile se construiesc manual.
 */

export const IMOPEDIA_SOAP_ENDPOINT = "https://www.imopedia.ro/soap2";
export const IMOPEDIA_NS = "syncapi.imopedia.ro";
export const IMOPEDIA_LOG_MAX_CHARS = 20_000;

export type SoapScalarType = "xsd:int" | "xsd:float" | "xsd:string";
export type SoapField = { name: string; type: SoapScalarType; value: string | number | null | undefined };

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function scalar(name: string, type: SoapScalarType, value: string | number): string {
  return `<${name} xsi:type="${type}">${xmlEscape(String(value))}</${name}>`;
}

function envelope(operation: string, inner: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"` +
    ` xmlns:xsd="http://www.w3.org/2001/XMLSchema"` +
    ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"` +
    ` xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/"` +
    ` xmlns:tns="${IMOPEDIA_NS}">` +
    `<soapenv:Body>` +
    `<tns:${operation} soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">${inner}</tns:${operation}>` +
    `</soapenv:Body></soapenv:Envelope>`
  );
}

export function soapActionFor(operation: string): string {
  return `"${IMOPEDIA_SOAP_ENDPOINT}?method=${operation}"`;
}

export function buildLoginEnvelope(username: string, password: string): string {
  return envelope("login", scalar("username", "xsd:string", username) + scalar("password", "xsd:string", password));
}

export function buildLogoutEnvelope(sessionId: string): string {
  return envelope("logout", scalar("session_id", "xsd:string", sessionId));
}

/** Operație cu `session_id` + `options` tipizat (ex. `tns:ViewAgencyType`). */
export function buildOptionsEnvelope(operation: string, sessionId: string, optionsType: string, fields: SoapField[]): string {
  const inner = fields
    .filter((f) => f.value !== null && f.value !== undefined)
    .map((f) => scalar(f.name, f.type, f.value as string | number))
    .join("");
  return envelope(
    operation,
    scalar("session_id", "xsd:string", sessionId) + `<options xsi:type="tns:${optionsType}">${inner}</options>`,
  );
}

/** Ca `buildOptionsEnvelope`, cu conținut `options` deja construit (tipuri imbricate, ex. `tns:FileType`). */
export function buildRawOptionsEnvelope(operation: string, sessionId: string, optionsType: string, innerXml: string): string {
  return envelope(operation, scalar("session_id", "xsd:string", sessionId) + `<options xsi:type="tns:${optionsType}">${innerXml}</options>`);
}

export function buildViewAgencyEnvelope(sessionId: string, agencyId: number): string {
  return buildOptionsEnvelope("viewAgency", sessionId, "ViewAgencyType", [{ name: "AGENTIA", type: "xsd:int", value: agencyId }]);
}

// ---------------------------------------------------------------------------
// Parser XML minimal (elemente, atribute, text, CDATA).

export type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string };

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1]!;
    if (m[1] !== undefined) top.text += m[1];
    else if (m[2]) {
      if (stack.length > 1) stack.pop();
    } else if (m[3]) {
      const attrs: Record<string, string> = {};
      const ar = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let a: RegExpExecArray | null;
      while ((a = ar.exec(m[4] ?? ""))) attrs[a[1]!] = decodeEntities(a[2] ?? a[3] ?? "");
      const node: XmlNode = { name: m[3], attrs, children: [], text: "" };
      top.children.push(node);
      if (!m[5]) stack.push(node);
    } else if (m[6] !== undefined) top.text += decodeEntities(m[6]);
  }
  return root;
}

const local = (name: string) => name.slice(name.indexOf(":") + 1);
function attr(node: XmlNode, localName: string): string | undefined {
  for (const [k, v] of Object.entries(node.attrs)) if (local(k) === localName) return v;
  return undefined;
}
function child(node: XmlNode, localName: string): XmlNode | undefined {
  return node.children.find((c) => local(c.name) === localName);
}

/** Convertește un nod SOAP-encoded într-o valoare JS generică. */
export function soapValue(node: XmlNode): unknown {
  if (/^(true|1)$/i.test(attr(node, "nil") ?? "")) return null;
  const type = local(attr(node, "type") ?? "");
  const kids = node.children;
  if (kids.length === 0) {
    const text = node.text.trim();
    if (/^(int|integer|long|short|float|double|decimal)$/.test(type)) {
      const n = Number(text);
      return text !== "" && Number.isFinite(n) ? n : text;
    }
    if (type === "boolean") return /^(true|1)$/i.test(text);
    if (type === "Array" || type === "Map" || type === "Struct") return type === "Array" ? [] : {};
    return node.text;
  }
  const allItems = kids.every((c) => local(c.name) === "item");
  // Array asociativ PHP: item/key/value.
  if (allItems && kids.every((c) => child(c, "key") && child(c, "value"))) {
    const out: Record<string, unknown> = {};
    for (const item of kids) out[String(soapValue(child(item, "key")!))] = soapValue(child(item, "value")!);
    return out;
  }
  if (type === "Array" || allItems) return kids.map(soapValue);
  const out: Record<string, unknown> = {};
  const repeated = new Set<string>();
  for (const c of kids) {
    const key = local(c.name);
    const value = soapValue(c);
    if (!(key in out)) out[key] = value;
    else if (repeated.has(key)) (out[key] as unknown[]).push(value);
    else {
      out[key] = [out[key], value];
      repeated.add(key);
    }
  }
  return out;
}

export class ImopediaSoapError extends Error {
  constructor(
    public readonly code: "SOAP_FAULT" | "PARSE_ERROR" | "HTTP_ERROR" | "TIMEOUT" | "NETWORK_ERROR",
    message: string,
    public readonly faultCode: string | null = null,
    public readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = "ImopediaSoapError";
  }
}

/** Întoarce valoarea răspunsului RPC (primul copil al `<op>Response>`); aruncă SOAP_FAULT. */
export function parseSoapResponse(xml: string): unknown {
  const root = parseXml(xml);
  const env = root.children.find((c) => local(c.name) === "Envelope");
  const body = env ? child(env, "Body") : undefined;
  if (!body) throw new ImopediaSoapError("PARSE_ERROR", "Răspuns Imopedia fără plic SOAP.");
  const fault = child(body, "Fault");
  if (fault) {
    const fs = child(fault, "faultstring")?.text.trim() || "SOAP Fault";
    throw new ImopediaSoapError("SOAP_FAULT", fs, child(fault, "faultcode")?.text.trim() ?? null);
  }
  const response = body.children[0];
  if (!response) return null;
  const ret = response.children[0];
  return ret ? soapValue(ret) : null;
}

export type ImopediaResult = {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  success: string[];
  raw: Record<string, unknown>;
};

export function normalizeBool(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || (typeof value === "string" && value.toLowerCase() === "true");
}

/**
 * Mesaj unic pentru un element de tip `{ field, errorMessage, errorCode }`
 * (forma reală a lui `_errors` / `_warnings`). `field` lipsește din mesaj când
 * e gol sau este ghidul generic `soap`; `errorCode` apare doar când e completat.
 */
function issueMessage(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  if (!("errorMessage" in rec)) return null;
  const text = String(rec["errorMessage"] ?? "").trim();
  const field = String(rec["field"] ?? "").trim();
  const code = String(rec["errorCode"] ?? "").trim();
  const base = field && field.toLowerCase() !== "soap" ? (text ? `${field}: ${text}` : field) : text;
  return code ? (base ? `${base} (${code})` : code) : base;
}

function messages(value: unknown, issues = false): string[] {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) return value.flatMap((v) => messages(v, issues));
  if (typeof value === "object") {
    if (issues) {
      const single = issueMessage(value);
      if (single !== null) return single === "" ? [] : [single];
    }
    return Object.values(value as Record<string, unknown>).flatMap((v) => messages(v, issues));
  }
  return [String(value)];
}

/** Citește `_isValid`, `_errors`, `_warnings`, `_success` (listă sau obiect cu cheia "0"). */
export function readImopediaResult(value: unknown): ImopediaResult {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    isValid: normalizeBool(raw["_isValid"]),
    errors: messages(raw["_errors"], true),
    warnings: messages(raw["_warnings"], true),
    success: messages(raw["_success"]),
    raw,
  };
}

/** XML pentru jurnal: fără parolă/session_id în clar, trunchiat la ~20 KB. */
export function redactSoapXml(xml: string, secrets: (string | null | undefined)[] = []): string {
  let out = xml.replace(/(<(?:[\w-]+:)?(password|session_id)\b[^>]*>)[\s\S]*?(<\/(?:[\w-]+:)?\2>)/gi, "$1[redacted]$3");
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join("[redacted]");
  return out.length > IMOPEDIA_LOG_MAX_CHARS ? `${out.slice(0, IMOPEDIA_LOG_MAX_CHARS)}…[truncated]` : out;
}
