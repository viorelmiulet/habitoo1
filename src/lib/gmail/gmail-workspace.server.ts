/**
 * Gmail-ul Habitoos (contul workspace-ului), prin gateway-ul de conectoare.
 *
 * Server-only: `LOVABLE_API_KEY` și `GOOGLE_MAIL_API_KEY` sunt secrete și se
 * citesc exclusiv din `process.env`, în interiorul funcțiilor (runtime-ul
 * Worker le poate schimba între cereri). Browserul nu primește niciodată
 * cheile, ci doar rezultatul unei citiri.
 */
const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_mail";

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** Doar nume de piese lipsă, niciodată valori. */
export function workspaceGmailConfigStatus(): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!readEnv("LOVABLE_API_KEY")) missing.push("LOVABLE_API_KEY");
  if (!readEnv("GOOGLE_MAIL_API_KEY")) missing.push("GOOGLE_MAIL_API_KEY");
  return { configured: missing.length === 0, missing };
}

export type WorkspaceGmailProfile = {
  email: string;
  messagesTotal: number;
  threadsTotal: number;
};

/** Citire de profil pe contul Habitoos; arunca dacă gateway-ul refuză. */
export async function readWorkspaceGmailProfile(): Promise<WorkspaceGmailProfile> {
  const { configured, missing } = workspaceGmailConfigStatus();
  if (!configured) {
    throw new Error(`Gmail workspace not configured (missing: ${missing.join(", ")})`);
  }
  const res = await fetch(`${GATEWAY_BASE_URL}/${CONNECTOR_ID}/gmail/v1/users/me/profile`, {
    headers: {
      Authorization: `Bearer ${readEnv("LOVABLE_API_KEY")}`,
      "X-Connection-Api-Key": readEnv("GOOGLE_MAIL_API_KEY"),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Workspace Gmail profile lookup failed [${res.status}]: ${body}`);
    throw new Error(`Workspace Gmail profile lookup failed (${res.status})`);
  }
  const profile = (await res.json()) as {
    emailAddress?: string;
    messagesTotal?: number;
    threadsTotal?: number;
  };
  return {
    email: profile.emailAddress ?? "",
    messagesTotal: profile.messagesTotal ?? 0,
    threadsTotal: profile.threadsTotal ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Trimitere din contul workspace-ului (folosită doar de cererile de cheie portal).
// ---------------------------------------------------------------------------

export type WorkspaceGmailMessage = {
  from: string;
  to: string | string[];
  cc?: string | string[] | null;
  replyTo?: string | null;
  subject: string;
  text: string;
  html?: string | null;
  /** Antete suplimentare opționale (ex. List-Unsubscribe); numele se validează. */
  headers?: Record<string, string>;
};

export type WorkspaceGmailSendResult =
  | { ok: true; gmailMessageId: string }
  | { ok: false; error: string };

const CRLF = /[\r\n]/;

function utf8Base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function toBase64Url(s: string): string {
  return utf8Base64(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** RFC 2047 pentru texte non-ASCII din antete. */
export function encodeHeaderWord(v: string): string {
  return /^[\x20-\x7E]*$/.test(v) ? v : `=?UTF-8?B?${utf8Base64(v)}?=`;
}

function assertHeaderSafe(v: string, field: string) {
  if (CRLF.test(v)) throw new Error(`Antetul ${field} conține caractere nepermise.`);
}

/** „Nume <adresa>” sau „adresa” → { name, address }. */
export function parseAddress(v: string): { name: string; address: string } {
  const t = v.trim();
  const m = /^(.*)<\s*([^<>\s]+@[^<>\s]+)\s*>$/.exec(t);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, ""), address: m[2] };
  return { name: "", address: t };
}

function formatAddress(v: string, field: string): string {
  assertHeaderSafe(v, field);
  const { name, address } = parseAddress(v);
  if (!/^[^@\s<>",]+@[^@\s<>",]+$/.test(address)) {
    throw new Error(`Adresă invalidă în ${field}.`);
  }
  if (!name) return address;
  const display = /^[\x20-\x7E]*$/.test(name) ? `"${name.replace(/["\\]/g, "")}"` : encodeHeaderWord(name);
  return `${display} <${address}>`;
}

function list(v: string | string[] | null | undefined): string[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : v.split(",")).map((s) => s.trim()).filter(Boolean);
}

