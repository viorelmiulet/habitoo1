/**
 * Stage 12 — E2E real pe agențiile de test, server-side.
 * Rulare: bun --env-file=.env scripts/stage12-e2e.ts
 */
import { executeAiTool } from "../src/lib/ai/tools/executors.server";
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

const ORG_A = "04041622-b3d2-4cbe-a214-2ae9bfa34492";
const USER_A = "196ade29-b9fa-4f0e-ab84-5166a2f36770";
const ORG_B = "a944a4da-0280-4ae8-82b5-2a3b6b5f8484";
const USER_B = "80bbec93-de84-4e8f-98f2-487d61cfe74a";

const actorA = { userId: USER_A, organizationId: ORG_A, role: "agent" as const };
const actorB = { userId: USER_B, organizationId: ORG_B, role: "agent" as const };

const results: string[] = [];
function check(name: string, ok: boolean, extra = "") {
  results.push(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
}

async function main() {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id,stage,name")
    .eq("organization_id", ORG_A)
    .limit(1)
    .maybeSingle();
  const { data: property } = await supabaseAdmin
    .from("properties")
    .select("id")
    .eq("organization_id", ORG_A)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("organization_id", ORG_A)
    .limit(1)
    .maybeSingle();
  if (!lead || !property || !contact) {
    console.log("Date de test insuficiente în ORG_A.");
    return;
  }

  const title = `E2E Stage 12 ${Date.now()}`;
  const taskArgs = {
    leadId: lead.id,
    title,
    dueAt: new Date(Date.now() + 86_400_000).toISOString(),
  };

  // 1. fără aprobare nu se scrie nimic
  const noApproval = await executeAiTool(actorA, "create_task", taskArgs);
  const { data: afterNoApproval } = await supabaseAdmin
    .from("activities")
    .select("id")
    .eq("organization_id", ORG_A)
    .eq("title", title);
  check("aprobarea este obligatorie", !noApproval.ok && (afterNoApproval ?? []).length === 0);

  // 2. aprobat o dată → exact un rând; dublu-click → tot un rând
  const first = await executeAiTool(actorA, "create_task", taskArgs, { approvalGranted: true });
  const second = await executeAiTool(actorA, "create_task", taskArgs, { approvalGranted: true });
  const { data: tasks } = await supabaseAdmin
    .from("activities")
    .select("id")
    .eq("organization_id", ORG_A)
    .eq("title", title);
  check("aprobarea execută exact o dată", first.ok && (tasks ?? []).length === 1);
  check("dublu-click este idempotent", second.ok && (tasks ?? []).length === 1);

  // 3. cross-tenant blocat
  const cross = await executeAiTool(actorB, "create_task", taskArgs, { approvalGranted: true });
  check("cross-tenant blocat", !cross.ok, cross.ok ? "" : cross.code);

  // 4. stare învechită la lead
  const stale = await executeAiTool(
    actorA,
    "update_lead_status",
    { leadId: lead.id, stage: "contacted", expectedStage: "offer" },
    { approvalGranted: true },
  );
  const { data: leadAfter } = await supabaseAdmin
    .from("leads")
    .select("stage")
    .eq("id", lead.id)
    .maybeSingle();
  check(
    "starea învechită este blocată",
    !stale.ok && leadAfter?.stage === lead.stage,
    String(leadAfter?.stage),
  );

  // 5. ciorna nu suprascrie descrierea publicată
  const { data: before } = await supabaseAdmin
    .from("properties")
    .select("description")
    .eq("id", property.id)
    .maybeSingle();
  const draft = await executeAiTool(
    actorA,
    "generate_property_description",
    {
      propertyId: property.id,
      draft: `Ciornă E2E ${Date.now()}: apartament luminos, complet renovat, aproape de metrou.`,
    },
    { approvalGranted: true },
  );
  const { data: after } = await supabaseAdmin
    .from("properties")
    .select("description")
    .eq("id", property.id)
    .maybeSingle();
  check(
    "ciorna nu suprascrie descrierea publicată",
    draft.ok && before?.description === after?.description,
  );

  // 6. potrivire duplicată blocată
  const matchArgs = { contactId: contact.id, propertyId: property.id };
  const m1 = await executeAiTool(actorA, "create_client_property_match", matchArgs, {
    approvalGranted: true,
  });
  const m2 = await executeAiTool(actorA, "create_client_property_match", matchArgs, {
    approvalGranted: true,
  });
  const { data: matches } = await supabaseAdmin
    .from("activities")
    .select("id")
    .eq("organization_id", ORG_A)
    .eq("contact_id", contact.id)
    .eq("property_id", property.id)
    .eq("done", false);
  check(
    "potrivirea duplicată este blocată",
    m1.ok && m2.ok && (matches ?? []).length >= 1,
    `${(matches ?? []).length} potriviri active`,
  );

  // 7. acțiune cu risc înalt refuzată
  const highRisk = await executeAiTool(actorA, "publish_to_portal", { propertyId: property.id }, {
    approvalGranted: true,
  });
  check("acțiunea cu risc înalt este refuzată", !highRisk.ok);

  // curățenie
  await supabaseAdmin.from("activities").delete().eq("organization_id", ORG_A).eq("title", title);

  console.log(results.join("\n"));
}

void main();
