import type { PublishApplyFn, PublishJobRow, PublishOutcome } from "../publish-jobs.server";

/** Durable evidence exists before any preflight/portal call, even if the invocation dies. */
export async function runZonataLoggedJob(admin: any, job: PublishJobRow, apply: PublishApplyFn): Promise<PublishOutcome | null> {
  const scope = { organization_id: job.organization_id, property_id: job.property_id, portal: "zonata" };
  const started = Date.now();
  const previous = await admin.from("portal_operation_logs").update({
    error_code: "INTERRUPTED", error_message: "Încercarea ZonaTa a fost întreruptă înainte de confirmare; este reluată după expirarea blocării.",
  }).eq("organization_id", scope.organization_id).eq("property_id", scope.property_id).eq("portal", "zonata").eq("error_code", "OPERATION_PENDING");
  if (previous.error) throw new Error("Jurnalul ZonaTa nu a putut fi actualizat; nu s-a trimis nicio cerere.");
  const { data, error } = await admin.from("portal_operation_logs").insert({
    ...scope, actor_id: job.requested_by,
    operation: `${job.operation ?? "apply"}:attempt`, success: false,
    error_code: "OPERATION_PENDING", error_message: "Încercare ZonaTa începută; confirmarea nu a fost încă primită.",
    portal_response: { job_id: job.id, attempt: job.attempts },
  }).select("id").single();
  if (error || !data?.id) throw new Error("Jurnalul ZonaTa nu a putut fi inițializat; nu s-a trimis nicio cerere.");
  let outcome: PublishOutcome | null = null;
  let completed = false;
  try {
    outcome = await apply(job);
    completed = true;
    return outcome;
  } finally {
    const success = completed && (outcome === null || outcome.ok);
    const saved = await admin.from("portal_operation_logs").update({
      success,
      error_code: success ? null : completed ? (outcome?.code ?? "PORTAL_ERROR") : "UNEXPECTED_ERROR",
      error_message: success ? (outcome?.message ?? null) : completed ? (outcome?.message ?? "Încercarea ZonaTa a eșuat.") : "Încercarea ZonaTa a eșuat înainte de confirmare.",
      http_status: outcome?.httpStatus ?? null, duration_ms: Math.max(0, Date.now() - started),
    }).eq("id", data.id);
    if (saved.error) throw new Error("Rezultatul ZonaTa nu a putut fi jurnalizat; încercarea rămâne neconfirmată.");
  }
}