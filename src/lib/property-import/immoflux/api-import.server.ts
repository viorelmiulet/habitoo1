/** Worker pentru preluarea IMMOFLUX: rulează în aceeași pornire (nonce) și programare pe minut ca alocarea la ansambluri. */
import { finishMessage, normalizePhone, runImportPage, runRepairPage, type ImportDeps, type ImportJob, type RepairDeps } from "./api-import";
import { IMMOFLUX_V2_MARKER, ImmofluxHttpError, immofluxGet, immofluxHostOf, immofluxV2Url, maskImmofluxToken, subdomainFromHost } from "./connection";

const LEASE_MS = 90_000;
const BUDGET_MS = 20_000;
const MIN_GAP_MS = 1_100;
/** Toate statusurile (1–5); fără filtru, feedul v2 poate întoarce doar anunțurile active. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

export function productionDeps(admin: Admin, fetchImpl: typeof fetch, deadline: () => boolean): ImportDeps {
  const configs = new Map<string, { sub: string; token: string }>();
  const tokens = new Set<string>();
  const phoneIndex = new Map<string, Map<string, string>>();
  const config = async (org: string) => {
    const hit = configs.get(org);
    if (hit) return hit;
    const { unlockImmofluxKey } = await import("./connection.server");
    const { data, error } = await admin.from("immoflux_connections").select("host,slug,api_key_encrypted,enabled").eq("organization_id", org).maybeSingle();
    if (error || !data) throw new Error("Configurarea IMMOFLUX a agenției lipsește.");
    const sub = subdomainFromHost(data.host);
    if (data.slug !== IMMOFLUX_V2_MARKER || !sub) throw new Error("Configurarea IMMOFLUX trebuie salvată din nou cu subdomeniul și tokenul API v2.");
    const c = { sub, token: unlockImmofluxKey(data.api_key_encrypted) };
    tokens.add(c.token);
    configs.set(org, c);
    return c;
  };
  let lastCall = 0;
  const get = async (org: string, path: string, params: Record<string, string | number> = {}) => {
    const c = await config(org);
    // Maximum 60 cereri/minut la IMMOFLUX: cel puțin 1,1 s între cereri în aceeași rulare.
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((res) => setTimeout(res, wait));
    lastCall = Date.now();
    try { return await immofluxGet(immofluxV2Url(c.sub, path, c.token, params), c.token, fetchImpl); }
    catch (e) {
      const detail = e instanceof ImmofluxHttpError && e.detail ? ` Răspuns IMMOFLUX: ${e.detail}` : "";
      throw new Error(maskImmofluxToken((e instanceof Error ? e.message : "Eroare IMMOFLUX.") + detail, c.token));
    }
  };
  const mask = (text: string) => { let out = text; for (const t of tokens) out = maskImmofluxToken(out, t); return maskImmofluxToken(out); };
  return {
    deadline,
    mask,
    isEnabled: async (org) => {
      const { data } = await admin.from("immoflux_connections").select("enabled").eq("organization_id", org).maybeSingle();
      return data?.enabled === true;
    },
    // Câte un status pe rând (`filter_status__eq`, forma documentată); `null` = rezerva fără filtru.
    fetchPage: (org, page, status) => get(org, "properties", status === null ? { page } : { page, filter_status__eq: status }),
    fetchDetail: (org, id) => get(org, `property/${encodeURIComponent(id)}`),
    fetchAgents: (org) => get(org, "agents"),
    fetchContact: (org, id) => get(org, `contact/${encodeURIComponent(id)}`),
    imageBase: async (org) => `https://${immofluxHostOf((await config(org)).sub)}/`,
    existingIds: async (org, ids) => {
      const out = new Set<string>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await admin.from("properties").select("external_id").eq("organization_id", org).eq("source", "immoflux").in("external_id", ids.slice(i, i + 200));
        if (error) throw new Error("Anunțurile existente nu au putut fi citite.");
        for (const r of data ?? []) if (r.external_id) out.add(r.external_id);
      }
      return out;
    },
    createdByJob: async (job, ids) => {
      const out = new Map<string, string>();
      if (!ids.length || !job.created_at) return out;
      const { data, error } = await admin.from("properties").select("id,external_id").eq("organization_id", job.organization_id).eq("source", "immoflux")
        .eq("created_by", job.requested_by).gte("created_at", job.created_at).in("external_id", ids);
      if (error) throw new Error("Anunțurile create de import nu au putut fi citite.");
      for (const r of data ?? []) if (r.external_id) out.set(r.external_id, r.id);
      return out;
    },
    members: async (org) => {
      const { data, error } = await admin.from("profiles").select("id,email").eq("organization_id", org).eq("is_active", true);
      if (error) throw new Error("Membrii agenției nu au putut fi citiți.");
      return data ?? [];
    },
    fallbackAdmin: async (org) => {
      const { data: roles } = await admin.from("user_roles").select("user_id").eq("role", "agency_admin").eq("organization_id", org);
      const ids = (roles ?? []).map((r: { user_id: string }) => r.user_id);
      if (!ids.length) return null;
      const { data } = await admin.from("profiles").select("id").in("id", ids).eq("organization_id", org).eq("is_active", true).order("created_at").limit(1);
      return data?.[0]?.id ?? null;
    },
    findContactByPhone: async (org, phone) => {
      let index = phoneIndex.get(org);
      if (!index) {
        index = new Map();
        for (let from = 0; ; from += 1000) {
          const { data, error } = await admin.from("contacts").select("id,phone").eq("organization_id", org).not("phone", "is", null).order("id").range(from, from + 999);
          if (error) throw new Error("Contactele agenției nu au putut fi citite.");
          for (const c of (data ?? []) as { id: string; phone: string | null }[]) { const n = normalizePhone(c.phone); if (n && !index.has(n)) index.set(n, c.id); }
          if ((data ?? []).length < 1000) break;
        }
        phoneIndex.set(org, index);
      }
      return index.get(phone) ?? null;
    },
    findContactByEmail: async (org, email) => {
      const { data, error } = await admin.from("contacts").select("id").eq("organization_id", org).ilike("email", escapeLike(email)).order("created_at").limit(1);
      if (error) throw new Error("Contactele agenției nu au putut fi citite.");
      return data?.[0]?.id ?? null;
    },
    createContact: async (job, c, assignedTo) => {
      const { data, error } = await admin.from("contacts").insert({
        organization_id: job.organization_id, type: "owner", first_name: c.firstName, last_name: c.lastName,
        phone: c.phone, email: c.email, source: "IMMOFLUX", assigned_to: assignedTo, created_by: job.requested_by, updated_by: job.requested_by,
      }).select("id").single();
      if (error || !data) throw new Error("Contactul proprietarului nu a putut fi creat.");
      const n = normalizePhone(c.phone);
      if (n) phoneIndex.get(job.organization_id)?.set(n, data.id);
      return data.id as string;
    },
    createProperty: async (job, row) => {
      const { data: reference, error: refError } = await admin.rpc("next_property_reference");
      if (refError || !reference) throw new Error("Referința nu a putut fi generată.");
      const { data, error } = await admin.from("properties")
        .insert({ ...(row as object), organization_id: job.organization_id, reference, created_by: job.requested_by, updated_by: job.requested_by })
        .select("id").single();
      if (error || !data) throw new Error(error?.message ?? "Inserarea a eșuat.");
      // Fără nicio bifă de portal: și bifa implicită a site-ului agenției se scoate.
      await admin.from("portal_publications").delete().eq("property_id", data.id).eq("organization_id", job.organization_id);
      return data.id as string;
    },
    enqueueImages: async (job, propertyId, images) => {
      const { error } = await admin.from("property_import_images").insert(images.map((img) => ({
        job_id: (job as ImportJob & { image_job_id: string }).image_job_id, property_id: propertyId,
        source_url: img.source_url, ordering: img.ordering, status: "pending",
      })));
      if (error) throw new Error(error.message);
    },
    save: async (job) => {
      await admin.from("immoflux_import_jobs").update({
        next_page: job.next_page, next_index: job.next_index, last_page: job.last_page, total: job.total,
        imported_count: job.imported_count, existing_count: job.existing_count, error_count: job.error_count,
        unmapped_codes: job.unmapped_codes, report: job.report, page_signature: job.page_signature ?? null, status_step: job.status_step ?? 0, status_failures: job.status_failures ?? 0, locked_until: new Date(Date.now() + LEASE_MS).toISOString(),
      }).eq("id", job.id);
    },
  };
}

/** Dependențele pentru completarea pozelor și proprietarilor lipsă (doar în agenția jobului). */
export function repairDeps(admin: Admin, fetchImpl: typeof fetch, deadline: () => boolean): RepairDeps {
  const base = productionDeps(admin, fetchImpl, deadline);
  return {
    ...base,
    repairTargets: async (org, offset, limit) => {
      const { data, error } = await admin.from("properties").select("id,external_id,external_reference,owner_contact_id,assigned_to")
        .eq("organization_id", org).eq("source", "immoflux").not("external_id", "is", null).is("deleted_at", null).order("id").range(offset, offset + limit - 1);
      if (error) throw new Error("Proprietățile IMMOFLUX nu au putut fi citite.");
      const rows = (data ?? []) as { id: string; external_id: string; external_reference: string | null; owner_contact_id: string | null; assigned_to: string | null }[];
      const ids = rows.map((r) => r.id);
      const withImages = new Set<string>();
      if (ids.length) {
        const [imgs, queued] = await Promise.all([
          admin.from("property_images").select("property_id").in("property_id", ids),
          admin.from("property_import_images").select("property_id").in("property_id", ids).in("status", ["pending", "processing"]),
        ]);
        if (imgs.error || queued.error) throw new Error("Pozele existente nu au putut fi citite.");
        for (const r of [...(imgs.data ?? []), ...(queued.data ?? [])] as { property_id: string }[]) withImages.add(r.property_id);
      }
      return rows.map((r) => ({ id: r.id, externalId: r.external_id, ref: r.external_reference, ownerContactId: r.owner_contact_id, assignedTo: r.assigned_to, hasImages: withImages.has(r.id) }));
    },
    linkOwner: async (org, propertyId, contactId) => {
      const { error } = await admin.from("properties").update({ owner_contact_id: contactId }).eq("id", propertyId).eq("organization_id", org).is("owner_contact_id", null);
      if (error) throw new Error("Proprietarul nu a putut fi legat.");
    },
  };
}

