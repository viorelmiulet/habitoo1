/** Lucrătorul de luni: generează ciornele de la 08:00 și trimite automat de la 09:00 (ora României), în loturi mărginite. */
import { generateOwnerReport, sendOwnerReport } from "./run.server";
import { previousWeek, romaniaClock } from "./report";

const BATCH = 25;

export async function runOwnerReportsTick(now = new Date()) {
  const clock = romaniaClock(now);
  const out = { generated: 0, duplicates: 0, sent: 0, failed: 0 };
  if (clock.weekday !== "Mon" || clock.hour < 8) return out;
  const week = previousWeek(now);
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { createGenerateDeps, createSendDeps } = await import("./deps.server");

  // Generare: proprietăți active cu raportul activat și fără raport pentru săptămână.
  const { data: settings } = await db.from("owner_report_settings").select("property_id,organization_id,auto_send").eq("enabled", true).limit(2000);
  const ids = (settings ?? []).map((s) => s.property_id);
  const done = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("owner_reports").select("property_id").eq("week_start", week.start).in("property_id", ids.slice(i, i + 200));
    (data ?? []).forEach((r) => done.add(r.property_id));
  }
  const pending = (settings ?? []).filter((s) => !done.has(s.property_id)).slice(0, BATCH);
  if (pending.length) {
    const deps = await createGenerateDeps();
    for (const t of pending) {
      try {
        const r = await generateOwnerReport(deps, t, week);
        if (r === "created") out.generated += 1; else if (r === "duplicate") out.duplicates += 1;
      } catch (e) {
        out.failed += 1;
        console.error("[owner_report] generate failed", e instanceof Error ? e.message : "error");
      }
    }
  }

  // Trimitere automată, doar ciornele încă active, cu setarea și consimțământul încă valabile.
  if (clock.hour >= 9) {
    const { data: drafts } = await db.from("owner_reports").select("id,organization_id,property_id,owner_contact_id,agent_id,data").eq("week_start", week.start).eq("status", "draft").eq("auto_send", true).is("sent_via", null).not("pdf_path", "is", null).limit(BATCH);
    if (drafts?.length) {
      const sendDeps = await createSendDeps();
      for (const d of drafts) {
        const [{ data: s }, { data: ok }] = await Promise.all([
          db.from("owner_report_settings").select("enabled,auto_send").eq("property_id", d.property_id).maybeSingle(),
          d.owner_contact_id ? db.rpc("owner_can_auto_send", { _contact: d.owner_contact_id }) : Promise.resolve({ data: false }),
        ]);
        if (!s?.enabled || !s.auto_send || !ok) {
          await db.from("owner_reports").update({ auto_send: false }).eq("id", d.id);
          continue;
        }
        const r = await sendOwnerReport(sendDeps, d.id, { userId: null, via: "auto" });
        if (r.ok) out.sent += 1; else out.failed += 1;
        if (d.agent_id) {
          const title = (d.data as { property?: { title?: string } })?.property?.title ?? "proprietate";
          await db.from("notifications").insert({ organization_id: d.organization_id, user_id: d.agent_id, type: "owner_report", title: r.ok ? `Raportul pentru ${title} a fost trimis automat proprietarului` : `Raportul pentru ${title} nu a putut fi trimis automat`, body: r.ok ? "Trimiterea a fost înregistrată în istoricul proprietarului." : r.message ?? null, link: `/app/properties/${d.property_id}?tab=owner-reports` });
        }
      }
    }
  }
  return out;
}
