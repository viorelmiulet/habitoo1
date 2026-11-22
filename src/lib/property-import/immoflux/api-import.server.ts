/** Worker pentru preluarea IMMOFLUX: rulează în aceeași pornire (nonce) și programare pe minut ca alocarea la ansambluri. */
import { finishMessage, runImportPage, type ImportDeps, type ImportJob } from "./api-import";
import { normalizeImmofluxHost, normalizeImmofluxSlug } from "./connection";

const LEASE_MS = 90_000;
const BUDGET_MS = 20_000;
const MAX_BYTES = 8 * 1024 * 1024;

async function readJson(url: string, apiKey: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(20_000), headers: { "X-API-Key": apiKey, Accept: "application/json" } });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(response.status === 401 ? "Cheie API IMMOFLUX invalidă (HTTP 401)." : response.status === 404 ? "Anunț sau portal IMMOFLUX negăsit (HTTP 404)." : `IMMOFLUX a răspuns HTTP ${response.status}.`);
  }
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Error("Răspuns IMMOFLUX prea mare.");
  return JSON.parse(text);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export function productionDeps(admin: Admin, fetchImpl: typeof fetch, deadline: () => boolean): ImportDeps {
  const configs = new Map<string, { base: string; key: string }>();
  const config = async (org: string) => {
    const hit = configs.get(org);
    if (hit) return hit;
    const { unlockImmofluxKey } = await import("./connection.server");
    const { data, error } = await admin.from("immoflux_connections").select("host,slug,api_key_encrypted,enabled").eq("organization_id", org).maybeSingle();
    if (error || !data) throw new Error("Configurarea IMMOFLUX a agenției lipsește.");
    const c = { base: `https://${normalizeImmofluxHost(data.host)}/api/bridges/portal/${normalizeImmofluxSlug(data.slug)}`, key: unlockImmofluxKey(data.api_key_encrypted) };
    configs.set(org, c);
    return c;
  };
  return {
    deadline,
    isEnabled: async (org) => {
      const { data } = await admin.from("immoflux_connections").select("enabled").eq("organization_id", org).maybeSingle();
      return data?.enabled === true;
    },
    fetchPage: async (org, page) => { const c = await config(org); return readJson(`${c.base}/properties?page=${page}`, c.key, fetchImpl); },
    fetchDetail: async (org, id) => { const c = await config(org); return readJson(`${c.base}/properties/${encodeURIComponent(id)}`, c.key, fetchImpl); },
    existingIds: async (org, ids) => {
      const out = new Set<string>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await admin.from("properties").select("external_id").eq("organization_id", org).eq("source", "immoflux").in("external_id", ids.slice(i, i + 200));
        if (error) throw new Error("Anunțurile existente nu au putut fi citite.");
        for (const r of data ?? []) if (r.external_id) out.add(r.external_id);
      }
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
        job_id: (job as ImportJob & { image_job_id: string }).image_job_id, organization_id: job.organization_id, property_id: propertyId,
        source_url: img.source_url, ordering: img.ordering, status: "pending",
      })));
      if (error) throw new Error(error.message);
    },
    save: async (job) => {
      await admin.from("immoflux_import_jobs").update({
        next_page: job.next_page, next_index: job.next_index, last_page: job.last_page, total: job.total,
        imported_count: job.imported_count, existing_count: job.existing_count, error_count: job.error_count,
        unmapped_codes: job.unmapped_codes, report: job.report, locked_until: new Date(Date.now() + LEASE_MS).toISOString(),
      }).eq("id", job.id);
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
  const title = status === "done" ? "Import IMMOFLUX finalizat" : status === "stopped" ? "Import IMMOFLUX oprit (dezactivat)" : "Import IMMOFLUX eșuat";
  await admin.from("notifications").insert({ organization_id: job.organization_id, user_id: job.requested_by, type: "immoflux_import", title,
    body: finishMessage(job) + (lastError ? `. ${lastError}` : ""), link: `/superadmin/importuri-immoflux?job=${job.id}` });
  await admin.from("audit_logs").insert({ organization_id: job.organization_id, actor_id: job.requested_by, created_by: job.requested_by, action: `immoflux.import_${status}`,
    entity: "immoflux_import_jobs", entity_id: job.id, new_values: { imported: job.imported_count, existing: job.existing_count, errors: job.error_count, unmapped: job.unmapped_codes } });
}

async function runOne(admin: Admin, job: ImportJob & { image_job_id: string | null }, fetchImpl: typeof fetch, until: number) {
  const deps = productionDeps(admin, fetchImpl, () => Date.now() > until);
  try {
    while (Date.now() < until) {
      const outcome = await runImportPage(job, deps);
      if (outcome === "done") return close(admin, job, "done", null);
      if (outcome === "stopped") return close(admin, job, "stopped", null);
    }
    await admin.from("immoflux_import_jobs").update({ locked_until: null }).eq("id", job.id);
    await admin.rpc("development_clone_kick"); // continuă imediat, fără să aștepte programarea pe minut
  } catch (e) {
    await close(admin, job, "error", e instanceof Error ? e.message.slice(0, 300) : "Eroare necunoscută.");
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
  await Promise.all(claimed.map((j) => runOne(admin, j, fetchImpl, until)));
  return { immofluxJobs: claimed.length };
}
