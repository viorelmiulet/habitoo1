import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { prepareOutreachCsv, outreachStatuses, type ImportSummary, type OutreachList, type OutreachDetail } from "@/lib/outreach";

async function assertSuperadmin(context: { supabase: { rpc: (fn: "is_superadmin") => PromiseLike<{ data: boolean | null; error: unknown }> } }) {
  const { data, error } = await context.supabase.rpc("is_superadmin");
  if (error || data !== true) throw new Error("Acces permis exclusiv Superadminului.");
}

export const getOutreachLists = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await assertSuperadmin(context);
  const { data, error } = await context.supabase.rpc("outreach_list_summaries");
  if (error) throw new Error("Listele nu au putut fi încărcate.");
  return data as unknown as OutreachList[];
});

export const importOutreachCsv = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ name: z.string().trim().min(1).max(160), csv: z.string().max(5_000_000), listId: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const prepared = prepareOutreachCsv(data.csv);
    const { data: result, error } = await context.supabase.rpc("outreach_import", {
      _name: data.name, _rows: prepared.rows, _invalid: prepared.invalid, _duplicates: prepared.duplicates,
      ...(data.listId ? { _list_id: data.listId } : {}),
    });
    if (error) throw new Error("Importul nu a fost salvat. Încearcă din nou.");
    return result as unknown as ImportSummary & { list_id: string };
  });

export const getOutreachDetail = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ listId: z.string().uuid(), q: z.string().trim().max(200).default(""), status: z.enum(["", ...outreachStatuses]).default(""), city: z.string().max(2000).default(""), page: z.number().int().min(1).max(100000).default(1) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const { data: result, error } = await context.supabase.rpc("outreach_list_detail", { _list_id: data.listId, _q: data.q, _status: data.status, _city: data.city, _page: data.page });
    if (error) throw new Error("Lista nu a putut fi încărcată.");
    return result as unknown as OutreachDetail;
  });

export const excludeOutreachRecipient = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const { error } = await context.supabase.rpc("outreach_exclude", { _recipient_id: data.id });
    if (error) throw new Error("Excluderea nu a fost salvată.");
    return { ok: true };
  });