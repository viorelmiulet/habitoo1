import { clonePortalIds } from './clone';
import type { PortalDefinition } from '@/lib/portals/registry';

export type UnitOperation = 'withdraw' | 'republish' | 'remove';
export const UNIT_OPERATION_STARTED = 'Operația a pornit în fundal. Te anunțăm când se termină.';
export type UnitOperationItem = { index: number; propertyId: string; reference?: string; portals: string[] };
export type UnitOperationJob = { id: string; organization_id: string; requested_by: string; operation: UnitOperation; attempts: number; total: number };
export type UnitOperationResult = { succeeded: UnitOperationItem[]; failed: (UnitOperationItem & { reason: string })[] };
export function unitPublicationLabel(withdrawnAt: string | null, portalCount: number) {
  return withdrawnAt ? 'Retras de pe portaluri' : portalCount > 0 ? `Publicat pe ${portalCount} portaluri` : 'Nepublicat';
}
export type UnitOperationDb = {
  step: (id: string) => Promise<UnitOperationItem | null>;
  advance: (id: string, index: number, reason: string | null) => Promise<void>;
  release: (id: string) => Promise<void>;
  finish: (id: string, reason: string | null) => Promise<void>;
};
export type UnitOperationDeps = {
  activatedPortals: (org: string) => Promise<Set<string>>;
  definitions: () => PortalDefinition[];
  applySelection: (job: UnitOperationJob, item: UnitOperationItem, selections: {portalId: string; enabled: boolean}[]) => Promise<{portalId: string; ok: boolean; message: string | null}[]>;
  enqueueDeletion: (job: UnitOperationJob, propertyId: string) => Promise<void>;
};
/** One unit per invocation bounds portal latency; durable pending item resumes without repeating the SQL mutation. */
export async function runUnitOperationOnce(job: UnitOperationJob, db: UnitOperationDb, deps: UnitOperationDeps) {
  if (job.attempts > 3) { await db.finish(job.id, 'Operația s-a întrerupt de mai multe ori fără progres.'); return {jobId: job.id, processed: 0, finished: true}; }
  try {
    const item = await db.step(job.id);
    if (!item) { await db.finish(job.id, null); return {jobId: job.id, processed: 0, finished: true}; }
    let reason: string | null = null;
    try {
      const enabled = job.operation === 'republish';
      const portals = enabled ? [...new Set(['agency_site', ...clonePortalIds(await deps.activatedPortals(job.organization_id), deps.definitions())])] : item.portals;
      if (job.operation === 'remove') await deps.enqueueDeletion(job, item.propertyId);
      const results = await deps.applySelection(job, item, portals.map(portalId => ({portalId, enabled})));
      const missing = portals.filter(p => !results.some(r => r.portalId === p));
      const failures = results.filter(r => !r.ok).map(r => `${r.portalId}: ${r.message ?? 'Operația a eșuat.'}`);
      for (const p of missing) failures.push(`${p}: operație neconfirmată.`);
      reason = failures.length ? failures.join('; ') : null;
    } catch (e) { reason = e instanceof Error ? e.message : 'Portalurile nu au putut fi actualizate.'; }
    await db.advance(job.id, item.index, reason);
    if (item.index + 1 >= job.total) { await db.finish(job.id, null); return {jobId:job.id,processed:1,finished:true}; }
    await db.release(job.id);
    return {jobId: job.id, processed: 1, finished: false};
  } catch (e) {
    await db.finish(job.id, e instanceof Error ? e.message : 'Operația nu a putut continua.');
    return {jobId: job.id, processed: 0, finished: true};
  }
}