/** Mesaj RFC 2822 complet (text + HTML, UTF-8). Aruncă la antete nesigure. */
export function buildWorkspaceGmailMime(msg: WorkspaceGmailMessage, boundary?: string): string {
  assertHeaderSafe(msg.subject, "Subject");
  const to = list(msg.to);
  if (to.length === 0) throw new Error("Lipsește destinatarul.");
  const headers = [
    `From: ${formatAddress(msg.from, "From")}`,
    `To: ${to.map((a) => formatAddress(a, "To")).join(", ")}`,
  ];
  const cc = list(msg.cc);
  if (cc.length) headers.push(`Cc: ${cc.map((a) => formatAddress(a, "Cc")).join(", ")}`);
  if (msg.replyTo) headers.push(`Reply-To: ${formatAddress(msg.replyTo, "Reply-To")}`);
  for (const [name, value] of Object.entries(msg.headers ?? {})) {
    if (!/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(name) || /^(from|to|cc|bcc|subject|reply-to|mime-version|content-type|content-transfer-encoding)$/i.test(name)) throw new Error(`Antet nepermis: ${name}`);
    assertHeaderSafe(value, name);
    if (!/^[\x20-\x7E]*$/.test(value)) throw new Error(`Antetul ${name} conține caractere nepermise.`);
    headers.push(`${name}: ${value}`);
  }
  headers.push(`Subject: ${encodeHeaderWord(msg.subject)}`, "MIME-Version: 1.0");

  const textPart = [
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(utf8Base64(msg.text)),
  ];
  if (!msg.html) {
    return [...headers, ...textPart].join("\r\n");
  }
  const b = boundary ?? `habitoo_${crypto.randomUUID().replace(/-/g, "")}`;
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${b}"`,
    "",
    `--${b}`,
    ...textPart,
    `--${b}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(utf8Base64(msg.html)),
    `--${b}--`,
    "",
  ].join("\r\n");
}

function wrap76(s: string): string {
  return s.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

/** Mesaj clar în română; fără corpul răspunsului Google. */
export function workspaceGmailSendError(status: number): string {
  if (status === 401) return "Conexiunea Gmail a platformei a expirat sau nu mai este validă. Reconectează contul Gmail.";
  if (status === 403) return "Contul Gmail al platformei nu are permisiunea de a trimite emailuri.";
  if (status === 400) return "Gmail a refuzat mesajul (format invalid).";
  if (status === 429) return "Limita de trimitere Gmail a fost atinsă. Reîncearcă mai târziu.";
  if (status >= 500) return "Gmail nu răspunde momentan. Reîncearcă mai târziu.";
  return `Trimiterea prin Gmail a eșuat (cod ${status}).`;
}

/**
 * Trimite prin contul Gmail al platformei. Expeditorul trebuie să fie chiar
 * adresa contului; altă adresă se refuză (nu se rescrie).
 */
export async function sendWorkspaceGmail(msg: WorkspaceGmailMessage): Promise<WorkspaceGmailSendResult> {
  const { configured } = workspaceGmailConfigStatus();
  if (!configured) return { ok: false, error: "Gmail-ul platformei nu este configurat." };

  let account: string;
  try {
    account = (await readWorkspaceGmailProfile()).email.toLowerCase();
  } catch {
    return { ok: false, error: "Nu am putut verifica contul Gmail al platformei." };
  }
  const sender = parseAddress(msg.from).address.toLowerCase();
  if (!account || sender !== account) {
    return {
      ok: false,
      error: `Expeditorul ${sender || "(gol)"} nu este permis; Gmail-ul platformei trimite doar de pe ${account || "adresa contului"}.`,
    };
  }

  let raw: string;
  try {
    raw = toBase64Url(buildWorkspaceGmailMime(msg));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Mesaj invalid." };
  }

  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE_URL}/${CONNECTOR_ID}/gmail/v1/users/me/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readEnv("LOVABLE_API_KEY")}`,
        "X-Connection-Api-Key": readEnv("GOOGLE_MAIL_API_KEY"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
  } catch {
    return { ok: false, error: "Gmail nu a putut fi contactat. Reîncearcă mai târziu." };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`Workspace Gmail send failed [${res.status}]: ${body.slice(0, 500)}`);
    return { ok: false, error: workspaceGmailSendError(res.status) };
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, gmailMessageId: data.id ?? "" };
}
