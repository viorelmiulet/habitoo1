// Import de proprietăți din export IMMOFLUX, lansat de superadmin pentru o
// agenție. Pozele doar se pun în coadă (`property_import_images`); importul
// nu publică nimic pe portaluri și nu creează `portal_publications`/`portal_listings`.
import { createServerFn } from "@tanstack/react-start";
import { requireActiveOrgAuth } from "@/lib/org-access";
import type { ExistingImmofluxProperty, PlannedItem } from "./immoflux/plan";

const MAX_CONTENT_BYTES = 24 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHUNK = 200;

type Input = {
  organizationId: string;
  assignedTo: string;
  fileName: string | null;
  fileText: string;
  mode: "preview" | "commit";
};

export type ImportItemReport = {
  externalId: string | null;
  title: string | null;
  action: "create" | "update" | "skip";
  propertyId?: string | null;
  images?: number;
  reasons?: string[];
  warnings?: string[];
};

export type ImmofluxImportResult = {
  mode: "preview" | "commit";
  jobId: string | null;
  counts: { create: number; update: number; skip: number; images: number; failed: number };
  items: ImportItemReport[];
};

function chunks<T>(list: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function reportOf(item: PlannedItem, propertyId?: string | null): ImportItemReport {
  if (item.action === "skip") {
    return { externalId: item.externalId, title: item.title, action: "skip", reasons: item.reasons };
  }
  return {
    externalId: item.externalId,
    title: item.title,
    action: item.action,
    propertyId: propertyId ?? (item.action === "update" ? item.propertyId : null),
    images: item.images.length,
    warnings: item.warnings,
  };
}

export const importImmofluxProperties = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .validator((input: Input): Input => {
    const fileText = typeof input?.fileText === "string" ? input.fileText : "";
    if (fileText.trim().length === 0) throw new Error("Fișierul de import este gol.");
    if (fileText.length > MAX_CONTENT_BYTES) {
      throw new Error("Fișierul de import depășește 24 MB. Împarte-l în mai multe fișiere.");
    }
    if (!UUID_RE.test(input?.organizationId ?? "")) throw new Error("Agenția selectată nu este validă.");
    if (!UUID_RE.test(input?.assignedTo ?? "")) throw new Error("Agentul selectat nu este valid.");
    if (input.mode !== "preview" && input.mode !== "commit") throw new Error("Mod de import necunoscut.");
    return {
      organizationId: input.organizationId,
      assignedTo: input.assignedTo,
      fileName: typeof input.fileName === "string" ? input.fileName.slice(0, 255) : null,
      fileText,
      mode: input.mode,
    };
  })
  .handler(async ({ data, context }): Promise<ImmofluxImportResult> => {
    const { data: isSuper, error: roleError } = await (
      context.supabase as unknown as {
        rpc: (fn: "is_superadmin") => PromiseLike<{ data: boolean | null; error: unknown }>;
      }
    ).rpc("is_superadmin");
    if (roleError || isSuper !== true) {
      throw new Error("Acces refuzat: importul de proprietăți este permis exclusiv superadminului.");
    }
    const actorId = context.userId;

    let parsed: unknown;
    try {
      parsed = JSON.parse(data.fileText);
    } catch {
      throw new Error("Fișierul nu este un JSON valid.");
    }
    if (!Array.isArray(parsed)) throw new Error("Fișierul trebuie să conțină o listă de proprietăți.");

    const [{ supabaseAdmin }, { planImmofluxImport }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("./immoflux/plan"),
    ]);

    const { data: agent } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", data.assignedTo)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (!agent) throw new Error("Agentul ales nu aparține agenției selectate.");

    // Proprietățile existente ale agenției, importate anterior din IMMOFLUX.
    const externalIds = [
      ...new Set(
        parsed
          .map((i) => (i && typeof (i as { id?: unknown }).id === "number" ? String((i as { id: number }).id) : null))
          .filter((v): v is string => v !== null),
      ),
    ];
    const existingRows: Omit<ExistingImmofluxProperty, "known_image_urls">[] = [];
    for (const part of chunks(externalIds)) {
      const { data: rows, error } = await supabaseAdmin
        .from("properties")
        .select(
          "id,external_id,county,city,county_siruta_code,uat_siruta_code,locality_siruta_code,district,lat,lng,location_precise",
        )
        .eq("organization_id", data.organizationId)
        .eq("source", "immoflux")
        .in("external_id", part);
      if (error) throw new Error("Proprietățile existente nu au putut fi citite.");
      for (const r of rows ?? []) existingRows.push({ ...r, external_id: r.external_id ?? "" });
    }
    const known = new Map<string, string[]>(existingRows.map((r) => [r.id, []]));
    for (const part of chunks([...known.keys()])) {
      const [imgs, queued] = await Promise.all([
        supabaseAdmin.from("property_images").select("property_id,source_url").in("property_id", part).not("source_url", "is", null),
        supabaseAdmin.from("property_import_images").select("property_id,source_url").in("property_id", part).in("status", ["pending", "done"]),
      ]);
      if (imgs.error || queued.error) throw new Error("Pozele existente nu au putut fi citite.");
      for (const r of [...(imgs.data ?? []), ...(queued.data ?? [])]) {
        if (r.source_url) known.get(r.property_id)?.push(r.source_url);
      }
    }
    const existing: ExistingImmofluxProperty[] = existingRows.map((r) => ({
      ...r,
      known_image_urls: known.get(r.id) ?? [],
    }));

    const plan = planImmofluxImport(parsed, existing, {
      organizationId: data.organizationId,
      assignedTo: data.assignedTo,
    });

    if (data.mode === "preview") {
      return {
        mode: "preview",
        jobId: null,
        counts: { ...plan.counts, failed: 0 },
        items: plan.items.map((i) => reportOf(i)),
      };
    }

    // ---- commit ----
    const { data: job, error: jobError } = await supabaseAdmin
      .from("property_import_jobs")
      .insert({
        organization_id: data.organizationId,
        created_by: actorId,
        source: "immoflux",
        file_name: data.fileName,
        status: "processing",
      })
      .select("id")
      .single();
    if (jobError || !job) throw new Error("Jobul de import nu a putut fi creat.");

    const report: ImportItemReport[] = [];
    const counts = { create: 0, update: 0, skip: 0, images: 0, failed: 0 };

    for (const item of plan.items) {
      if (item.action === "skip") {
        counts.skip += 1;
        report.push(reportOf(item));
        continue;
      }
      try {
        let propertyId: string;
        if (item.action === "create") {
          const { data: reference, error: refError } = await supabaseAdmin.rpc("next_property_reference");
          if (refError || !reference) throw new Error("Referința nu a putut fi generată.");
          const { data: created, error } = await supabaseAdmin
            .from("properties")
            .insert({
              ...item.row,
              reference,
              created_by: actorId,
              updated_by: actorId,
              // Importul nu publică nimic: oferta rămâne nepublicată.
              publish_status: "unpublished",
            } as never)
            .select("id")
            .single();
          if (error || !created) throw new Error(error?.message ?? "Inserarea a eșuat.");
          propertyId = (created as { id: string }).id;
          counts.create += 1;
        } else {
          const { error } = await supabaseAdmin
            .from("properties")
            .update({ ...item.patch, updated_by: actorId } as never)
            .eq("id", item.propertyId)
            .eq("organization_id", data.organizationId);
          if (error) throw new Error(error.message);
          propertyId = item.propertyId;
          counts.update += 1;
        }

        if (item.images.length > 0) {
          const { error } = await supabaseAdmin.from("property_import_images").insert(
            item.images.map((img) => ({
              job_id: job.id,
              property_id: propertyId,
              source_url: img.source_url,
              ordering: img.ordering,
              status: "pending",
            })),
          );
          if (error) throw new Error("Pozele nu au putut fi puse în coadă.");
          counts.images += item.images.length;
        }
        report.push(reportOf(item, propertyId));
      } catch (error) {
        counts.failed += 1;
        report.push({
          externalId: item.externalId,
          title: item.title,
          action: "skip",
          reasons: [
            `Eroare la ${item.action === "create" ? "creare" : "actualizare"}: ${
              error instanceof Error ? error.message : "necunoscută"
            }`,
          ],
        });
      }
    }

    const done = counts.images === 0;
    // Pozele în coadă armează worker-ul; se dezarmează singur când coada se golește.
    if (!done) {
      const { error: armError } = await supabaseAdmin.rpc("property_import_images_arm");
      if (armError) console.error("[property-import] arm failed", armError.message);
    }
    await supabaseAdmin
      .from("property_import_jobs")
      .update({
        created_count: counts.create,
        updated_count: counts.update,
        skipped_count: counts.skip + counts.failed,
        images_total: counts.images,
        report: report as never,
        ...(done ? { status: "completed", finished_at: new Date().toISOString() } : {}),
      })
      .eq("id", job.id);

    await supabaseAdmin.from("audit_logs").insert({
      organization_id: data.organizationId,
      actor_id: actorId,
      action: "properties.imported",
      entity: "property_import_jobs",
      entity_id: job.id,
      new_values: { source: "immoflux", file_name: data.fileName, assigned_to: data.assignedTo, ...counts },
    } as never);

    return { mode: "commit", jobId: job.id, counts, items: report };
  });
