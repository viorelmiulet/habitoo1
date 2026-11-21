import { type CloneCopy, type ClonePortalSkip, type CloneSkip } from "./clone";
import type { PortalDefinition } from "@/lib/portals/registry";

export const CLONE_JOB_BATCH = 10;
export const CLONE_JOB_MAX_STALLS = 3;
export const CLONE_STARTED_TEXT = "Alocarea a pornit în fundal. Te anunțăm când se termină.";

export type CloneJobItem = { index: number; copies: CloneCopy[]; skipped: CloneSkip[]; files: { from: string; to: string; copy_id: string }[] };
export type CloneJobRow = { id: string; organization_id: string; development_id: string; attempts: number };
export type CloneJobDb = {
  claim: () => Promise<CloneJobRow | null>;
  step: (jobId: string) => Promise<CloneJobItem | null>;
  advance: (jobId: string, index: number, portalSkipped: ClonePortalSkip[], photoErrors: number) => Promise<void>;
  release: (jobId: string) => Promise<void>;
  finish: (jobId: string, error: string | null) => Promise<void>;
};
export type CloneJobDeps = {
  copyFile: (from: string, to: string) => Promise<boolean>;
  removeImage: (copyId: string, path: string) => Promise<void>;
  activatedPortals: (orgId: string) => Promise<Set<string>>;
  definitions: () => PortalDefinition[];
  developmentPortals: (developmentId:string,orgId:string) => Promise<string[]>;
  applySelection: (orgId: string, propertyId: string, portals: string[]) => Promise<{ portalId: string; ok: boolean; message: string | null }[]>;
};

/**
 * One worker run: claims one job and processes up to `batch` properties. Each property is cloned in the DB
 * (recorded as the job's pending item), then photos are copied and portals preselected (both idempotent), then
 * the item is committed. An interrupted run resumes from the pending item without cloning it twice.
 */
export async function runCloneJobOnce(db: CloneJobDb, deps: CloneJobDeps, batch = CLONE_JOB_BATCH): Promise<{ jobId: string | null; processed: number; finished: boolean }> {
  const job = await db.claim();
  if (!job) return { jobId: null, processed: 0, finished: false };
  if (job.attempts > CLONE_JOB_MAX_STALLS) {
    await db.finish(job.id, "procesarea s-a oprit de mai multe ori fără progres");
    return { jobId: job.id, processed: 0, finished: true };
  }
  let portals: string[] | null = null;
  let done = 0;
  try {
    while (done < batch) {
      const item = await db.step(job.id);
      if (!item) { await db.finish(job.id, null); return { jobId: job.id, processed: done, finished: true }; }
      let photoErrors = 0;
      for (const f of item.files) {
        const ok = await deps.copyFile(f.from, f.to).catch(() => false);
        if (!ok) { photoErrors += 1; await deps.removeImage(f.copy_id, f.to); }
      }
      const portalSkipped: ClonePortalSkip[] = [];
      if (item.copies.length) {
        portals ??= await deps.developmentPortals(job.development_id,job.organization_id);
        for (const c of item.copies) {
          if (!portals.length) break;
          try {
            for (const r of await deps.applySelection(job.organization_id, c.copy_id, portals)) if (!r.ok) portalSkipped.push({ copy_id: c.copy_id, portal: r.portalId, reason: r.message ?? "Portal nebifat." });
          } catch (e) {
            portalSkipped.push({ copy_id: c.copy_id, portal: "*", reason: e instanceof Error ? e.message : "Portalurile nu au putut fi bifate." });
          }
        }
      }
      await db.advance(job.id, item.index, portalSkipped, photoErrors);
      done += 1;
    }
    await db.release(job.id);
    return { jobId: job.id, processed: done, finished: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "eroare necunoscută";
    await db.finish(job.id, msg);
    return { jobId: job.id, processed: done, finished: true };
  }
}
