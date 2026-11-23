/** Existing scheduled worker creates monthly drafts only; delivery requires an agent. */
import { generateOwnerReport } from "./run.server";
import { previousMonth, romaniaClock } from "./report";

const BATCH = 25;

export async function runOwnerReportsTick(now = new Date()) {
  const clock = romaniaClock(now);
  const out = { generated: 0, duplicates: 0, sent: 0, failed: 0 };
  if (clock.hour < 8) return out;
  const week = previousMonth(now);
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { createGenerateDeps } = await import("./deps.server");

  // Generare: proprietăți active cu raportul activat și fără raport pentru săptămână.
  const {readComplete}=await import('./price.server');
  const settings=await readComplete((a,b)=>db.from("owner_report_settings").select("property_id,organization_id,auto_send").eq("enabled", true).order('property_id').range(a,b));
  const ids = (settings ?? []).map((s) => s.property_id);
  const done = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data,error } = await db.from("owner_reports").select("property_id").eq("week_start", week.start).in("property_id", ids.slice(i, i + 200));
    if(error)throw new Error('Istoricul rapoartelor nu a putut fi citit.');
    (data ?? []).forEach((r) => done.add(r.property_id));
  }
  const pending = (settings ?? []).filter((s) => !done.has(s.property_id)).slice(0, BATCH);
  if (pending.length) {
    const deps = await createGenerateDeps();
    for (const t of pending) {
      try {
        const r = await generateOwnerReport(deps, {...t,auto_send:false}, week);
        if (r === "created") out.generated += 1; else if (r === "duplicate") out.duplicates += 1;
      } catch (e) {
        out.failed += 1;
        console.error("[owner_report] generate failed", e instanceof Error ? e.message : "error");
      }
    }
  }

  // No scheduled delivery, including previously opted-in weekly drafts.
  return out;
}
