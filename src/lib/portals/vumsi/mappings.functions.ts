/** Vumsi: corespondențele categorii/tip (SuperAdmin) și previzualizarea pe proprietate. Fără scrieri la Vumsi. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuperadmin(supabase: any) {
  const { data } = await supabase.rpc("is_superadmin");
  if (data !== true) throw new Error("Acces refuzat: doar SuperAdmin.");
}

export const getVumsiMappingState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context.supabase);
    const { loadVumsiSetup } = await import("./preview.server");
    const m = await import("./mapper");
    const { snapshot, mappings } = await loadVumsiSetup(context.supabase);
    const categories = (snapshot?.categories ?? []).map((c) => ({ id: c.id, name: c.name, path: c.path }));
    const types = m.vumsiListingTypes(snapshot?.reference);
    const rows = m.VUMSI_HABITOO_KINDS.flatMap((k) =>
      m.VUMSI_TRANSACTIONS.map((tx) => {
        const saved = mappings.categories.find((x) => x.habitoo_kind === k.kind && x.transaction === tx);
        const suggested = m.suggestVumsiCategory(k.kind, tx, snapshot?.categories ?? []);
        return { kind: k.kind, kindLabel: k.label, transaction: tx, txLabel: m.VUMSI_TX_LABEL[tx], savedId: saved?.category_id ?? null, suggestedId: suggested?.id ?? null };
      }),
    );
    const typeRows = m.VUMSI_TRANSACTIONS.map((tx) => ({
      transaction: tx, txLabel: m.VUMSI_TX_LABEL[tx],
      savedValue: mappings.types.find((t) => t.transaction === tx)?.type_value ?? null,
      suggestedValue: m.suggestVumsiType(tx, types)?.value ?? null,
    }));
    return { hasSnapshot: !!snapshot, categories, types, rows, typeRows };
  });

const saveSchema = z.object({
  categories: z.array(z.object({ kind: z.string().min(1).max(32), transaction: z.enum(["sale", "rent"]), categoryId: z.number().int().positive().nullable() })).max(40),
  types: z.array(z.object({ transaction: z.enum(["sale", "rent"]), value: z.number().int().nullable() })).max(2),
});

export const saveVumsiMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof saveSchema>) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase);
    const db = context.supabase as any;
    const { loadVumsiSetup } = await import("./preview.server");
    const { VUMSI_HABITOO_KINDS, vumsiListingTypes } = await import("./mapper");
    const { snapshot } = await loadVumsiSetup(db);
    if (!snapshot) throw new Error("Sincronizează întâi nomenclatoarele Vumsi.");
    const byId = new Map(snapshot.categories.map((c) => [c.id, c]));
    const types = vumsiListingTypes(snapshot.reference);
    const now = new Date().toISOString();
    for (const c of data.categories) {
      if (!VUMSI_HABITOO_KINDS.some((k) => k.kind === c.kind)) throw new Error("Tip Habitoo necunoscut.");
      if (c.categoryId === null) {
        await db.from("vumsi_category_mappings").delete().eq("habitoo_kind", c.kind).eq("transaction", c.transaction);
        continue;
      }
      const cat = byId.get(c.categoryId);
      if (!cat) throw new Error("Categoria aleasă nu este în snapshotul Vumsi.");
      const { error } = await db.from("vumsi_category_mappings").upsert({ habitoo_kind: c.kind, transaction: c.transaction, category_id: cat.id, category_name: cat.name, confirmed_by: context.userId, updated_at: now });
      if (error) throw new Error(error.message);
    }
    for (const t of data.types) {
      if (t.value === null) { await db.from("vumsi_type_mappings").delete().eq("transaction", t.transaction); continue; }
      const ref = types.find((x) => x.value === t.value);
      if (!ref) throw new Error("Tipul ales nu este în referințele Vumsi.");
      const { error } = await db.from("vumsi_type_mappings").upsert({ transaction: t.transaction, type_value: ref.value, type_label: ref.label, confirmed_by: context.userId, updated_at: now });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const previewVumsiPayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { propertyId: string }) => z.object({ propertyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase);
    const { buildVumsiPreview } = await import("./preview.server");
    const r = await buildVumsiPreview(data.propertyId);
    return {
      ok: r.ok, setupMissing: r.setupMissing, reasons: r.reasons, warnings: r.warnings,
      summaryJson: JSON.stringify({
        city_id: r.cityId, city: r.cityName,
        listings: r.plans.map((x) => ({ transaction: x.transaction, external_id: x.externalId, category: x.category, type: x.type, attrs: x.attrs, blocked: x.reasons })),
        user: { found_uuid: r.user.vumsiUuid, checked: r.user.checked }, company: { found_uuid: r.company.vumsiUuid, checked: r.company.checked },
      }, null, 2),
      payloadsJson: JSON.stringify({
        "POST /listings/": r.plans.map((x) => x.body).filter(Boolean),
        "POST /users/": r.user.payload,
        "POST /companies/": r.company.payload,
      }, null, 2),
    };
  });
