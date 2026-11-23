/**
 * Recuperare unică: pune înapoi în coada existentă (`portal_publish_jobs`)
 * publicațiile rămase în `error` cu o eroare temporară, pentru anunțurile încă
 * publicate și cu portalul încă bifat. Aceeași operație (republicare: update
 * dacă anunțul există pe portal, altfel publicare), eșalonat per portal.
 */
import { isTransientPublishFailure } from "./transient-failure";
import { isRepublishableProperty } from "./republish";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

/** Distanța dintre două joburi recuperate ale aceluiași portal. */
export const RECOVERY_PORTAL_SPACING_MS = 30_000;

export type RecoveryPublication = {
  organization_id: string; property_id: string; portal_key: string; enabled: boolean | null;
  status: string | null; last_error: string | null; withdrawn_at: string | null;
  updated_by: string | null; created_by: string | null;
};
export type RecoveryProperty = { id: string; status: string | null; deleted_at: string | null; assigned_to: string | null };

export function selectTransientRecovery(input: {
  publications: RecoveryPublication[];
  properties: Map<string, RecoveryProperty>;
  activatedPortals: Set<string>; // `${org}|${portal}`
  activeJobs: Set<string>; // `${property}|${portal}`
  nowMs: number;
}) {
  const perPortal: Record<string, number> = {};
  const jobs: Record<string, unknown>[] = [];
  for (const p of input.publications) {
    if (p.status !== "error" || p.enabled !== true || p.withdrawn_at) continue;
    if (!isTransientPublishFailure({ message: p.last_error, portalId: p.portal_key })) continue;
    const property = input.properties.get(p.property_id);
    if (!property || !isRepublishableProperty(property) || property.status === "draft" || property.status === "expired") continue;
    if (!input.activatedPortals.has(`${p.organization_id}|${p.portal_key}`)) continue;
    if (input.activeJobs.has(`${p.property_id}|${p.portal_key}`)) continue;
    const requester = p.updated_by ?? p.created_by ?? property.assigned_to;
    if (!requester) continue;
    const i = perPortal[p.portal_key] ?? 0;
    perPortal[p.portal_key] = i + 1;
    jobs.push({
      organization_id: p.organization_id, property_id: p.property_id, portal_key: p.portal_key,
      enabled: true, promoted: null, sync_existing: true, requested_by: requester, superadmin: false,
      operation: "republish", status: "queued",
      // One failed attempt already happened: the worker resumes it as a retry.
      attempts: 1,
      next_attempt_at: new Date(input.nowMs + i * RECOVERY_PORTAL_SPACING_MS).toISOString(),
    });
  }
  return { jobs, perPortal };
}

export async function recoverTransientPublishErrors(admin: Admin, nowMs = Date.now()) {
  const publications: RecoveryPublication[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("portal_publications")
      .select("organization_id,property_id,portal_key,enabled,status,last_error,withdrawn_at,updated_by,created_by")
      .eq("status", "error").eq("enabled", true).order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    publications.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const ids = [...new Set(publications.map((p) => p.property_id))];
  const properties = new Map<string, RecoveryProperty>();
  const activeJobs = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const [{ data: props }, { data: jobs }] = await Promise.all([
      admin.from("properties").select("id,status,deleted_at,assigned_to").in("id", chunk),
      admin.from("portal_publish_jobs").select("property_id,portal_key").in("property_id", chunk).in("status", ["queued", "running"]),
    ]);
    for (const p of props ?? []) properties.set(p.id, p);
    for (const j of jobs ?? []) activeJobs.add(`${j.property_id}|${j.portal_key}`);
  }
  const { data: connections } = await admin.from("portal_connections").select("organization_id,portal,activated").eq("activated", true);
  const activatedPortals = new Set<string>((connections ?? []).map((c: any) => `${c.organization_id}|${c.portal}`));
  const result = selectTransientRecovery({ publications, properties, activatedPortals, activeJobs, nowMs });
  if (result.jobs.length) {
    const { error } = await admin.from("portal_publish_jobs").insert(result.jobs);
    if (error) throw new Error(error.message);
    await admin.rpc("portal_publish_arm");
  }
  return result.perPortal;
}
