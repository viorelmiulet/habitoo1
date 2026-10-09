/**
 * Adaptor OLX.ro (cont prepaid) — Partner API 2.0, cu tokenul OAuth al agenției.
 *   POST /adverts                    publicare (id-ul OLX → portal_listings.external_id)
 *   PUT  /adverts/{id}               actualizare cu payload complet
 *   POST /adverts/{id}/commands      deactivate (is_success:false) / activate
 *   DELETE /adverts/{id}             doar la ștergerea proprietății, după deactivate
 *   GET  /adverts/{id}               starea reală; „Publicat” DOAR la `active`
 * Habitoo nu cumpără niciodată pachete sau promovări (blocat în `olxPartnerRequest`).
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
import { PortalError, toPortalError } from "../errors";
import { OlxHttpError, olxExactHttpText } from "../olx/errors";
import { maskSecrets } from "../operation-logs";
import { mapPropertyToOlx, type OlxLocation, type OlxProperty } from "../olx/mapper";
import { olxCategoryChain, type OlxTaxonomy } from "../olx/taxonomy";

type Method = "GET" | "POST" | "PUT" | "DELETE";
export type OlxRequest = (
  organizationId: string,
  method: Method,
  path: string,
  payload?: unknown,
) => Promise<{ status: number; body: Record<string, unknown> | null }>;

export type OlxLoaded =
  | { ok: true; property: OlxProperty; deleted: boolean; city: string | null; county: string | null }
  | { ok: false; reasons: string[] };

export type OlxDirectDeps = {
  request: OlxRequest;
  loadProperty: (ctx: PortalContext, ref: ListingRef) => Promise<OlxLoaded>;
  loadTaxonomy: () => Promise<OlxTaxonomy>;
  /** Notificare de eroare unică (id stabil per ofertă + eroare). */
  notifyError: (organizationId: string, propertyId: string, message: string) => Promise<void>;
  /** Pornește cronul de urmărire a stării cât timp există anunțuri în moderare. */
  armStatusCron: () => Promise<void>;
};

const NAME = "OLX.ro (cont prepaid)";

function fail(code: PortalFail["code"], message: string, extra: Partial<PortalFail> = {}): PortalFail {
  return { ok: false, code, message, detail: null, httpStatus: null, ...extra };
}

export type OlxStage =
  | "încărcarea anunțului"
  | "încărcarea categoriilor OLX"
  | "găsirea localității"
  | "trimiterea anunțului"
  | "verificarea stării"
  | "activarea din pachet"
  | "retragerea anunțului"
  | "testul conexiunii";

/** Marchează pasul în care a căzut o eroare (fără a o transforma). */
function inStage<T>(stage: OlxStage, run: () => Promise<T>): Promise<T> {
  return run().catch((error: unknown) => {
    if (error && typeof error === "object" && !("olxStage" in error)) {
      try {
        Object.defineProperty(error, "olxStage", { value: stage });
      } catch {
        /* obiect înghețat: pasul rămâne cel exterior */
      }
    }
    throw error;
  });
}

/**
 * Eroarea EXACTĂ, cu pasul: HTTP OLX → status, title, detail, validation[];
 * excepție internă → mesajul real (secrete mascate). Niciodată textul generic.
 */
export function olxFail(error: unknown, fallbackStage: OlxStage): PortalFail {
  const stage = ((error as { olxStage?: OlxStage } | null)?.olxStage ?? fallbackStage) as OlxStage;
  if (error instanceof OlxHttpError) {
    return fail(error.code, `${NAME} – ${stage}: ${olxExactHttpText(error.status, error.body)}`.slice(0, 1000), {
      detail: `olx_http_${error.status}`,
      httpStatus: error.status,
      portalResponse: error.body ?? null,
    });
  }
  const raw =
    error instanceof Error
      ? error.message || error.name
      : typeof error === "string"
        ? error
        : (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return String(error);
            }
          })();
  const text = String(maskSecrets(raw ?? "eroare necunoscută")).slice(0, 800);
  const code = error instanceof PortalError ? error.code : "PORTAL_ERROR";
  const detail =
    error instanceof PortalError && error.detail ? error.detail : error instanceof Error ? `olx_internal:${error.name}` : "olx_internal";
  return fail(code, `${NAME} – ${stage}: ${text}`, { detail });
}

