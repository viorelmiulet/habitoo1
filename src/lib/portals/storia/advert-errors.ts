/**
 * Citirea tolerantă a evenimentelor `publish_advert` de eroare de la Storia /
 * OLX Group (`advert_posted_error`, `advert_put_error`, …, `advert_image_error`).
 *
 * Documentația OLX descrie un sumar de eroare, o descriere și erori de
 * validare per câmp; erorile de imagine vin separat (ex. dimensiuni minime).
 * Denumirile exacte pot varia, așa că acceptăm mai multe forme. Pur, fără I/O.
 */
import { STORIA_STATUS_MESSAGE } from "./adverts.server";

type Json = Record<string, unknown>;

export const STORIA_ERROR_MAX = 500;

const asRecord = (v: unknown): Json | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;

const text = (v: unknown): string | null => {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
};

function at(root: Json, path: string): unknown {
  let cursor: unknown = root;
  for (const seg of path.split(".")) {
    const rec = asRecord(cursor);
    if (!rec) return undefined;
    cursor = rec[seg];
  }
  return cursor;
}

function first(root: Json, paths: string[]): string | null {
  for (const p of paths) {
    const v = text(at(root, p));
    if (v) return v;
  }
  return null;
}

export function isStoriaErrorEvent(eventType: string | null): boolean {
  if (!eventType) return false;
  return /_error$/i.test(eventType) || /image_error|image.*fail/i.test(eventType);
}

export function isStoriaImageErrorEvent(eventType: string | null): boolean {
  return Boolean(eventType && /image/i.test(eventType) && /error|fail/i.test(eventType));
}

export function isStoriaSuccessEvent(eventType: string | null): boolean {
  return Boolean(eventType && /_success$/i.test(eventType));
}

/** Evenimentul de succes care scoate anunțul de pe portal. */
export function isStoriaRemovalSuccess(eventType: string | null): boolean {
  return Boolean(eventType && /(deleted|deactivated)_success$/i.test(eventType));
}

const FIELD_LABEL: Record<string, string> = {
  title: "titlu",
  description: "descriere",
  price: "preț",
  images: "imagini",
  image: "imagine",
  location: "locație",
  contact: "contact",
  attributes: "atribute",
  category_urn: "categorie",
};

function label(field: string): string {
  const root = field.split(/[.[]/)[0] ?? field;
  return FIELD_LABEL[root] ? `${FIELD_LABEL[root]} (${field})` : field;
}

function messagesOf(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (Array.isArray(value)) return value.flatMap(messagesOf);
  const rec = asRecord(value);
  if (rec) {
    const m = first(rec, ["message", "detail", "description", "reason", "error", "msg"]);
    if (m) return [m];
    const nested = rec["messages"] ?? rec["errors"];
    if (nested) return messagesOf(nested);
  }
  return [];
}

/** Lista „câmp: mesaj” din forme de tip array sau obiect. */
function validationLines(raw: unknown): string[] {
  const lines: string[] = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const rec = asRecord(entry);
      if (!rec) {
        lines.push(...messagesOf(entry));
        continue;
      }
      const field = first(rec, ["field", "path", "name", "property", "key", "url"]);
      const msgs = messagesOf(rec);
      for (const m of msgs.length ? msgs : ["invalid"]) {
        lines.push(field ? `${label(field)}: ${m}` : m);
      }
    }
  } else {
    const rec = asRecord(raw);
    if (rec) {
      for (const [field, value] of Object.entries(rec)) {
        for (const m of messagesOf(value)) lines.push(`${label(field)}: ${m}`);
      }
    }
  }
  return lines;
}

export type StoriaAdvertError = {
  /** Text scurt în română, max 500 caractere. */
  message: string;
  /** false = structură nerecunoscută; `raw` trebuie păstrat în jurnal. */
  recognized: boolean;
  raw: string;
};

export function readStoriaAdvertError(
  data: Json,
  eventType: string | null,
): StoriaAdvertError {
  const raw = JSON.stringify(data ?? {}).slice(0, STORIA_ERROR_MAX);
  const err = asRecord(data["error"]) ?? asRecord(data["errors"]) ?? data;

  const title = first(err, ["summary", "title", "message", "error_summary", "code"]) ??
    first(data, ["summary", "title", "error_message"]);
  const detail = first(err, ["detail", "description", "error_description", "reason"]) ??
    first(data, ["detail", "description", "moderation.reason", "moderation.description"]);

  const validationSources = [
    err["validation"],
    err["validation_errors"],
    err["fields"],
    err["errors"],
    data["validation"],
    data["validation_errors"],
    data["errors"],
    data["images"],
  ];
  let lines: string[] = [];
  for (const src of validationSources) {
    if (src && typeof src === "object") {
      lines = validationLines(src);
      if (lines.length) break;
    }
  }

  const image = isStoriaImageErrorEvent(eventType);
  const prefix = image ? "Storia a respins o imagine" : "Storia a respins anunțul";
  const parts = [title, detail && detail !== title ? detail : null].filter(Boolean) as string[];
  const recognized = parts.length > 0 || lines.length > 0;

  let message: string;
  if (recognized) {
    message = `${prefix}: ${[...parts, ...lines].join("; ")}`;
  } else {
    message = image
      ? `${prefix} (de exemplu dimensiuni sub minimul cerut). Verifică pozele și republică.`
      : `${prefix}. Verifică datele anunțului și republică.`;
  }
  if (message.length > STORIA_ERROR_MAX) message = `${message.slice(0, STORIA_ERROR_MAX - 1)}…`;
  return { message, recognized, raw };
}

/** Mesaj informativ (nu eroare) pentru stările de așteptare. */
export function storiaInfoMessage(code: string | null): string | null {
  if (code !== "new" && code !== "unpaid" && code !== "blocked") return null;
  return `Anunț Storia ${STORIA_STATUS_MESSAGE[code]}.`;
}

/** Id stabil de notificare: o singură notificare per tranzacție și utilizator. */
export async function storiaNotificationId(parts: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(parts));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
