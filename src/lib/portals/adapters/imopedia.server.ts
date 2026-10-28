/**
 * Adaptor Imopedia.ro — SOAP: test conexiune (login → viewAgency → logout),
 * publicare/actualizare (login → saveAgent? → saveProperty → logout) și
 * retragere (login → deleteProperty → logout). Media vine în etapa următoare.
 */
import type {
  ConnectionStatusOutcome,
  ListingOutcome,
  ListingRef,
  PortalAdapter,
  PortalContext,
  PortalFail,
  PortalResult,
} from "../adapter";
import { notSupported } from "../adapter";
import {
  ImopediaSoapError,
  imopediaLogin,
  imopediaLogout,
  imopediaViewAgency,
  imopediaCall,
  redactSoapXml,
  type ImopediaClientDeps,
  type ImopediaRawLog,
} from "../imopedia/soap.server";
import { parseImopediaAgencyId } from "../imopedia/config";
import {
  INCOMPLETE_GALLERY,
  addFileAccepted,
  buildAddFileEnvelope,
  buildDeleteFileEnvelope,
  buildExistsFileEnvelope,
  buildSyncFilesEnvelope,
  existsFileResult,
  imopediaFileId,
  syncMissing,
  warningFor,
  youtubeFileId,
  youtubeVideoId,
  type ImopediaImage,
  type ImopediaSentFile,
} from "../imopedia/media";
import type { ImopediaResult } from "../imopedia/soap";
import { mapPropertyToImopedia, type ImopediaMapContext } from "../imopedia/mapper";
import {
  agentFields,
  buildDeletePropertyEnvelope,
  buildSaveAgentEnvelope,
  buildSavePropertyEnvelope,
  imopediaAgentFingerprint,
  imopediaBlockingReasons,
  imopediaIdLocal,
  imopediaPublicUrl,
  imopediaRejectionMessage,
  isExpiredSession,
  readSavePropertySuccess,
  savePropertyFields,
  type ImopediaAgent,
} from "../imopedia/publish";

export type ImopediaDeps = ImopediaClientDeps & {
  loadProperty?: (
    ctx: PortalContext,
    ref: ListingRef,
    agencyId: number,
  ) => Promise<{ ok: true; row: Record<string, any>; agent: ImopediaAgent | null; mapContext: ImopediaMapContext } | { ok: false; reasons: string[] }>;
  /** Corespondența agent → AGENT_ID (alocat o dată, imuabil); cheia contului = AGENTIA. */
  agentLink?: (organizationId: string, userId: string) => Promise<{ externalId: number; externalAccountId: string | null; fingerprint: string | null }>;
  markAgentSynced?: (organizationId: string, userId: string, error: string | null, fingerprint: string | null, externalAccountId: string) => Promise<void>;
  /** Imaginile publicabile în ordinea Habitoo (URL public cu watermark) și linkul YouTube, dacă există. */
  loadMedia?: (ctx: PortalContext, ref: ListingRef) => Promise<{ images: ImopediaImage[]; videoUrl: string | null }>;
  /** Evidența `imopedia_listing_files` (listingId null = listarea nu există încă). */
  loadSentFiles?: (ctx: PortalContext, ref: ListingRef) => Promise<{ listingId: string | null; files: ImopediaSentFile[] }>;
  saveSentFiles?: (listingId: string, files: ImopediaSentFile[]) => Promise<void>;
};

function fail(code: PortalFail["code"], message: string, extra: Partial<PortalFail> = {}): PortalFail {
  return { ok: false, code, message, detail: null, httpStatus: null, ...extra };
}