async function close(admin: Admin, job: ImportJob & { image_job_id: string | null }, status: "done" | "stopped" | "error", lastError: string | null) {
  await admin.from("immoflux_import_jobs").update({ status, last_error: lastError, locked_until: null, finished_at: new Date().toISOString() }).eq("id", job.id);
  if (job.image_job_id) {
    const { count } = await admin.from("property_import_images").select("id", { count: "exact", head: true }).eq("job_id", job.image_job_id);
    await admin.from("property_import_jobs").update({ created_count: job.imported_count, skipped_count: job.existing_count + job.error_count, images_total: count ?? 0,
      ...(count ? {} : { status: "completed", finished_at: new Date().toISOString() }) }).eq("id", job.image_job_id);
    if (count) await admin.rpc("property_import_images_arm");
  }
  const repair = (job as { mode?: string }).mode === "repair";
  const title = repair ? (status === "done" ? "Completare IMMOFLUX finalizată" : status === "stopped" ? "Completare IMMOFLUX oprită (dezactivat)" : "Completare IMMOFLUX eșuată")
    : status === "done" ? "Import IMMOFLUX finalizat" : status === "stopped" ? "Import IMMOFLUX oprit (dezactivat)" : "Import IMMOFLUX eșuat";
  await admin.from("notifications").insert({ organization_id: job.organization_id, user_id: job.requested_by, type: "immoflux_import", title,
    body: (repair ? `${job.imported_count} completate, ${job.existing_count} deja complete, ${job.error_count} cu erori` : finishMessage(job)) + (lastError ? `. ${lastError}` : ""), link: `/superadmin/importuri-immoflux?job=${job.id}` });
  await admin.from("audit_logs").insert({ organization_id: job.organization_id, actor_id: job.requested_by, created_by: job.requested_by, action: repair ? `immoflux.repair_${status}` : `immoflux.import_${status}`,
    entity: "immoflux_import_jobs", entity_id: job.id, new_values: { imported: job.imported_count, existing: job.existing_count, errors: job.error_count, unmapped: job.unmapped_codes } });
}