const data = (body: Record<string, unknown> | null) =>
  ((body?.["data"] ?? body ?? {}) as Record<string, unknown>);

const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/^(municipiul|orasul|oras|comuna)\s+/, "").trim();

/** `city_id`/`district_id` din coordonate; fallback pe numele localității (și județului). */
export async function resolveOlxLocation(
  request: OlxRequest,
  organizationId: string,
  p: { lat: number | null; lng: number | null; city: string | null; county: string | null },
): Promise<OlxLocation | null> {
  if (p.lat !== null && p.lng !== null) {
    const res = await request(organizationId, "GET", `/locations?latitude=${p.lat}&longitude=${p.lng}`);
    const raw = res.body?.["data"];
    const first = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined;
    const city = (first?.["city"] ?? {}) as Record<string, unknown>;
    const district = (first?.["district"] ?? {}) as Record<string, unknown>;
    const cityId = Number(city["id"] ?? first?.["city_id"]);
    const districtId = Number(district["id"] ?? first?.["district_id"]);
    if (Number.isFinite(cityId) && cityId > 0) {
      return { city_id: cityId, ...(Number.isFinite(districtId) && districtId > 0 ? { district_id: districtId } : {}) };
    }
  }
  if (!p.city) return null;
  const want = norm(p.city.replace(/\s+sector(ul)?\s*\d+$/i, ""));
  let regionId: number | null = null;
  if (p.county) {
    const regions = (await request(organizationId, "GET", "/regions")).body?.["data"];
    const hit = (Array.isArray(regions) ? regions : []).find(
      (r) => norm(String((r as Record<string, unknown>)["name"] ?? "")) === norm(p.county!),
    ) as Record<string, unknown> | undefined;
    regionId = hit ? Number(hit["id"]) : null;
  }
  for (let page = 0; page < 20; page += 1) {
    const list = (await request(organizationId, "GET", `/cities?offset=${page * 1000}&limit=1000`)).body?.["data"];
    const items = (Array.isArray(list) ? list : []) as Record<string, unknown>[];
    const hit = items.find(
      (c) => norm(String(c["name"] ?? "")) === want && (regionId === null || Number(c["region_id"]) === regionId),
    );
    if (hit) return { city_id: Number(hit["id"]) };
    if (items.length < 1000) break;
  }
  return null;
}

/** Anunțul deja creat pe OLX pentru referința HB (evită duplicatele). */
export async function findOlxAdvertByExternalId(
  request: OlxRequest,
  organizationId: string,
  externalId: string,
): Promise<string | null> {
  const res = await request(organizationId, "GET", `/adverts?external_id=${encodeURIComponent(externalId)}`);
  const raw = res.body?.["data"];
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Record<string, unknown>[];
  // OLX poate ignora filtrul: potrivim strict după external_id; ignorăm anunțurile șterse de utilizator.
  const hit = list.find(
    (a) => a && String(a["external_id"] ?? "") === externalId && a["id"] != null && !["removed_by_user", "deleted"].includes(String(a["status"] ?? "")),
  );
  return hit ? String(hit["id"]) : null;
}

export const olxNeedsPacketMessage = (category: string) =>
  `Anunțul a fost trimis pe OLX, dar nu e activ: contul OLX nu are pachet pentru categoria ${category}. Cumpără un pachet din contul OLX, iar Habitoo îl activează automat.`;

export type OlxAdvertCheck = {
  portalStatus: "pending" | "published" | "error" | "needs_packet";
  message: string;
  url: string | null;
};