function boostSummary(raw: Record<string, unknown>): string | null {
  const find = (obj: unknown, key: string, depth = 0): unknown => {
    if (!obj || typeof obj !== "object" || depth > 4) return undefined;
    const rec = obj as Record<string, unknown>;
    if (key in rec) return rec[key];
    for (const v of Object.values(rec)) {
      const found = find(v, key, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  const parts = [
    ["boostAvailable", "disponibile"],
    ["boostAllocated", "alocate"],
    ["boostConsumed", "consumate"],
  ]
    .map(([k, label]) => {
      const v = find(raw, k!);
      return v === undefined || v === null || v === "" ? null : `${label} ${String(v)}`;
    })
    .filter(Boolean);
  return parts.length ? `Boost: ${parts.join(", ")}` : null;
}

type Runner = (op: string, build: (sid: string) => string) => Promise<ImopediaResult>;

type DesiredFile = { fileId: string; photoId: string | null; type: "image" | "youtube"; url: string | null; body?: string | null; order: number; title: string };

/**
 * Imaginile/video după un `saveProperty` valid. Erorile devin avertismente;
 * oferta rămâne publicată, iar următoarea actualizare reia ce lipsește.
 */
async function syncImopediaMedia(
  run: Runner,
  agencyId: number,
  idLocal: number,
  desired: DesiredFile[],
  sent: ImopediaSentFile[],
): Promise<{ final: ImopediaSentFile[]; warnings: string[] }> {
  const warnings: string[] = [];
  const sentById = new Map(sent.map((f) => [f.fileId, f]));
  const kept = new Map<string, ImopediaSentFile>();
  const add = async (f: DesiredFile): Promise<boolean> => {
    const res = await run("addFile", (sid) => buildAddFileEnvelope(sid, agencyId, idLocal, f));
    const acc = res.isValid ? addFileAccepted(res.raw) : { ok: false, photoId: null, reason: res.errors.join("; ") || "respinsă" };
    if (!acc.ok) {
      warnings.push(`${f.type === "youtube" ? "Video-ul" : `Imaginea ${f.order}`} a fost respins${f.type === "youtube" ? "" : "ă"} de Imopedia: ${acc.reason}`);
      return false;
    }
    kept.set(f.fileId, { fileId: f.fileId, photoId: acc.photoId, order: f.order });
    return true;
  };

  for (const f of desired) {
    const prev = sentById.get(f.fileId);
    if (prev) { kept.set(f.fileId, prev); continue; }
    const ex = await run("existsFile", (sid) => buildExistsFileEnvelope(sid, agencyId, idLocal, f.fileId));
    if (ex.isValid && existsFileResult(ex.raw)) { kept.set(f.fileId, { fileId: f.fileId, photoId: null, order: f.order }); continue; }
    await add(f);
  }

  if (desired.length === 0) {
    // Toate fișierele au fost eliminate din Habitoo: syncFiles nu primește niciodată o listă goală.
    for (const f of sent) {
      const res = await run("deleteFile", (sid) => buildDeleteFileEnvelope(sid, agencyId, idLocal, f.fileId));
      if (!res.isValid) { warnings.push(`Fișierul ${f.fileId} nu a putut fi șters de pe Imopedia: ${res.errors.join("; ")}`); kept.set(f.fileId, f); }
    }
    return { final: [...kept.values()], warnings };
  }

  const order = () => desired.map((f) => f.fileId).filter((id) => kept.has(id));
  if (order().length === 0) return { final: [], warnings };
  let sync = await run("syncFiles", (sid) => buildSyncFilesEnvelope(sid, agencyId, idLocal, order()));
  const missing = sync.isValid ? syncMissing(sync.raw) : [];
  if (missing.length) {
    for (const id of missing) {
      const f = desired.find((d) => d.fileId === id);
      kept.delete(id);
      if (f) await add(f);
    }
    if (order().length) sync = await run("syncFiles", (sid) => buildSyncFilesEnvelope(sid, agencyId, idLocal, order()));
  }
  if (!sync.isValid) warnings.push(`${INCOMPLETE_GALLERY}: ${sync.errors.join("; ") || "syncFiles respins"}.`);
  else if (warningFor(sync.raw, "FILE_IDS")) warnings.push(`${INCOMPLETE_GALLERY}: ${warningFor(sync.raw, "FILE_IDS")}.`);
  return { final: order().map((id) => kept.get(id)!), warnings };
}

export function createImopediaAdapter(deps: ImopediaDeps = {}): PortalAdapter {
  function credentials(ctx: PortalContext): { username: string; password: string; agencyId: number } | PortalFail {
    const username = (ctx.externalAccountId ?? "").trim();
    const password = ctx.portalCredential ?? "";
    const agencyId = parseImopediaAgencyId(ctx.settings["agency_id"]);
    if (!username || !password) return fail("CONFIG_ERROR", "Lipsesc utilizatorul sau parola API Imopedia.");
    if (agencyId === null) return fail("CONFIG_ERROR", "ID-ul agenției Imopedia (AGENTIA) trebuie să fie un număr întreg ≥ 1.");
    return { username, password, agencyId };
  }

  /** O sesiune SOAP pentru un job: login, operații, logout în finally; jurnal XML redactat. */
  async function withSession<T>(
    username: string,
    password: string,
    body: (s: { run: Runner; log: () => unknown }) => Promise<T>,
  ): Promise<T | PortalFail> {
    const logs: ImopediaRawLog[] = [];
    const sessions: string[] = [];
    let sessionId: string | null = null;
    const tracked: ImopediaClientDeps = { ...deps, onResponse: (e) => { logs.push(e); deps.onResponse?.(e); } };
    const log = () => ({ responses: logs.map((l) => ({ operation: l.operation, http_status: l.status, xml: redactSoapXml(l.xml, [password, ...sessions]) })) });
    const login = async () => {
      sessionId = await imopediaLogin(username, password, tracked);
      sessions.push(sessionId);
    };
    let relogged = false;
    const run = async (op: string, build: (sid: string) => string) => {
      let result = await imopediaCall(op, build(sessionId!), tracked);
      if (!result.isValid && isExpiredSession(result.errors) && !relogged) {
        relogged = true;
        if (sessionId) await imopediaLogout(sessionId, tracked).catch(() => undefined);
        sessionId = null;
        await login();
        result = await imopediaCall(op, build(sessionId!), tracked);
      }
      return result;
    };
    try {
      try {
        await login();
      } catch (error) {
        if (error instanceof ImopediaSoapError && error.code === "SOAP_FAULT") {
          return fail("AUTH_ERROR", "Utilizator sau parolă Imopedia greșite", { portalResponse: log(), detail: "imopedia_login_fault" });
        }
        throw error;
      }
      return await body({ run, log });
    } catch (error) {
      const e = error instanceof ImopediaSoapError ? error : null;
      const code: PortalFail["code"] = e?.code === "TIMEOUT" ? "TIMEOUT" : e?.code === "NETWORK_ERROR" ? "NETWORK_ERROR" : "PORTAL_ERROR";
      const message = (e?.message ?? (error instanceof Error ? error.message : "Operația Imopedia a eșuat.")).split(password).join("[redacted]");
      return fail(code, message, { httpStatus: e?.httpStatus ?? null, portalResponse: log() });
    } finally {
      if (sessionId) await imopediaLogout(sessionId, tracked).catch(() => undefined);
    }
  }

  async function upsert(ctx: PortalContext, ref: ListingRef, kind: "publish" | "update"): Promise<PortalResult<ListingOutcome>> {
    const cred = credentials(ctx);
    if ("ok" in cred) return cred;
    if (!deps.loadProperty || !deps.agentLink || !deps.markAgentSynced) return notSupported("publish_listing");
    const loaded = await deps.loadProperty(ctx, ref, cred.agencyId);
    if (!loaded.ok) return fail("VALIDATION_ERROR", `Oferta nu poate fi trimisă la Imopedia.ro: ${loaded.reasons.join(" ")}`);

    // Validare locală completă înainte de orice apel.
    const media = deps.loadMedia ? await deps.loadMedia(ctx, ref) : null;
    const gold = ref.promoted === true;
    const mapContext: ImopediaMapContext = { ...loaded.mapContext, gold };
    const reasons = imopediaBlockingReasons({
      row: loaded.row as never,
      ctx: mapContext,
      agent: loaded.agent,
      externalId: ref.externalId,
      ...(media ? { imageCount: media.images.length } : {}),
    });
    if (reasons.length) return fail("VALIDATION_ERROR", `Oferta nu poate fi trimisă la Imopedia.ro: ${reasons.join(" ")}`);
    const mapped = mapPropertyToImopedia(loaded.row as never, mapContext);
    if (!mapped.ok) return fail("VALIDATION_ERROR", `Oferta nu poate fi trimisă la Imopedia.ro: ${mapped.reasons.join(" ")}`);
    // ID_LOCAL: o dată salvat în external_id, nu se mai recalculează.
    const idLocal = (ref.externalId ? imopediaIdLocal(ref.externalId) : imopediaIdLocal(loaded.row.reference))!;
    const agent = loaded.agent!;
    const account = String(cred.agencyId);
    const link = await deps.agentLink(ctx.organizationId, agent.userId);
    const fp = imopediaAgentFingerprint(cred.agencyId, agent);
    const agentUnchanged = link.externalAccountId === account && link.fingerprint === fp;
    const fields = savePropertyFields(mapped.fields, idLocal, link.externalId);
    const externalId = String(idLocal);

    if (!ctx.allowLiveRequests) {
      return { ok: true, data: { externalId, live: false, detail: `imopedia_dry_run op=saveProperty ID_LOCAL=${idLocal}`, message: "Trimiterile reale către Imopedia.ro sunt oprite: oferta a fost doar validată local." } };
    }

    return withSession(cred.username, cred.password, async ({ run, log }) => {
      if (!agentUnchanged) {
        const res = await run("saveAgent", (sid) => buildSaveAgentEnvelope(sid, agentFields(cred.agencyId, link.externalId, agent)));
        if (!res.isValid) {
          const msg = `Imopedia.ro (agent): ${res.errors.join("; ") || "agentul a fost respins."}`;
          await deps.markAgentSynced!(ctx.organizationId, agent.userId, msg, null, account);
          return fail("VALIDATION_ERROR", msg, { portalResponse: log() });
        }
        await deps.markAgentSynced!(ctx.organizationId, agent.userId, null, fp, account);
      }
      let res = await run("saveProperty", (sid) => buildSavePropertyEnvelope(sid, fields));
      // Gold refuzat (ex. limită depășită): oferta se salvează Standard, cu avertisment.
      let goldRefused: string | null = null;
      const goldError = res.errors.find((e) => /^GOLD\b/i.test(e));
      if (gold && !res.isValid && goldError) {
        goldRefused = goldError;
        const standard = fields.map((f) => (f.name === "GOLD" ? { ...f, value: 0 } : f));
        res = await run("saveProperty", (sid) => buildSavePropertyEnvelope(sid, standard));
      } else if (gold && res.isValid && warningFor(res.raw, "GOLD")) {
        goldRefused = warningFor(res.raw, "GOLD");
      }
      if (!res.isValid) return fail("VALIDATION_ERROR", imopediaRejectionMessage(res.errors), { portalResponse: log() });
      const saved = readSavePropertySuccess(res.raw);
      if (saved.idLocal !== idLocal) {
        return fail("PORTAL_ERROR", `Imopedia a confirmat alt ID_LOCAL (${saved.idLocal ?? "lipsă"}) decât cel trimis (${idLocal}); nu s-a salvat nimic.`, { portalResponse: log() });
      }
      const warn = [...mapped.warnings, ...res.warnings.filter((w) => !/^GOLD\b/i.test(w)).map((w) => `Atenționare Imopedia: ${w}`)];
      if (goldRefused) warn.push(`Imopedia a refuzat Gold („${goldRefused}”); oferta este publicată Standard și „Promovat” a fost debifat.`);

      if (media && deps.loadSentFiles) {
        try {
          const title = String(fields.find((f) => f.name === "TITLU")?.value ?? "Ofertă");
          const desired: DesiredFile[] = media.images.map((img, i) => ({
            fileId: imopediaFileId(img.photoId, img.contentHash),
            photoId: img.photoId,
            type: "image",
            url: img.url,
            body: img.body ?? null,
            order: i + 1,
            title: `${title} – foto ${i + 1}`,
          }));
          const yt = youtubeVideoId(media.videoUrl);
          if (yt && media.videoUrl) desired.push({ fileId: youtubeFileId(yt), photoId: null, type: "youtube", url: media.videoUrl, order: desired.length + 1, title: `${title} – video` });
          const sentState = await deps.loadSentFiles(ctx, ref);
          const synced = await syncImopediaMedia(run, cred.agencyId, idLocal, desired, sentState.files);
          warn.push(...synced.warnings);
          if (sentState.listingId && deps.saveSentFiles) await deps.saveSentFiles(sentState.listingId, synced.final);
        } catch (error) {
          warn.push(`Imaginile nu au fost sincronizate pe Imopedia (se reiau la următoarea actualizare): ${error instanceof Error ? error.message : "eroare"}.`);
        }
      }
      return {
        ok: true as const,
        data: {
          externalId,
          live: true,
          detail: `imopedia_saveProperty ID_LOCAL=${idLocal} property_id=${saved.propertyId ?? "-"}`,
          message: `${kind === "publish" ? "Oferta a fost publicată" : "Oferta a fost actualizată"} pe Imopedia.ro.${warn.length ? ` ${warn.join(" ")}` : ""}`,
          publicUrl: imopediaPublicUrl(cred.agencyId, idLocal),
          portalResponse: log(),
          ...(gold ? { promotedConfirmed: goldRefused === null } : {}),
        },
      };
    });
  }

  return {
    id: "imopedia",

    async testConnection(ctx: PortalContext): Promise<PortalResult<ConnectionStatusOutcome>> {
      const username = (ctx.externalAccountId ?? "").trim();
      const password = ctx.portalCredential ?? "";
      const agencyId = parseImopediaAgencyId(ctx.settings["agency_id"]);
      if (!username || !password) return fail("CONFIG_ERROR", "Lipsesc utilizatorul sau parola API Imopedia.");
      if (agencyId === null) return fail("CONFIG_ERROR", "ID-ul agenției Imopedia (AGENTIA) trebuie să fie un număr întreg ≥ 1.");
      if (!ctx.allowLiveRequests) {
        return { ok: true, data: { configured: true, live: false, detail: "imopedia_dry_run action=test_connection" } };
      }

      const logs: ImopediaRawLog[] = [];
      let sessionId: string | null = null;
      const tracked: ImopediaClientDeps = { ...deps, onResponse: (e) => { logs.push(e); deps.onResponse?.(e); } };
      const rawLog = () =>
        logs.map((l) => ({ operation: l.operation, http_status: l.status, xml: redactSoapXml(l.xml, [password, sessionId]) }));
      try {
        try {
          sessionId = await imopediaLogin(username, password, tracked);
        } catch (error) {
          if (error instanceof ImopediaSoapError && error.code === "SOAP_FAULT") {
            return fail("AUTH_ERROR", "Utilizator sau parolă Imopedia greșite", { portalResponse: { responses: rawLog() }, detail: "imopedia_login_fault" });
          }
          throw error;
        }
        const result = await imopediaViewAgency(sessionId, agencyId, tracked);
        if (!result.isValid) {
          const msg = result.errors.join("; ") || "Imopedia a respins verificarea agenției (AGENTIA nu aparține acestui cont?).";
          return fail("AUTH_ERROR", msg, { portalResponse: { responses: rawLog() }, detail: "imopedia_view_agency_invalid" });
        }
        const boost = boostSummary(result.raw);
        return {
          ok: true,
          data: {
            configured: true,
            live: true,
            detail: boost ? `Conectat la Imopedia.ro. ${boost}.` : "Conectat la Imopedia.ro.",
            portalResponse: { responses: rawLog() },
          },
        };
      } catch (error) {
        const e = error instanceof ImopediaSoapError ? error : null;
        const code: PortalFail["code"] =
          e?.code === "TIMEOUT" ? "TIMEOUT" : e?.code === "NETWORK_ERROR" ? "NETWORK_ERROR" : "PORTAL_ERROR";
        const message = (e?.message ?? "Testul conexiunii Imopedia a eșuat.").split(password).join("[redacted]");
        return fail(code, message, { httpStatus: e?.httpStatus ?? null, portalResponse: { responses: rawLog() } });
      } finally {
        if (sessionId) await imopediaLogout(sessionId, tracked).catch(() => undefined);
      }
    },

    async getStatus(ctx) {
      const configured =
        Boolean(ctx.externalAccountId && ctx.portalCredential) && parseImopediaAgencyId(ctx.settings["agency_id"]) !== null;
      return { ok: true, data: { configured, live: configured && ctx.allowLiveRequests, detail: "imopedia soap2" } };
    },
    publishListing(ctx, ref) { return upsert(ctx, ref, ref.externalId ? "update" : "publish"); },
    updateListing(ctx, ref) { return upsert(ctx, ref, "update"); },
    async withdrawListing(ctx, ref): Promise<PortalResult<ListingOutcome>> {
      const cred = credentials(ctx);
      if ("ok" in cred) return cred;
      const idLocal = imopediaIdLocal(ref.externalId);
      if (idLocal === null) {
        return { ok: true, data: { externalId: null, live: false, detail: "imopedia_withdraw skipped", message: "Oferta nu a fost publicată pe Imopedia.ro." } };
      }
      if (!ctx.allowLiveRequests) {
        return { ok: true, data: { externalId: String(idLocal), live: false, detail: `imopedia_dry_run op=deleteProperty ID_LOCAL=${idLocal}`, message: "Trimiterile reale către Imopedia.ro sunt oprite." } };
      }
      return withSession(cred.username, cred.password, async ({ run, log }) => {
        const res = await run("deleteProperty", (sid) => buildDeletePropertyEnvelope(sid, cred.agencyId, idLocal));
        // Imopedia răspunde OK și pentru o ofertă deja ștearsă: retragerea e idempotentă.
        if (!res.isValid) return fail("PORTAL_ERROR", imopediaRejectionMessage(res.errors), { portalResponse: log() });
        return { ok: true as const, data: { externalId: String(idLocal), live: true, detail: `imopedia_deleteProperty ID_LOCAL=${idLocal}`, message: "Oferta a fost retrasă de pe Imopedia.ro.", portalResponse: log() } };
      });
    },
    async sync() { return notSupported("sync"); },
  };
}

/* ------------------------------- boost ------------------------------- */

export function readBoostAvailable(raw: Record<string, unknown>): number | null {
  const v = findKey(raw, "boostAvailable");
  const n = v === undefined || v === null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

function findKey(obj: unknown, key: string, depth = 0): unknown {
  if (!obj || typeof obj !== "object" || depth > 4) return undefined;
  const rec = obj as Record<string, unknown>;
  if (key in rec) return rec[key];
  for (const v of Object.values(rec)) {
    const found = findKey(v, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** `viewAgency` → boost-uri disponibile (login → viewAgency → logout). */
export async function imopediaBoostAvailable(ctx: PortalContext, deps: ImopediaClientDeps = {}): Promise<PortalResult<{ available: number | null }>> {
  const username = (ctx.externalAccountId ?? "").trim();
  const password = ctx.portalCredential ?? "";
  const agencyId = parseImopediaAgencyId(ctx.settings["agency_id"]);
  if (!username || !password || agencyId === null) return fail("CONFIG_ERROR", "Conexiunea Imopedia nu este configurată complet.");
  let sid: string | null = null;
  try {
    sid = await imopediaLogin(username, password, deps);
    const r = await imopediaViewAgency(sid, agencyId, deps);
    if (!r.isValid) return fail("PORTAL_ERROR", r.errors.join("; ") || "Imopedia nu a întors datele agenției.");
    return { ok: true, data: { available: readBoostAvailable(r.raw) } };
  } catch (e) {
    return fail("PORTAL_ERROR", e instanceof Error ? e.message.split(password).join("[redacted]") : "Eroare Imopedia.");
  } finally {
    if (sid) await imopediaLogout(sid, deps).catch(() => undefined);
  }
}

/** `saveBoost` cu agencyId=AGENTIA și offerId=ID_LOCAL; refuzul nu se reîncearcă. */
export async function imopediaSaveBoost(ctx: PortalContext, idLocal: number, deps: ImopediaClientDeps = {}): Promise<PortalResult<{ portalResponse: unknown }>> {
  const username = (ctx.externalAccountId ?? "").trim();
  const password = ctx.portalCredential ?? "";
  const agencyId = parseImopediaAgencyId(ctx.settings["agency_id"]);
  if (!username || !password || agencyId === null) return fail("CONFIG_ERROR", "Conexiunea Imopedia nu este configurată complet.");
  const logs: ImopediaRawLog[] = [];
  const tracked: ImopediaClientDeps = { ...deps, onResponse: (e) => { logs.push(e); deps.onResponse?.(e); } };
  let sid: string | null = null;
  const log = () => ({ responses: logs.map((l) => ({ operation: l.operation, http_status: l.status, xml: redactSoapXml(l.xml, [password, sid]) })) });
  try {
    sid = await imopediaLogin(username, password, tracked);
    const { buildOptionsEnvelope } = await import("../imopedia/soap");
    const r = await imopediaCall("saveBoost", buildOptionsEnvelope("saveBoost", sid, "SaveBoostType", [
      { name: "agencyId", type: "xsd:int", value: agencyId },
      { name: "offerId", type: "xsd:int", value: idLocal },
    ]), tracked);
    if (!r.isValid) return fail("PORTAL_ERROR", r.errors.join("; ") || "Imopedia a refuzat boost-ul.", { portalResponse: log() });
    return { ok: true, data: { portalResponse: log() } };
  } catch (e) {
    return fail("PORTAL_ERROR", e instanceof Error ? e.message.split(password).join("[redacted]") : "Eroare Imopedia.", { portalResponse: log() });
  } finally {
    if (sid) await imopediaLogout(sid, tracked).catch(() => undefined);
  }
}

/* ------------------------------- dependențe reale ------------------------------- */

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

const realDeps: ImopediaDeps = {
  async loadProperty(ctx, ref, agencyId) {
    const db = await admin();
    const { data: row } = await db.from("properties").select("*").eq("id", ref.propertyId).eq("organization_id", ctx.organizationId).maybeSingle();
    if (!row) return { ok: false, reasons: ["Proprietatea nu a fost găsită."] };
    let agent: ImopediaAgent | null = null;
    if (row.assigned_to) {
      const { data: p } = await db.from("profiles").select("full_name, email, phone").eq("id", row.assigned_to).maybeSingle();
      if (p) agent = { userId: row.assigned_to, fullName: p.full_name, email: p.email, phone: p.phone };
    }
    const { loadImopediaNomenclature, imopediaMapContext } = await import("../imopedia/context.server");
    const nomenclature = await loadImopediaNomenclature(db);
    return { ok: true, row, agent, mapContext: imopediaMapContext(row, agencyId, nomenclature) };
  },
  async agentLink(organizationId, userId) {
    const db = await admin();
    await db
      .from("portal_agent_links")
      .upsert({ organization_id: organizationId, portal: "imopedia", user_id: userId }, { onConflict: "organization_id,portal,user_id", ignoreDuplicates: true });
    const { data } = await db
      .from("portal_agent_links")
      .select("external_id, sent_fingerprint, external_account_id")
      .eq("organization_id", organizationId)
      .eq("portal", "imopedia")
      .eq("user_id", userId)
      .single();
    if (!data) throw new Error("Maparea agentului Imopedia nu a putut fi creată.");
    return { externalId: Number(data.external_id), fingerprint: data.sent_fingerprint, externalAccountId: data.external_account_id };
  },
  async markAgentSynced(organizationId, userId, error, fingerprint, externalAccountId) {
    const db = await admin();
    const now = new Date().toISOString();
    const { error: saveError } = await db
      .from("portal_agent_links")
      .update(
        error
          ? { last_error: error.slice(0, 500), updated_at: now, sent_fingerprint: null }
          : { external_account_id: externalAccountId, synced_at: now, last_error: null, updated_at: now, sent_fingerprint: fingerprint },
      )
      .eq("organization_id", organizationId)
      .eq("portal", "imopedia")
      .eq("user_id", userId);
    if (saveError) throw new Error(saveError.message);
  },
};

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

realDeps.loadMedia = async (ctx, ref) => {
  const db = await admin();
  const [{ data: images }, { data: org }, { CRM_URL }, { watermarkFromOrg }] = await Promise.all([
    db.from("property_images").select("id, url, storage_path, width, height, updated_at, is_primary, position, include_in_publish, is_confidential")
      .eq("organization_id", ctx.organizationId).eq("property_id", ref.propertyId),
    db.from("organizations").select("watermark_enabled").eq("id", ctx.organizationId).maybeSingle(),
    import("@/lib/host"),
    import("@/lib/watermark"),
  ]);
  const watermark = watermarkFromOrg(org as never).enabled;
  const base = CRM_URL.replace(/\/+$/, "");
  const eligible = ((images ?? []) as any[])
    .filter((i) => i.include_in_publish === true && i.is_confidential !== true)
    .sort((a, b) => (!!a.is_primary === !!b.is_primary ? (a.position ?? 0) - (b.position ?? 0) : a.is_primary ? -1 : 1));
  const out: ImopediaImage[] = [];
  for (const i of eligible) {
    // Identitatea fișierului servit: alt fișier stocat sau alt watermark → alt hash.
    const contentHash = await sha256Hex(JSON.stringify([i.storage_path ?? i.url, i.width, i.height, watermark]));
    out.push({ photoId: String(i.id), contentHash, url: `${base}/api/public/sites/v1/media/${i.id}` });
  }
  // Habitoo nu are încă un câmp de video YouTube pe proprietate.
  return { images: out, videoUrl: null };
};
realDeps.loadSentFiles = async (ctx, ref) => {
  const db = await admin();
  const { data: listing } = await db.from("portal_listings").select("id").eq("organization_id", ctx.organizationId)
    .eq("portal", "imopedia").eq("property_id", ref.propertyId).maybeSingle();
  if (!listing) return { listingId: null, files: [] };
  const { data } = await db.from("imopedia_listing_files").select("file_id, photo_id, order").eq("portal_listing_id", listing.id).order("order");
  return { listingId: listing.id, files: ((data ?? []) as any[]).map((r) => ({ fileId: r.file_id, photoId: r.photo_id, order: r.order })) };
};
realDeps.saveSentFiles = async (listingId, files) => {
  const db = await admin();
  const ids = files.map((f) => f.fileId);
  let del = db.from("imopedia_listing_files").delete().eq("portal_listing_id", listingId);
  if (ids.length) del = del.not("file_id", "in", `(${ids.map((i) => `"${i}"`).join(",")})`);
  await del;
  if (files.length) {
    await db.from("imopedia_listing_files").upsert(
      files.map((f) => ({ portal_listing_id: listingId, file_id: f.fileId, photo_id: f.photoId, order: f.order })),
      { onConflict: "portal_listing_id,file_id" },
    );
  }
};

export const imopediaAdapter = createImopediaAdapter(realDeps);
