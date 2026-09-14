/** E2E real al fluxului de prospectare, pe agenția de test. */
import { createProspectingSearch } from "@/lib/prospecting/prospecting.functions";
const ORG_A = "04041622-b3d2-4cbe-a214-2ae9bfa34492";
const USER_A = "196ade29-b9fa-4f0e-ab84-5166a2f36770";
const ORG_B = "a944a4da-0280-4ae8-82b5-2a3b6b5f8484";
const USER_B = "80bbec93-de84-4e8f-98f2-487d61cfe74a";
const actorA = { userId: USER_A, organizationId: ORG_A, role: "admin" as const };
const actorB = { userId: USER_B, organizationId: ORG_B, role: "admin" as const };

const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
const { startProspectingWorkflow, resumeProspectingWorkflow, getProspectingWorkflowRun } =
  await import("@/lib/prospecting/runtime.server");
const { executeAiTool } = await import("@/lib/ai/tools/executors.server");

const { data: search } = await db.from("prospecting_searches").insert({
  organization_id: ORG_A, created_by: USER_A, name: `E2E ${Date.now()}`,
  transaction_type: "sale", city: "Bucuresti", price_min: 50000, price_max: 250000,
  keywords: ["proprietar"], source_ids: [],
}).select("id").single();
console.log("search", search?.id);

const started = await startProspectingWorkflow(actorA, search!.id);
console.log("START:", JSON.stringify(started, null, 1).slice(0, 1200));
if (!started.ok) process.exit(1);
const runId = started.run.id;

// 1) dublu-click: a doua pornire trebuie respinsă
console.log("DOUBLE-CLICK:", JSON.stringify(await startProspectingWorkflow(actorA, search!.id)));

// 2) state după "reload"
const reloaded = await getProspectingWorkflowRun(actorA, runId);
console.log("RELOAD status:", reloaded?.status, "step:", reloaded?.currentStep, "candidati:", reloaded?.candidateIds.length);

// 3) cross-org: org B nu vede rularea
console.log("CROSS-ORG run:", await getProspectingWorkflowRun(actorB, runId));
const first = started.run.candidateIds[0]!;
console.log("CROSS-ORG get_prospect:", JSON.stringify(await executeAiTool(actorB, "get_prospect", { prospectId: first })));
console.log("CROSS-ORG import fara aprobare:", JSON.stringify(await executeAiTool(actorB, "import_prospect_to_crm", { prospectId: first })));

// 4) acțiune fără aprobare, în propria agenție
console.log("ACTION fara aprobare:", JSON.stringify(await executeAiTool(actorA, "import_prospect_to_crm", { prospectId: first })));

// 5) prospecte salvate + duplicate + scor
const { data: rows } = await db.from("prospects").select("id,title,status,opportunity_score,seller_type,duplicate_group_id,price,seller_phone").eq("run_id", started.run.counters ? (await db.from("prospecting_runs").select("id").eq("search_id", search!.id).single()).data!.id : "").order("opportunity_score", { ascending: false });
console.log("PROSPECTE:", JSON.stringify(rows, null, 1));

// 6) aprobare + import CRM
const resumed = await resumeProspectingWorkflow(actorA, runId, { approvedIds: [first], rejectedIds: started.run.candidateIds.slice(1), importApproved: true });
console.log("RESUME:", JSON.stringify(resumed, null, 1).slice(0, 900));

// 7) verificare CRM + idempotență
const { data: after } = await db.from("prospects").select("id,status,imported_lead_id,imported_contact_id").eq("id", first).single();
console.log("PROSPECT dupa import:", JSON.stringify(after));
const { importProspectToCrm } = await import("@/lib/prospecting/import.server");
console.log("IMPORT REPETAT:", JSON.stringify(await importProspectToCrm(actorA, first)));
const { data: lead } = await db.from("leads").select("id,name,source,contact_id,organization_id").eq("id", after!.imported_lead_id!).single();
console.log("LEAD:", JSON.stringify(lead));

// 8) audit + tracing
const { data: audit } = await db.from("audit_logs").select("action,entity,entity_id").eq("organization_id", ORG_A).like("action", "prospecting.%").order("created_at", { ascending: false }).limit(10);
console.log("AUDIT:", JSON.stringify(audit));
const { data: traces } = await db.from("ai_trace_events").select("kind,name,status").eq("run_id", runId).order("created_at");
console.log("TRACE:", JSON.stringify(traces));
const { data: usage } = await db.from("ai_usage_events").select("capability,success,input_tokens,output_tokens").eq("organization_id", ORG_A).eq("capability","prospecting_classify").order("created_at",{ascending:false}).limit(2);
console.log("USAGE:", JSON.stringify(usage));
console.log("SEARCH_ID_FOR_CLEANUP", search!.id, "RUN", runId, "PROSPECT", first);