/** Starea reală a anunțului; la `limited`/`unpaid` activează doar din pachetul existent. */
export async function checkOlxAdvert(
  request: OlxRequest,
  organizationId: string,
  advertId: string,
  taxonomy: OlxTaxonomy | null,
): Promise<OlxAdvertCheck> {
  const advert = data((await request(organizationId, "GET", `/adverts/${advertId}`)).body);
  const status = String(advert["status"] ?? "").toLowerCase();
  const url = typeof advert["url"] === "string" ? (advert["url"] as string) : null;
  const categoryId = Number(advert["category_id"]);
  if (status === "active") return { portalStatus: "published", message: "Publicat pe OLX.", url };
  if (status === "new") return { portalStatus: "pending", message: "În moderare OLX", url: null };
  if (status === "limited" || status === "unpaid") {
    const chain = taxonomy && Number.isFinite(categoryId) ? olxCategoryChain(taxonomy, categoryId) : [categoryId];
    const packets = (await request(organizationId, "GET", "/users/me/packets?availability=active")).body?.["data"];
    const usable = (Array.isArray(packets) ? packets : []).some((raw) => {
      const p = (raw ?? {}) as Record<string, unknown>;
      const left = Number(p["left"]);
      const cats = [p["category_id"], ...(Array.isArray(p["categories"]) ? p["categories"] : [])]
        .map((c) => Number(typeof c === "object" && c ? (c as Record<string, unknown>)["id"] : c))
        .filter((n) => Number.isFinite(n));
      return left > 0 && cats.some((c) => chain.includes(c));
    });
    if (usable) {
      await inStage("activarea din pachet", () =>
        request(organizationId, "POST", `/adverts/${advertId}/commands`, { command: "activate" }),
      );
      return { portalStatus: "pending", message: "În moderare OLX", url: null };
    }
    const name = taxonomy?.[String(categoryId)]?.name ?? (Number.isFinite(categoryId) ? String(categoryId) : "anunțului");
    return { portalStatus: "needs_packet", message: olxNeedsPacketMessage(name), url };
  }
  if (["moderated", "blocked", "disabled", "removed_by_moderator"].includes(status)) {
    let reason = "";
    try {
      const r = data((await request(organizationId, "GET", `/adverts/${advertId}/moderation-reason`)).body);
      reason = [r["reason"], r["description"], r["detail"]].filter((x) => typeof x === "string" && x).join(" — ");
    } catch {
      reason = "";
    }
    return {
      portalStatus: "error",
      message: `OLX a respins anunțul (${status})${reason ? `: ${reason}` : "."}`.slice(0, 500),
      url: null,
    };
  }
  return { portalStatus: "pending", message: `Stare OLX: ${status || "necunoscută"}`, url: null };
}

