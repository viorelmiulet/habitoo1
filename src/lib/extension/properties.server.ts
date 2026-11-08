import jpeg from "jpeg-js";
import { decode as decodePng } from "fast-png";
import type { ExtPropertyStore } from "./properties";
import { validateImageFile } from "./properties";
import { normalizeRoName, prettyUatName, titleCaseRo } from "@/lib/ro-normalize";
import { filterSuggestions, toSuggestions } from "@/lib/locality-suggestions";

const MEDIA_BUCKET = "property-media";

/** Aceeași compresie ca încărcarea manuală (latura maximă 1920 px, JPEG 0,82); WebP rămâne neschimbat. */
export function compressLikeManual(bytes: Uint8Array, type: string): { bytes: Uint8Array; width: number; height: number } | null {
  let raster: { data: ArrayLike<number>; width: number; height: number };
  if (type === "image/png") {
    const png = decodePng(bytes); const ch = png.channels; const scale = png.depth === 16 ? 257 : 1;
    const data = new Uint8Array(png.width * png.height * 4);
    for (let i = 0; i < png.width * png.height; i++) {
      const s = i * ch; const v = (o: number) => Math.round(Number(png.data[s + o] ?? 0) / scale);
      const a = ch === 2 ? v(1) : ch === 4 ? v(3) : 255;
      for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(v(ch < 3 ? 0 : c) * a / 255 + 255 * (1 - a / 255));
      data[i * 4 + 3] = 255;
    }
    raster = { data, width: png.width, height: png.height };
  } else if (type === "image/jpeg") {
    raster = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 160 });
  } else return null;
  const r = Math.min(1, 1920 / Math.max(raster.width, raster.height));
  const width = Math.max(1, Math.round(raster.width * r)), height = Math.max(1, Math.round(raster.height * r));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const s = (Math.min(raster.height - 1, Math.floor(y / r)) * raster.width + Math.min(raster.width - 1, Math.floor(x / r))) * 4;
    const d = (y * width + x) * 4;
    for (let c = 0; c < 4; c++) data[d + c] = raster.data[s + c] ?? 255;
  }
  return { bytes: new Uint8Array(jpeg.encode({ data, width, height }, 82).data), width, height };
}