export async function runImmofluxJob(admin: Admin, job: ImportJob & { image_job_id: string | null }, fetchImpl: typeof fetch, until: number) {
  const repair = (job as { mode?: string }).mode === "repair";
  const deps = repair ? repairDeps(admin, fetchImpl, () => Date.now() > until) : productionDeps(admin, fetchImpl, () => Date.now() > until);
  try {
    while (Date.now() < until) {
      const outcome = repair ? await runRepairPage(job, deps as RepairDeps) : await runImportPage(job, deps as ImportDeps);
      if (outcome === "done") return close(admin, job, "done", null);
      if (outcome === "stopped") return close(admin, job, "stopped", null);
      if (job.rate_limited) { // limita IMMOFLUX: se reia la programarea de pe minut, fără pornire imediată
        job.rate_limited = false;
        await admin.from("immoflux_import_jobs").update({ locked_until: null }).eq("id", job.id);
        return;
      }
    }
    await admin.from("immoflux_import_jobs").update({ locked_until: null }).eq("id", job.id);
    await admin.rpc("development_clone_kick"); // continuă imediat, fără să aștepte programarea pe minut
  } catch (e) {
    await close(admin, job, "error", deps.mask!(e instanceof Error ? e.message : "Eroare necunoscută.").slice(0, 300));
  }
}

/** Fiecare agenție are jobul ei; joburile rulează în paralel și eșecul unuia nu le atinge pe celelalte. */
export async function runImmofluxImportJobs(fetchImpl: typeof fetch = fetch): Promise<{ immofluxJobs: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as Admin;
  const now = new Date().toISOString();
  const { data: candidates } = await admin.from("immoflux_import_jobs").select("id").in("status", ["queued", "running"])
    .or(`locked_until.is.null,locked_until.lt.${now}`).order("created_at").limit(5);
  const claimed: (ImportJob & { image_job_id: string | null })[] = [];
  for (const c of (candidates ?? []) as { id: string }[]) {
    const { data } = await admin.from("immoflux_import_jobs")
      .update({ status: "running", locked_until: new Date(Date.now() + LEASE_MS).toISOString(), started_at: now })
      .eq("id", c.id).in("status", ["queued", "running"]).or(`locked_until.is.null,locked_until.lt.${now}`).select("*").maybeSingle();
    if (data) claimed.push(data);
  }
  const until = Date.now() + BUDGET_MS;
  await Promise.all(claimed.map((j) => runImmofluxJob(admin, j, fetchImpl, until)));
  return { immofluxJobs: claimed.length };
}