export function createOlxDirectAdapter(deps: OlxDirectDeps): PortalAdapter {
  async function build(ctx: PortalContext, ref: ListingRef) {
    const loaded = await inStage("încărcarea anunțului", () => deps.loadProperty(ctx, ref));
    if (!loaded.ok) return { fail: fail("VALIDATION_ERROR", `Anunțul nu poate fi trimis la OLX: ${loaded.reasons.join(", ")}.`) };
    const taxonomy = await inStage("încărcarea categoriilor OLX", () => deps.loadTaxonomy());
    // Validare locală completă înainte de orice apel (locația o rezolvăm abia după).
    const preview = mapPropertyToOlx(loaded.property, taxonomy, { city_id: 1 });
    if (!preview.ok) return { fail: fail("VALIDATION_ERROR", `Anunțul nu poate fi trimis la OLX: ${preview.reasons.join(", ")}.`) };
    const location = ctx.allowLiveRequests
      ? await inStage("găsirea localității", () =>
          resolveOlxLocation(deps.request, ctx.organizationId, {
            lat: loaded.property.lat,
            lng: loaded.property.lng,
            city: loaded.city,
            county: loaded.county,
          }),
        )
      : { city_id: 0 };
    const mapped = mapPropertyToOlx(loaded.property, taxonomy, location);
    if (!mapped.ok) return { fail: fail("VALIDATION_ERROR", `Anunțul nu poate fi trimis la OLX: ${mapped.reasons.join(", ")}.`) };
    return { mapped, taxonomy, loaded };
  }

  async function finish(
    ctx: PortalContext,
    ref: ListingRef,
    advertId: string,
    taxonomy: OlxTaxonomy,
    verb: string,
    httpStatus: number,
    body: unknown,
  ): Promise<PortalResult<ListingOutcome>> {
    const check = await inStage("verificarea stării", () => checkOlxAdvert(deps.request, ctx.organizationId, advertId, taxonomy));
    if (check.portalStatus === "pending" || check.portalStatus === "needs_packet") await deps.armStatusCron();
    // O singură notificare: id stabil per ofertă + mesaj.
    if (check.portalStatus === "error" || check.portalStatus === "needs_packet") await deps.notifyError(ctx.organizationId, ref.propertyId, check.message);
    return {
      ok: true,
      data: {
        externalId: advertId,
        live: true,
        detail: `olx_${verb} id=${advertId}`,
        message: check.message,
        portalStatus: check.portalStatus === "published" ? (verb === "put" || verb === "put_existing" ? "updated" : "published") : check.portalStatus,
        publicUrl: check.url,
        httpStatus,
        portalResponse: body,
      },
    };
  }

  async function command(ctx: PortalContext, id: string, payload: Record<string, unknown>) {
    return deps.request(ctx.organizationId, "POST", `/adverts/${id}/commands`, payload);
  }

  async function upsert(ctx: PortalContext, ref: ListingRef, mode: "publish" | "update"): Promise<PortalResult<ListingOutcome>> {
    try {
      const built = await build(ctx, ref);
      if ("fail" in built) return built.fail!;
      const { mapped, taxonomy } = built;
      if (!ctx.allowLiveRequests) {
        return { ok: true, data: { externalId: ref.externalId, live: false, detail: "olx_dry_run", message: "Trimiterile reale către OLX sunt oprite: anunțul a fost doar validat local." } };
      }
      if (ref.externalId) {
        // Republicare: întâi activate (anunț dezactivat anterior), apoi PUT complet.
        if (mode === "publish") {
          try {
            await inStage("trimiterea anunțului", () => command(ctx, ref.externalId!, { command: "activate" }));
          } catch (error) {
            // Anunț nedezactivat de noi (ex. `limited`): OLX refuză `activate`; continuăm cu PUT + verificarea stării.
            const e = toPortalError(error);
            const refused = e.code === "VALIDATION_ERROR" || (error instanceof OlxHttpError && error.status >= 400 && error.status < 500);
            if (!refused) throw error;
          }
        }
        const res = await inStage("trimiterea anunțului", () =>
          deps.request(ctx.organizationId, "PUT", `/adverts/${ref.externalId}`, mapped.payload),
        );
        return finish(ctx, ref, ref.externalId, taxonomy, mode === "publish" ? "republish" : "put", res.status, res.body);
      }
      const reference = mapped.payload.external_id;
      const existing = await inStage("trimiterea anunțului", () =>
        findOlxAdvertByExternalId(deps.request, ctx.organizationId, reference),
      );
      if (existing) {
        const res = await inStage("trimiterea anunțului", () =>
          deps.request(ctx.organizationId, "PUT", `/adverts/${existing}`, mapped.payload),
        );
        return finish(ctx, ref, existing, taxonomy, "put_existing", res.status, res.body);
      }
      let res: { status: number; body: Record<string, unknown> | null };
      try {
        res = await inStage("trimiterea anunțului", () => deps.request(ctx.organizationId, "POST", "/adverts", mapped.payload));
      } catch (error) {
        const e = toPortalError(error);
        const uncertain =
          e.code === "TIMEOUT" ||
          e.code === "NETWORK_ERROR" ||
          (error instanceof OlxHttpError && error.status >= 500);
        if (!uncertain) throw error;
        // OLX poate fi creat anunțul chiar dacă răspunsul nu a ajuns.
        const created = await findOlxAdvertByExternalId(deps.request, ctx.organizationId, reference).catch(() => null);
        if (!created) throw error;
        return finish(ctx, ref, created, taxonomy, "post_recovered", 200, null);
      }
      const id = data(res.body)["id"];
      if (id === undefined || id === null || String(id) === "") {
        return fail("PORTAL_ERROR", `${NAME} – trimiterea anunțului: OLX nu a întors ID-ul anunțului.`, { detail: "olx_missing_id", httpStatus: res.status, portalResponse: res.body });
      }
      return finish(ctx, ref, String(id), taxonomy, "post", res.status, res.body);
    } catch (error) {
      const f = olxFail(error, "trimiterea anunțului");
      await deps.notifyError(ctx.organizationId, ref.propertyId, f.message).catch(() => undefined);
      return f;
    }
  }

  return {
    id: "olx_direct",

    async testConnection(ctx): Promise<PortalResult<ConnectionStatusOutcome>> {
      try {
        await deps.request(ctx.organizationId, "GET", "/users/me");
        return { ok: true, data: { configured: true, live: true, detail: "olx_users_me ok" } };
      } catch (error) {
        return olxFail(error, "testul conexiunii");
      }
    },

    async getStatus(): Promise<PortalResult<ConnectionStatusOutcome>> {
      return { ok: true, data: { configured: true, live: true, detail: "Cont OLX conectat prin OAuth." } };
    },

    publishListing(ctx, ref) {
      return upsert(ctx, ref, "publish");
    },

    updateListing(ctx, ref) {
      return upsert(ctx, ref, "update");
    },

    async withdrawListing(ctx, ref): Promise<PortalResult<ListingOutcome>> {
      if (!ref.externalId) {
        return { ok: true, data: { externalId: null, live: false, detail: "olx_withdraw skipped", message: "Anunțul nu a fost publicat pe OLX." } };
      }
      if (!ctx.allowLiveRequests) {
        return { ok: true, data: { externalId: ref.externalId, live: false, detail: "olx_dry_run deactivate", message: "Trimiterile reale către OLX sunt oprite." } };
      }
      try {
        const loaded = await deps.loadProperty(ctx, ref);
        const id = ref.externalId;
        // Doar un anunț `active` acceptă `deactivate`; celelalte nu sunt publice.
        let state: string | null = null;
        try {
          const current = await inStage("retragerea anunțului", () => deps.request(ctx.organizationId, "GET", `/adverts/${id}`));
          state = String(data(current.body)["status"] ?? "").toLowerCase() || null;
        } catch (error) {
          if (error instanceof OlxHttpError && error.status === 404) {
            return { ok: true, data: { externalId: id, live: true, detail: `olx_withdraw id=${id} not_found`, message: "Anunțul nu mai există în contul OLX; marcat retras." } };
          }
          throw error;
        }
        let res: { status: number; body: Record<string, unknown> | null } = { status: 200, body: null };
        let detail = `olx_withdraw id=${id} state=${state ?? "necunoscută"}`;
        if (state === "active") {
          res = await command(ctx, id, { command: "deactivate", is_success: false });
          detail = `olx_deactivate id=${id}`;
        }
        if (loaded.ok && loaded.deleted) {
          await deps.request(ctx.organizationId, "DELETE", `/adverts/${id}`);
          detail += " deleted";
        }
        return {
          ok: true,
          data: {
            externalId: ref.externalId,
            live: true,
            detail,
            message:
              loaded.ok && loaded.deleted
                ? "Anunțul a fost șters de pe OLX."
                : state === "active"
                  ? "Anunțul a fost dezactivat pe OLX."
                  : "Anunțul nu era public pe OLX; marcat retras.",
            httpStatus: res.status,
            portalResponse: res.body,
          },
        };
      } catch (error) {
        return olxFail(error, "retragerea anunțului");
      }
    },

    async sync(): Promise<PortalResult<{ processed: number; failed: number }>> {
      return { ok: true, data: { processed: 0, failed: 0 } };
    },
  };
}

