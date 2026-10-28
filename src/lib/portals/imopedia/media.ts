/**
 * Imopedia.ro — imaginile și video-ul ofertei (pure: FILE_ID, plicuri, citirea răspunsurilor, planul).
 * Rulează doar după un `saveProperty` valid, în aceeași sesiune SOAP.
 */
import { buildOptionsEnvelope, buildRawOptionsEnvelope, normalizeBool, xmlEscape } from "./soap";

export type ImopediaImage = {
  /** ID-ul imaginii Habitoo. */
  photoId: string;
  /** Hash-ul (hex) identității fișierului servit; altă imagine/fișier → alt hash. */
  contentHash: string;
  /** URL public HTTPS (proxy Habitoo, cu watermark dacă e activ). */
  url: string | null;
  /** Base64 brut, fără prefix `data:`; folosit doar fără URL public. */
  body?: string | null;
};

export type ImopediaSentFile = { fileId: string; photoId: string | null; order: number };

/** `hb-<id imagine>-<primele 8 din hash>`, doar `[A-Za-z0-9-]`, max. 100 de caractere. */
export function imopediaFileId(photoId: string, contentHash: string): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9-]/g, "");
  return `hb-${clean(photoId)}-${clean(contentHash).slice(0, 8)}`.slice(0, 100);
}

/** ID-ul unui link YouTube (watch, youtu.be, shorts, embed); null altfel. */
export function youtubeVideoId(url: string | null | undefined): string | null {
  const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/.exec(url ?? "");
  return m ? m[1]! : null;
}

export function youtubeFileId(videoId: string): string {
  return `yt-${videoId.replace(/[^A-Za-z0-9-]/g, "")}`.slice(0, 100);
}

const opts = (agencyId: number, idLocal: number) => [
  { name: "AGENTIA", type: "xsd:int" as const, value: agencyId },
  { name: "ID_LOCAL", type: "xsd:int" as const, value: idLocal },
];

export function buildExistsFileEnvelope(sid: string, agencyId: number, idLocal: number, fileId: string): string {
  return buildOptionsEnvelope("existsFile", sid, "ExistsFileType", [...opts(agencyId, idLocal), { name: "FILE_ID", type: "xsd:string", value: fileId }]);
}

export function buildAddFileEnvelope(
  sid: string,
  agencyId: number,
  idLocal: number,
  file: { fileId: string; title: string; type: "image" | "youtube"; url: string | null; body?: string | null; order: number },
): string {
  return buildOptionsEnvelope("addFile", sid, "AddFileType", [
    ...opts(agencyId, idLocal),
    { name: "FILE_ID", type: "xsd:string", value: file.fileId },
    { name: "FILE_TITLE", type: "xsd:string", value: file.title },
    { name: "FILE_TYPE", type: "xsd:string", value: file.type },
    { name: "FILE_URL", type: "xsd:string", value: file.url },
    { name: "FILE_BODY", type: "xsd:string", value: file.url ? null : (file.body ?? null) },
    { name: "ORDER", type: "xsd:int", value: file.order },
  ]);
}

export function buildSyncFilesEnvelope(sid: string, agencyId: number, idLocal: number, fileIds: string[]): string {
  if (fileIds.length === 0) throw new Error("syncFiles nu se apelează cu o listă goală.");
  return buildOptionsEnvelope("syncFiles", sid, "syncFilesType", [...opts(agencyId, idLocal), { name: "FILE_IDS", type: "xsd:string", value: JSON.stringify(fileIds) }]);
}

export function buildDeleteFileEnvelope(sid: string, agencyId: number, idLocal: number, fileId: string): string {
  return buildRawOptionsEnvelope(
    "deleteFile",
    sid,
    "DeleteFileType",
    `<AGENTIA xsi:type="xsd:int">${agencyId}</AGENTIA><ID_LOCAL xsi:type="xsd:int">${idLocal}</ID_LOCAL>` +
      `<FILE xsi:type="tns:FileType"><ID xsi:type="xsd:string">${xmlEscape(fileId)}</ID></FILE>`,
  );
}

const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v && typeof v === "object" ? (v as Record<string, unknown>)["0"] : undefined);

/** `_success[0].result` din răspunsul brut. */
export function successResult(raw: Record<string, unknown>): unknown {
  const entry = first(raw["_success"]);
  return entry && typeof entry === "object" ? (entry as Record<string, unknown>)["result"] : undefined;
}

/** Avertismentul pentru un câmp (`_warnings.IMAGE`), ca obiect cu cheie sau listă `{field}`. */
export function warningFor(raw: Record<string, unknown>, field: string): string | null {
  const w = raw["_warnings"];
  if (!w || typeof w !== "object") return null;
  const items: unknown[] = Array.isArray(w) ? w : Object.entries(w as Record<string, unknown>).map(([k, v]) => (k === field ? { field, errorMessage: v } : v));
  for (const item of items) {
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      if (String(rec["field"] ?? "") === field) {
        const msg = rec["errorMessage"];
        return typeof msg === "string" && msg ? msg : JSON.stringify(msg ?? field);
      }
    }
  }
  return null;
}

export function existsFileResult(raw: Record<string, unknown>): boolean {
  const r = successResult(raw);
  if (r && typeof r === "object" && !Array.isArray(r)) {
    const rec = r as Record<string, unknown>;
    return normalizeBool(rec["exists"] ?? rec["0"]);
  }
  return normalizeBool(r);
}

/** `addFile` reușit doar cu `photo_id` nevid, diferit de `false`, și fără `_warnings.IMAGE`. */
export function addFileAccepted(raw: Record<string, unknown>): { ok: boolean; photoId: string | null; reason: string | null } {
  const r = successResult(raw);
  const rec = r && typeof r === "object" ? ((first(r) && typeof first(r) === "object" && !("photo_id" in (r as object)) ? first(r) : r) as Record<string, unknown>) : {};
  const pid = rec["photo_id"];
  const image = warningFor(raw, "IMAGE");
  const valid = pid !== undefined && pid !== null && pid !== "" && pid !== false && String(pid).toLowerCase() !== "false" && String(pid) !== "0";
  if (!valid || image) return { ok: false, photoId: null, reason: image ?? "Imopedia nu a confirmat imaginea (photo_id lipsă)." };
  return { ok: true, photoId: String(pid), reason: null };
}

export function syncMissing(raw: Record<string, unknown>): string[] {
  const r = successResult(raw);
  const list = r && typeof r === "object" ? (r as Record<string, unknown>)["trebuie_trimise"] : undefined;
  if (Array.isArray(list)) return list.map(String);
  if (list && typeof list === "object") return Object.values(list as Record<string, unknown>).map(String);
  if (typeof list === "string" && list.trim()) {
    try { const v = JSON.parse(list); if (Array.isArray(v)) return v.map(String); } catch { return list.split(",").map((s) => s.trim()).filter(Boolean); }
  }
  return [];
}

export const INCOMPLETE_GALLERY = "Galerie sincronizată incomplet pe Imopedia.ro";
