import { generateAcpReportForVersion } from "../src/lib/acp/reports.functions";
const actor = { userId: "196ade29-b9fa-4f0e-ab84-5166a2f36770", organizationId: "04041622-b3d2-4cbe-a214-2ae9bfa34492" };
const analysisId = "0c0d89e5-05dc-49ae-8f36-0f91a0099d90";
const res = await generateAcpReportForVersion(actor, analysisId);
console.log("generate:", JSON.stringify(res, null, 2));
// izolare pe altă agenție
try {
  await generateAcpReportForVersion({ ...actor, organizationId: "00000000-0000-0000-0000-000000000001" }, analysisId);
  console.log("ISOLATION FAIL");
} catch (e) { console.log("isolation ok:", (e as Error).message); }
const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
const { data: rows } = await supabaseAdmin.from("acp_reports").select("id,version,analysis_version,status,pdf_path,file_size_bytes,snapshot_at").eq("analysis_id", analysisId);
console.log("rows:", JSON.stringify(rows));
const path = rows?.[0]?.pdf_path;
if (path) {
  const { data: file } = await supabaseAdmin.storage.from("acp-reports").download(path);
  const buf = Buffer.from(await file!.arrayBuffer());
  console.log("pdf bytes:", buf.byteLength, "header:", buf.slice(0,5).toString());
  const { data: signed } = await supabaseAdmin.storage.from("acp-reports").createSignedUrl(path, 60);
  console.log("signed:", Boolean(signed?.signedUrl));
  require("fs").writeFileSync("/tmp/acp-report.pdf", buf);
}
