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

function asFail(error: unknown): PortalFail {
  const e = toPortalError(error);
  return fail(e.code, `${NAME}: ${e.message}`, { detail: e.detail ?? null });
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

export type OlxAdvertCheck = {
  portalStatus: "pending" | "published" | "error";
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
      await request(organizationId, "POST", `/adverts/${advertId}/commands`, { command: "activate" });
      return { portalStatus: "pending", message: "În moderare OLX", url: null };
    }
    const name = taxonomy?.[String(categoryId)]?.name ?? "anunțului";
    return {
      portalStatus: "error",
      message: `Contul OLX nu are pachet activ pentru categoria ${name}. Cumpără un pachet din contul OLX.`,
      url: null,
    };
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
    const loaded = await deps.loadProperty(ctx, ref);
    if (!loaded.ok) return { fail: fail("VALIDATION_ERROR", `Anunțul nu poate fi trimis la OLX: ${loaded.reasons.join(", ")}.`) };
    const taxonomy = await deps.loadTaxonomy();
    // Validare locală completă înainte de orice apel (locația o rezolvăm abia după).
    const preview = mapPropertyToOlx(loaded.property, taxonomy, { city_id: 1 });
    if (!preview.ok) return { fail: fail("VALIDATION_ERROR", `Anunțul nu poate fi trimis la OLX: ${preview.reasons.join(", ")}.`) };
    const location = ctx.allowLiveRequests
      ? await resolveOlxLocation(deps.request, ctx.organizationId, {
          lat: loaded.property.lat,
          lng: loaded.property.lng,
          city: loaded.city,
          county: loaded.county,
        })
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
    const check = await checkOlxAdvert(deps.request, ctx.organizationId, advertId, taxonomy);
    if (check.portalStatus === "pending") await deps.armStatusCron();
    if (check.portalStatus === "error") await deps.notifyError(ctx.organizationId, ref.propertyId, check.message);
    return {
      ok: true,
      data: {
        externalId: advertId,
        live: true,
        detail: `olx_${verb} id=${advertId}`,
        message: check.message,
        portalStatus: check.portalStatus === "published" ? (verb === "put" ? "updated" : "published") : check.portalStatus,
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
            await command(ctx, ref.externalId, { command: "activate" });
          } catch (error) {
            const e = toPortalError(error);
            if (e.code !== "VALIDATION_ERROR") throw error;
          }
        }
        const res = await deps.request(ctx.organizationId, "PUT", `/adverts/${ref.externalId}`, mapped.payload);
        return finish(ctx, ref, ref.externalId, taxonomy, mode === "publish" ? "republish" : "put", res.status, res.body);
      }
      const res = await deps.request(ctx.organizationId, "POST", "/adverts", mapped.payload);
      const id = data(res.body)["id"];
      if (id === undefined || id === null || String(id) === "") {
        return fail("PORTAL_ERROR", `${NAME}: OLX nu a întors ID-ul anunțului.`, { httpStatus: res.status, portalResponse: res.body });
      }
      return finish(ctx, ref, String(id), taxonomy, "post", res.status, res.body);
    } catch (error) {
      const f = asFail(error);
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
        return asFail(error);
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
        const res = await command(ctx, ref.externalId, { command: "deactivate", is_success: false });
        let detail = `olx_deactivate id=${ref.externalId}`;
        if (loaded.ok && loaded.deleted) {
          await deps.request(ctx.organizationId, "DELETE", `/adverts/${ref.externalId}`);
          detail += " deleted";
        }
        return {
          ok: true,
          data: {
            externalId: ref.externalId,
            live: true,
            detail,
            message: loaded.ok && loaded.deleted ? "Anunțul a fost șters de pe OLX." : "Anunțul a fost dezactivat pe OLX.",
            httpStatus: res.status,
            portalResponse: res.body,
          },
        };
      } catch (error) {
        return asFail(error);
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

/** Cron: urmărește anunțurile OLX aflate în moderare până la o stare finală. */
export async function pollOlxPendingListings(): Promise<{ checked: number; published: number; failed: number }> {
  const db = await admin();
  const { data: rows } = await db
    .from("portal_listings")
    .select("id, organization_id, property_id, external_id")
    .eq("portal", "olx_direct")
    .eq("status", "pending")
    .not("external_id", "is", null)
    .limit(50);
  const { loadOlxTaxonomy } = await import("../olx/taxonomy.server");
  const taxonomy = await loadOlxTaxonomy().catch(() => null);
  const stats = { checked: 0, published: 0, failed: 0 };
  for (const row of rows ?? []) {
    stats.checked += 1;
    let check: OlxAdvertCheck;
    try {
      check = await checkOlxAdvert(realRequest, row.organization_id, row.external_id!, taxonomy);
    } catch (error) {
      if (error instanceof PortalError && error.code === "AUTH_ERROR") continue;
      continue;
    }
    if (check.portalStatus === "pending") continue;
    const now = new Date().toISOString();
    await db
      .from("portal_listings")
      .update({
        status: check.portalStatus,
        last_sync_at: now,
        last_error: check.portalStatus === "error" ? check.message : null,
        ...(check.url ? { public_url: check.url } : {}),
      } as never)
      .eq("id", row.id);
    if (check.portalStatus === "published") stats.published += 1;
    else {
      stats.failed += 1;
      await notifyOlxError(row.organization_id, row.property_id, check.message).catch(() => undefined);
    }
  }
  return stats;
}