export async function extensionPropertyStore(): Promise<ExtPropertyStore> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  return {
    createProperty: async (a) => {
      const { data, error } = await db.rpc("extension_create_property", {
        _user: a.user, _org: a.org, _key: a.key, _hash: a.hash, _p: a.property as never, _owner: a.owner as never, _source: a.source as never,
      });
      if (error) throw error;
      return data as never;
    },
    findSource: async (org, normalized) => {
      const { data, error } = await db.from("property_capture_sources").select("property_id").eq("organization_id", org).eq("normalized_url", normalized).order("created_at").limit(20);
      if (error) throw error;
      const ids = (data ?? []).map((r) => r.property_id);
      if (!ids.length) return null;
      const { data: props } = await db.from("properties").select("id,title,assigned_to,created_at").in("id", ids).is("deleted_at", null).order("created_at").limit(1);
      const p = props?.[0];
      if (!p) return null;
      const { data: agent } = p.assigned_to ? await db.from("profiles").select("full_name").eq("id", p.assigned_to).maybeSingle() : { data: null };
      return { id: p.id, title: p.title, agent: agent?.full_name ?? null };
    },
    propertyAccess: async (propertyId, user, org) => {
      const { data: p } = await db.from("properties").select("id,assigned_to,created_by").eq("id", propertyId).eq("organization_id", org).is("deleted_at", null).maybeSingle();
      if (!p) return null;
      if (p.assigned_to !== user && p.created_by !== user) {
        const { data: roles } = await db.from("user_roles").select("role,organization_id").eq("user_id", user);
        if (!(roles ?? []).some((r) => r.role === "agency_admin" && (r.organization_id === org || r.organization_id == null))) return null;
      }
      const { count } = await db.from("property_images").select("id", { count: "exact", head: true }).eq("property_id", propertyId);
      return { imageCount: count ?? 0 };
    },
    signUploads: async (paths) => {
      const out = [];
      for (const path of paths) {
        const { data, error } = await db.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
        if (error || !data) throw error ?? new Error("upload_url");
        out.push({ path, upload_url: data.signedUrl, token: data.token });
      }
      return out;
    },
    completeImages: async ({ propertyId, org, user, paths }) => {
      const rejected: { path: string; reason: string }[] = [];
      const { data: last } = await db.from("property_images").select("position").eq("property_id", propertyId).order("position", { ascending: false }).limit(1);
      let position = (last?.[0]?.position ?? -1) + 1;
      let primary = position === 0;
      let added = 0;
      for (const path of paths) {
        const { data: blob, error } = await db.storage.from(MEDIA_BUCKET).download(path);
        if (error || !blob) { rejected.push({ path, reason: "Fotografia nu a fost încărcată." }); continue; }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const check = validateImageFile(bytes);
        if ("error" in check) { await db.storage.from(MEDIA_BUCKET).remove([path]); rejected.push({ path, reason: check.error }); continue; }
        let finalPath = path, width: number | null = null, height: number | null = null;
        try {
          const c = compressLikeManual(bytes, check.type);
          if (c) {
            finalPath = path.replace(/\.(png|jpg)$/, ".jpg");
            const up = await db.storage.from(MEDIA_BUCKET).upload(finalPath, c.bytes, { contentType: "image/jpeg", upsert: true });
            if (up.error) throw up.error;
            if (finalPath !== path) await db.storage.from(MEDIA_BUCKET).remove([path]);
            width = c.width; height = c.height;
          }
        } catch { await db.storage.from(MEDIA_BUCKET).remove([path]); rejected.push({ path, reason: "Fotografia nu a putut fi procesată." }); continue; }
        const { error: insErr } = await db.from("property_images").insert({
          organization_id: org, property_id: propertyId, url: finalPath, storage_path: finalPath, position, width, height, is_primary: primary, created_by: user,
        });
        if (insErr) { rejected.push({ path, reason: "Fotografia nu a putut fi salvată." }); continue; }
        position += 1; added += 1; primary = false;
      }
      return { added, rejected };
    },
    localities: async (q) => {
      const term = normalizeRoName(q);
      const { data, error } = await db.from("ro_localities")
        .select("siruta_code,name,type,uat_siruta_code,postal_code,county_siruta_code,ro_uats!inner(name,type)")
        .eq("active", true).ilike("normalized_name", `%${term.replace(/[%_]/g, "")}%`).limit(200);
      if (error) throw error;
      const counties = new Map<number, string>();
      const codes = [...new Set((data ?? []).map((r) => r.county_siruta_code))];
      if (codes.length) {
        const { data: cs } = await db.from("ro_counties").select("siruta_code,name").in("siruta_code", codes);
        for (const c of cs ?? []) counties.set(c.siruta_code, titleCaseRo(prettyUatName(c.name)));
      }
      const byCode = new Map((data ?? []).map((r) => [r.siruta_code, r]));
      const rows = (data ?? []).map((r) => {
        const raw = (r as unknown as { ro_uats: { name: string; type: string } | { name: string; type: string }[] }).ro_uats;
        const uat = Array.isArray(raw) ? raw[0] : raw;
        return { sirutaCode: r.siruta_code, rawName: r.name, type: r.type, uatSirutaCode: r.uat_siruta_code, uatName: uat?.name ?? "", uatType: uat?.type ?? null, postalCode: r.postal_code };
      });
      return filterSuggestions(toSuggestions(rows), q, 20).map((s) => {
        const county_siruta_code = byCode.get(s.sirutaCode)!.county_siruta_code;
        return { siruta_code: s.sirutaCode, name: s.name, type: s.type, uat_siruta_code: s.uatSirutaCode, uat_name: s.uatName, county_siruta_code, county: counties.get(county_siruta_code) ?? null, postal_code: s.postalCode };
      });
    },
  };
}