/* ------------------------------- dependențe reale ------------------------------- */

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

const realRequest: OlxRequest = async (org, method, path, payload) => {
  const { olxPartnerRequest } = await import("../olx/oauth.server");
  return olxPartnerRequest(org, method, path, payload);
};

export async function loadOlxProperty(ctx: PortalContext, ref: ListingRef): Promise<OlxLoaded> {
  const db = await admin();
  const { data: row } = await db
    .from("properties")
    .select("*")
    .eq("id", ref.propertyId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (!row) return { ok: false, reasons: ["proprietatea nu a fost găsită"] };
  const r = row as Record<string, unknown>;
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const { CRM_URL } = await import("@/lib/host");
  const { data: images } = await db
    .from("property_images")
    .select("id, include_in_publish, is_confidential, position, created_at")
    .eq("organization_id", ctx.organizationId)
    .eq("property_id", ref.propertyId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  const photoUrls = ((images ?? []) as Record<string, unknown>[])
    .filter((i) => i["include_in_publish"] !== false && i["is_confidential"] !== true)
    .map((i) => `${CRM_URL.replace(/\/+$/, "")}/api/public/sites/v1/media/${String(i["id"])}`);
  let agentName: string | null = null;
  let agentPhone: string | null = null;
  const assignedTo = str(r["assigned_to"]);
  if (assignedTo) {
    const { data: p } = await db.from("profiles").select("full_name, phone").eq("id", assignedTo).maybeSingle();
    agentName = p?.full_name ?? null;
    agentPhone = p?.phone ?? null;
  }
  return {
    ok: true,
    deleted: r["deleted_at"] != null,
    city: str(r["city"]),
    county: str(r["county"]),
    property: {
      reference: str(r["reference"]),
      propertyType: str(r["property_type"]),
      title: str(r["title"]),
      description: str(r["description"]),
      forSale: r["for_sale"] === true,
      forRent: r["for_rent"] === true,
      salePrice: num(r["sale_price"]),
      saleCurrency: str(r["sale_currency"]),
      rentPrice: num(r["rent_price"]),
      rentCurrency: str(r["rent_currency"]),
      price: num(r["price"]),
      currency: str(r["currency"]),
      negotiable: typeof r["negotiable"] === "boolean" ? (r["negotiable"] as boolean) : null,
      rooms: num(r["rooms"]),
      usableSurface: num(r["usable_surface"]) ?? num(r["surface"]),
      landSurface: num(r["land_surface"]),
      lat: num(r["lat"]),
      lng: num(r["lng"]),
      photoUrls,
      agentName,
      agentPhone,
    },
  };
}

export async function notifyOlxError(organizationId: string, propertyId: string, message: string) {
  const { notifyPortalFailure } = await import("../failure-notification.server");
  await notifyPortalFailure(await admin(), { organizationId, propertyId, portalKey: "olx_direct", portalName: NAME, error: message });
}

export const realOlxDirectDeps: OlxDirectDeps = {
  request: realRequest,
  loadProperty: loadOlxProperty,
  async loadTaxonomy() {
    const { loadOlxTaxonomy } = await import("../olx/taxonomy.server");
    return loadOlxTaxonomy();
  },
  notifyError: notifyOlxError,
  async armStatusCron() {
    const db = await admin();
    await db.rpc("olx_direct_status_arm" as never);
  },
};

export const olxDirectAdapter: PortalAdapter = createOlxDirectAdapter(realOlxDirectDeps);

/** Cron: urmărește anunțurile OLX în moderare și pe cele care așteaptă un pachet. */
export async function pollOlxPendingListings(
  filter: { organizationId?: string; propertyId?: string } = {},
): Promise<{ checked: number; published: number; failed: number; needsPacket: number }> {
  const db = await admin();
  let q = db
    .from("portal_listings")
    .select("id, organization_id, property_id, external_id, status, last_error")
    .eq("portal", "olx_direct")
    .in("status", ["pending", "needs_packet"])
    .not("external_id", "is", null)
    .limit(50);
  if (filter.organizationId) q = q.eq("organization_id", filter.organizationId);
  if (filter.propertyId) q = q.eq("property_id", filter.propertyId);
  const { data: rows } = await q;
  const { loadOlxTaxonomy } = await import("../olx/taxonomy.server");
  const taxonomy = await loadOlxTaxonomy().catch(() => null);
  const stats = { checked: 0, published: 0, failed: 0, needsPacket: 0 };
  for (const row of rows ?? []) {
    stats.checked += 1;
    let check: OlxAdvertCheck;
    try {
      check = await checkOlxAdvert(realRequest, row.organization_id, row.external_id!, taxonomy);
    } catch {
      continue;
    }
    const now = new Date().toISOString();
    const status = check.portalStatus;
    await db
      .from("portal_listings")
      .update({
        status,
        last_sync_at: now,
        last_error: status === "error" || status === "needs_packet" ? check.message : null,
        ...(check.url ? { public_url: check.url } : {}),
        ...(status === "published" ? { published_at: now } : {}),
      } as never)
      .eq("id", row.id);
    if (status === "published") stats.published += 1;
    if (status === "needs_packet") stats.needsPacket += 1;
    if (status === "error") stats.failed += 1;
    // Notificare doar la schimbarea stării (și oricum deduplicată după mesaj).
    const changed = row.status !== status || row.last_error !== check.message;
    if ((status === "error" || status === "needs_packet") && changed) {
      await notifyOlxError(row.organization_id, row.property_id, check.message).catch(() => undefined);
    }
  }
  if ((rows ?? []).length) await db.rpc("olx_direct_status_arm" as never).then(() => undefined, () => undefined);
  return stats;
}
