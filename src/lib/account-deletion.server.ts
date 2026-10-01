/**
 * Motorul de ștergere a unui utilizator sau a unei agenții (Superadmin), rulat în
 * fundal pe `account_deletion_jobs`. Logica e scrisă peste porturi mici (bază de
 * date, storage, portaluri, autentificare), ca testele să ruleze integral pe mock-uri.
 */
import { isRetryablePortalBulkError } from "@/lib/portals/bulk";

export const MEDIA_BUCKET = "property-media";
export const ORG_BUCKETS = ["agency-logos", "avatars", "ai-media", "acp-reports", "crm-documents"] as const;
export const PROPERTIES_PER_TICK = 5;
export const WITHDRAW_MAX_ATTEMPTS = 3;
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];

export type DeletionKind = "user" | "organization";
export type DeletionMode = "reassign" | "delete";

export type DeletionReport = {
  moved: Record<string, number>;
  deleted: Record<string, number>;
  withdrawn: number;
  manual: { propertyId: string; reference: string | null; portal: string; url: string | null }[];
  newReferences: { propertyId: string; from: string | null; to: string }[];
  storageRemoved: number;
  storageMoved: number;
  retries: Record<string, number>;
  failedPropertyIds: string[];
  authDeleted?: number;
};

export type DeletionJob = {
  id: string;
  kind: DeletionKind;
  target_id: string;
  mode: DeletionMode;
  reassign_to_user_id: string | null;
  delete_target: boolean;
  status: string;
  phase: string;
  total: number;
  done: number;
  failed: number;
  report: Partial<DeletionReport> | null;
  next_attempt_at?: string | null;
  errors: unknown[] | null;
  created_by: string;
};

export type TargetProperty = { id: string; organization_id: string; reference: string | null };
export type PortalTarget = { portal: string; external_id: string | null; public_url: string | null };
export type ProfileRow = { id: string; organization_id: string | null; is_active: boolean; full_name: string | null; avatar_url: string | null };

export type WithdrawResult = { ok: boolean; manual?: boolean; attempted?: boolean; alreadyWithdrawn?: boolean; message: string; code?: string | null; httpStatus?: number | null };

export interface DeletionStore {
  getProfile(id: string): Promise<ProfileRow | null>;
  isSuperadmin(userId: string): Promise<boolean>;
  organizationExists(id: string): Promise<boolean>;
  hasActiveJob(kind: DeletionKind, targetId: string): Promise<boolean>;
  insertJob(row: Omit<DeletionJob, "id" | "status" | "phase" | "total" | "done" | "failed" | "report" | "errors"> & { total: number; target_label: string | null }): Promise<string>;
  countTargetProperties(kind: DeletionKind, targetId: string): Promise<number>;
  listTargetProperties(kind: DeletionKind, targetId: string, excludeIds: string[], limit: number): Promise<TargetProperty[]>;
  listPortalTargets(propertyId: string): Promise<PortalTarget[]>;
  listImages(propertyId: string): Promise<{ id: string; storage_path: string | null }[]>;
  updateImagePath(imageId: string, path: string): Promise<void>;
  hardDeleteProperty(propertyId: string): Promise<void>;
  moveProperty(propertyId: string, toUserId: string, actorId: string): Promise<{ new_reference: string | null }>;
  reassignSameOrg(fromUserId: string, toUserId: string, actorId: string): Promise<Record<string, number>>;
  applyRest(kind: DeletionKind, targetId: string, mode: DeletionMode, toUserId: string | null, actorId: string): Promise<Record<string, number>>;
  deleteUserRows(userId: string, reassignTo: string | null, actorId: string): Promise<void>;
  deleteOrganizationRows(orgId: string, actorId: string): Promise<{ auth_user_ids: string[]; member_ids: string[] }>;
  listOrgMemberIds(orgId: string): Promise<string[]>;
  updateJob(id: string, patch: Partial<DeletionJob> & Record<string, unknown>): Promise<void>;
  audit(row: { action: string; entity: string; entity_id: string; actor_id: string; old_values?: unknown; new_values?: unknown }): Promise<void>;
  arm(): Promise<void>;
  /** Portalurile pe care destinația (aceeași agenție) ar depăși locurile alocate după preluare. */
  sameOrgSlotConflicts?(fromUserId: string, toUserId: string): Promise<string[]>;
}

export type StorageEntry = { name: string; folder: boolean };
export interface DeletionStorage {
  list(bucket: string, prefix: string): Promise<StorageEntry[]>;
  remove(bucket: string, paths: string[]): Promise<number>;
  move(bucket: string, from: string, to: string): Promise<void>;
}

export type DeletionDeps = {
  store: DeletionStore;
  storage: DeletionStorage;
  withdraw: (input: { organizationId: string; actorId: string; portalId: string; propertyId: string; externalId: string | null }) => Promise<WithdrawResult>;
  deleteAuthUser: (userId: string) => Promise<{ error: string | null }>;
  now?: () => number;
};

export function emptyReport(): DeletionReport {
  return { moved: {}, deleted: {}, withdrawn: 0, manual: [], newReferences: [], storageRemoved: 0, storageMoved: 0, retries: {}, failedPropertyIds: [] };
}

function normalizeReport(report: Partial<DeletionReport> | null | undefined): DeletionReport {
  return { ...emptyReport(), ...(report ?? {}) };
}

// ---------------------------------------------------------------- validare

export function slotConflictMessage(name: string, portals: string[]) {
  return `${name} nu are locuri libere pe: ${portals.join(", ")}. Eliberează locuri sau mărește limita.`;
}

export type StartDeletionInput = {
  actorId: string;
  kind: DeletionKind;
  targetId: string;
  mode: DeletionMode;
  reassignToUserId: string | null;
  deleteTarget?: boolean;
};

/** Protecțiile cerute; aruncă cu un mesaj clar, altfel întoarce contextul validat. */
export async function validateDeletionRequest(store: DeletionStore, input: StartDeletionInput) {
  const actor = await store.getProfile(input.actorId);
  let targetOrgId: string | null = null;
  let label: string | null = null;

  if (input.kind === "user") {
    if (input.targetId === input.actorId) throw new Error("Nu îți poți șterge propriul cont.");
    if (await store.isSuperadmin(input.targetId)) throw new Error("Un cont de superadmin nu poate fi șters.");
    const target = await store.getProfile(input.targetId);
    if (!target) throw new Error("Utilizatorul nu există sau a fost deja șters.");
    targetOrgId = target.organization_id;
    label = target.full_name;
  } else {
    if (!(await store.organizationExists(input.targetId))) throw new Error("Agenția nu există sau a fost deja ștearsă.");
    if (actor?.organization_id && actor.organization_id === input.targetId) {
      throw new Error("Nu poți șterge agenția din care faci parte.");
    }
    const members = await store.listOrgMemberIds(input.targetId);
    for (const id of members) {
      if (await store.isSuperadmin(id)) throw new Error("Agenția are un cont de superadmin și nu poate fi ștearsă.");
    }
  }

  let destination: ProfileRow | null = null;
  if (input.mode === "reassign") {
    if (!input.reassignToUserId) throw new Error("Alege utilizatorul care preia datele.");
    destination = await store.getProfile(input.reassignToUserId);
    if (!destination || !destination.is_active || !destination.organization_id) {
      throw new Error("Utilizatorul destinație trebuie să existe, să fie activ și să aparțină unei agenții.");
    }
    if (destination.id === input.targetId) throw new Error("Utilizatorul destinație nu poate fi cel șters.");
    if (input.kind === "organization" && destination.organization_id === input.targetId) {
      throw new Error("Utilizatorul destinație nu poate fi din agenția ștearsă.");
    }
    if (input.kind === "user" && destination.organization_id === targetOrgId && store.sameOrgSlotConflicts) {
      const conflicts = await store.sameOrgSlotConflicts(input.targetId, destination.id);
      if (conflicts.length) throw new Error(slotConflictMessage(destination.full_name ?? "Utilizatorul destinație", conflicts));
    }
  } else if (input.reassignToUserId) {
    throw new Error("La ștergerea definitivă nu se alege un utilizator destinație.");
  }

  if (await store.hasActiveJob(input.kind, input.targetId)) {
    throw new Error("Există deja o ștergere în curs pentru această țintă.");
  }
  return { targetOrgId, destination, label };
}

export async function startAccountDeletion(store: DeletionStore, input: StartDeletionInput) {
  const { label } = await validateDeletionRequest(store, input);
  const total = await store.countTargetProperties(input.kind, input.targetId);
  const jobId = await store.insertJob({
    kind: input.kind,
    target_id: input.targetId,
    target_label: label,
    mode: input.mode,
    reassign_to_user_id: input.mode === "reassign" ? input.reassignToUserId : null,
    delete_target: input.deleteTarget ?? true,
    created_by: input.actorId,
    total,
  });
  await store.audit({
    action: "account.deletion_started",
    entity: input.kind === "user" ? "profiles" : "organizations",
    entity_id: input.targetId,
    actor_id: input.actorId,
    new_values: { job_id: jobId, kind: input.kind, mode: input.mode, reassign_to: input.reassignToUserId, delete_target: input.deleteTarget ?? true, properties: total },
  });
  await store.arm();
  return { jobId, total };
}

// ---------------------------------------------------------------- storage

export async function listRecursive(storage: DeletionStorage, bucket: string, prefix: string): Promise<string[]> {
  const clean = prefix.replace(/\/+$/, "");
  const entries = await storage.list(bucket, clean);
  const out: string[] = [];
  for (const entry of entries) {
    const path = `${clean}/${entry.name}`;
    if (entry.folder) out.push(...(await listRecursive(storage, bucket, path)));
    else out.push(path);
  }
  return out;
}

async function removeAll(storage: DeletionStorage, bucket: string, paths: string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) removed += await storage.remove(bucket, paths.slice(i, i + 100));
  return removed;
}

/** Copiile cu watermark: `watermarked/<hash>/<sufix>` pentru fiecare amprentă. */
export async function removeWatermarked(storage: DeletionStorage, suffix: string): Promise<number> {
  const hashes = (await storage.list(MEDIA_BUCKET, "watermarked")).filter((e) => e.folder);
  let removed = 0;
  for (const hash of hashes) {
    const files = await listRecursive(storage, MEDIA_BUCKET, `watermarked/${hash.name}/${suffix}`);
    removed += await removeAll(storage, MEDIA_BUCKET, files);
  }
  return removed;
}

// ---------------------------------------------------------------- worker

async function withdrawProperty(deps: DeletionDeps, job: DeletionJob, property: TargetProperty, report: DeletionReport) {
  const targets = await deps.store.listPortalTargets(property.id);
  const seen = new Set<string>();
  for (const target of targets) {
    if (seen.has(target.portal)) continue;
    seen.add(target.portal);
    const res = await deps.withdraw({
      organizationId: property.organization_id,
      actorId: job.created_by,
      portalId: target.portal,
      propertyId: property.id,
      externalId: target.external_id,
    });
    if (res.manual) {
      report.manual.push({ propertyId: property.id, reference: property.reference, portal: target.portal, url: target.public_url });
      continue;
    }
    if (!res.ok) return { ok: false as const, result: res, portal: target.portal };
    if (!res.alreadyWithdrawn) report.withdrawn += 1;
  }
  return { ok: true as const };
}

async function deletePropertyData(deps: DeletionDeps, property: TargetProperty, report: DeletionReport) {
  const images = await deps.store.listImages(property.id);
  const originals = images.map((i) => i.storage_path).filter((p): p is string => !!p);
  const folder = await listRecursive(deps.storage, MEDIA_BUCKET, `${property.organization_id}/${property.id}`);
  report.storageRemoved += await removeAll(deps.storage, MEDIA_BUCKET, [...new Set([...originals, ...folder])]);
  report.storageRemoved += await removeWatermarked(deps.storage, `${property.organization_id}/${property.id}`);
  await deps.store.hardDeleteProperty(property.id);
  report.deleted.properties = (report.deleted.properties ?? 0) + 1;
}

async function movePropertyData(deps: DeletionDeps, job: DeletionJob, property: TargetProperty, toUserId: string, toOrgId: string, report: DeletionReport) {
  const oldPrefix = `${property.organization_id}/`;
  const oldReference = property.reference;
  if (toOrgId !== property.organization_id) {
    for (const image of await deps.store.listImages(property.id)) {
      if (!image.storage_path) continue;
      const rest = image.storage_path.startsWith(oldPrefix) ? image.storage_path.slice(oldPrefix.length) : image.storage_path.split("/").slice(1).join("/");
      const next = `${toOrgId}/${rest}`;
      if (next === image.storage_path) continue;
      await deps.storage.move(MEDIA_BUCKET, image.storage_path, next);
      await deps.store.updateImagePath(image.id, next);
      report.storageMoved += 1;
    }
    report.storageRemoved += await removeWatermarked(deps.storage, `${property.organization_id}/${property.id}`);
  }
  const out = await deps.store.moveProperty(property.id, toUserId, job.created_by);
  if (out.new_reference) report.newReferences.push({ propertyId: property.id, from: oldReference, to: out.new_reference });
  report.moved.properties = (report.moved.properties ?? 0) + 1;
}

function addCounts(into: Record<string, number>, add: Record<string, number>) {
  for (const [k, v] of Object.entries(add)) into[k] = (into[k] ?? 0) + Number(v ?? 0);
}

/** Un pas al jobului: un lot de proprietăți, apoi restul datelor și finalizarea. */
export async function processDeletionJob(job: DeletionJob, deps: DeletionDeps): Promise<{ status: string; phase: string }> {
  const now = deps.now ?? Date.now;
  const report = normalizeReport(job.report);
  const errors = [...(job.errors ?? [])];
  let done = job.done;
  let failed = job.failed;
  const save = (patch: Record<string, unknown>) => deps.store.updateJob(job.id, { report, errors, done, failed, locked_until: null, ...patch });

  try {
    let destination: ProfileRow | null = null;
    let sameOrg = false;
    if (job.mode === "reassign") {
      destination = await deps.store.getProfile(job.reassign_to_user_id!);
      if (!destination?.organization_id || !destination.is_active) throw new Error("Utilizatorul destinație nu mai este activ.");
      if (job.kind === "user") {
        const target = await deps.store.getProfile(job.target_id);
        sameOrg = !!target && target.organization_id === destination.organization_id;
      }
    }

    // 1. Proprietățile, în loturi mici (nu și la realocarea în aceeași agenție).
    if (job.phase === "properties" && !sameOrg) {
      const batch = await deps.store.listTargetProperties(job.kind, job.target_id, report.failedPropertyIds, PROPERTIES_PER_TICK);
      for (const property of batch) {
        const w = await withdrawProperty(deps, job, property, report);
        if (!w.ok) {
          const attempts = (report.retries[property.id] ?? 0) + 1;
          report.retries[property.id] = attempts;
          if (attempts < WITHDRAW_MAX_ATTEMPTS && isRetryablePortalBulkError(w.result)) {
            const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)]!;
            await save({ next_attempt_at: new Date(now() + delay).toISOString() });
            return { status: "running", phase: "properties" };
          }
          report.failedPropertyIds.push(property.id);
          errors.push({ propertyId: property.id, reference: property.reference, portal: w.portal, message: w.result.message });
          failed += 1;
          continue;
        }
        if (job.mode === "delete") await deletePropertyData(deps, property, report);
        else await movePropertyData(deps, job, property, destination!.id, destination!.organization_id!, report);
        done += 1;
      }
      if (batch.length === PROPERTIES_PER_TICK) {
        await save({ next_attempt_at: null });
        return { status: "running", phase: "properties" };
      }
    }

    if (report.failedPropertyIds.length > 0) {
      await save({ status: "failed", phase: "properties", finished_at: new Date(now()).toISOString() });
      return { status: "failed", phase: "properties" };
    }

    // 2. Restul datelor vizate.
    if (job.phase === "properties" || job.phase === "rest") {
      if (job.mode === "reassign" && sameOrg) {
        addCounts(report.moved, await deps.store.reassignSameOrg(job.target_id, destination!.id, job.created_by));
      } else if (job.mode === "reassign" || job.kind === "user") {
        const counts = await deps.store.applyRest(job.kind, job.target_id, job.mode, destination?.id ?? null, job.created_by);
        addCounts(job.mode === "reassign" ? report.moved : report.deleted, counts);
      }
      await save({ phase: "finalize" });
    }

    // 3. Finalizarea: ținta, fișierele rămase, conturile de autentificare.
    if (job.delete_target) {
      if (job.kind === "user") {
        const profile = await deps.store.getProfile(job.target_id);
        await deps.store.deleteUserRows(job.target_id, job.mode === "reassign" ? job.reassign_to_user_id : null, job.created_by);
        if (profile?.organization_id) {
          const files = await listRecursive(deps.storage, "avatars", `${profile.organization_id}/${job.target_id}`);
          report.storageRemoved += await removeAll(deps.storage, "avatars", files);
        }
        if (profile?.avatar_url && !/^https?:/i.test(profile.avatar_url)) {
          report.storageRemoved += await deps.storage.remove("avatars", [profile.avatar_url]);
        }
        const auth = await deps.deleteAuthUser(job.target_id);
        if (auth.error) errors.push({ authUser: job.target_id, message: auth.error });
        report.authDeleted = auth.error ? 0 : 1;
      } else {
        const org = job.target_id;
        report.storageRemoved += await removeAll(deps.storage, MEDIA_BUCKET, await listRecursive(deps.storage, MEDIA_BUCKET, org));
        report.storageRemoved += await removeWatermarked(deps.storage, org);
        for (const bucket of ORG_BUCKETS) {
          report.storageRemoved += await removeAll(deps.storage, bucket, await listRecursive(deps.storage, bucket, org));
        }
        const { auth_user_ids } = await deps.store.deleteOrganizationRows(org, job.created_by);
        let authDeleted = 0;
        for (const id of auth_user_ids) {
          const auth = await deps.deleteAuthUser(id);
          if (auth.error) errors.push({ authUser: id, message: auth.error });
          else authDeleted += 1;
        }
        report.authDeleted = authDeleted;
      }
    }

    await deps.store.audit({
      action: job.delete_target ? "account.deleted" : "account.data_reassigned",
      entity: job.kind === "user" ? "profiles" : "organizations",
      entity_id: job.target_id,
      actor_id: job.created_by,
      new_values: {
        job_id: job.id, kind: job.kind, mode: job.mode, reassign_to: job.reassign_to_user_id,
        moved: report.moved, deleted: report.deleted, withdrawn: report.withdrawn,
        manual_withdrawals: report.manual.length, manual: report.manual, new_references: report.newReferences,
      },
    });
    await save({ status: "done", phase: "done", finished_at: new Date(now()).toISOString(), next_attempt_at: null });
    return { status: "done", phase: "done" };
  } catch (e) {
    errors.push({ message: e instanceof Error ? e.message : String(e) });
    await save({ status: "failed", finished_at: new Date(now()).toISOString() });
    return { status: "failed", phase: job.phase };
  }
}

// ---------------------------------------------------------------- adaptoare reale

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

export function supabaseDeletionStore(admin: Admin): DeletionStore {
  const must = (r: { data: any; error: { message: string } | null }): any => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  const targetQuery = (kind: DeletionKind, targetId: string) => {
    const q = admin.from("properties");
    return { q, col: kind === "user" ? "assigned_to" : "organization_id", targetId };
  };
  return {
    getProfile: async (id) => must(await admin.from("profiles").select("id,organization_id,is_active,full_name,avatar_url").eq("id", id).maybeSingle()),
    isSuperadmin: async (id) => (must(await admin.from("user_roles").select("id").eq("user_id", id).eq("role", "superadmin")) ?? []).length > 0,
    organizationExists: async (id) => !!must(await admin.from("organizations").select("id").eq("id", id).maybeSingle()),
    hasActiveJob: async (kind, targetId) => (must(await admin.from("account_deletion_jobs").select("id").eq("kind", kind).eq("target_id", targetId).in("status", ["queued", "running"])) ?? []).length > 0,
    insertJob: async (row) => must(await admin.from("account_deletion_jobs").insert(row).select("id").single()).id,
    countTargetProperties: async (kind, targetId) => {
      const { q, col } = targetQuery(kind, targetId);
      const r = await q.select("id", { count: "exact", head: true }).eq(col, targetId);
      if (r.error) throw new Error(r.error.message);
      return r.count ?? 0;
    },
    listTargetProperties: async (kind, targetId, exclude, limit) => {
      const { q, col } = targetQuery(kind, targetId);
      let query = q.select("id,organization_id,reference").eq(col, targetId).order("created_at", { ascending: true }).limit(limit);
      if (exclude.length) query = query.not("id", "in", `(${exclude.join(",")})`);
      return must(await query) ?? [];
    },
    listPortalTargets: async (propertyId) => {
      const [listings, publications] = await Promise.all([
        admin.from("portal_listings").select("portal,external_id,public_url").eq("property_id", propertyId).not("external_id", "is", null),
        admin.from("portal_publications").select("portal_key").eq("property_id", propertyId).eq("enabled", true),
      ]);
      const rows: PortalTarget[] = [...(must(listings) ?? [])];
      for (const p of must(publications) ?? []) {
        if (!rows.some((r) => r.portal === p.portal_key)) rows.push({ portal: p.portal_key, external_id: null, public_url: null });
      }
      return rows;
    },
    listImages: async (propertyId) => must(await admin.from("property_images").select("id,storage_path").eq("property_id", propertyId)) ?? [],
    updateImagePath: async (id, path) => void must(await admin.from("property_images").update({ storage_path: path }).eq("id", id)),
    hardDeleteProperty: async (id) => void must(await admin.from("properties").delete().eq("id", id)),
    moveProperty: async (id, to, actor) => (must(await admin.rpc("account_deletion_move_property", { _property: id, _to_user: to, _actor: actor })) ?? { new_reference: null }) as { new_reference: string | null },
    reassignSameOrg: async (from, to, actor) => (must(await admin.rpc("superadmin_reassign_user_data", { _from: from, _to: to, _actor: actor })) ?? {}) as Record<string, number>,
    applyRest: async (kind, target, mode, to, actor) => (must(await admin.rpc("account_deletion_apply_rest", { _kind: kind, _target: target, _mode: mode, _to_user: to, _actor: actor })) ?? {}) as Record<string, number>,
    deleteUserRows: async (user, to, actor) => void must(await admin.rpc("superadmin_delete_user", { _user: user, _reassign_to: to, _actor: actor })),
    deleteOrganizationRows: async (org, actor) => {
      const r = (must(await admin.rpc("superadmin_delete_organization", { _org: org, _actor: actor })) ?? {}) as { auth_user_ids?: string[] };
      return { auth_user_ids: r.auth_user_ids ?? [], member_ids: [] };
    },
    listOrgMemberIds: async (org) => (must(await admin.from("profiles").select("id").eq("organization_id", org)) ?? []).map((r: { id: string }) => r.id),
    updateJob: async (id, patch) => void must(await admin.from("account_deletion_jobs").update(patch).eq("id", id)),
    audit: async (row) => void must(await admin.from("audit_logs").insert({ ...row, organization_id: null, created_by: row.actor_id })),
    arm: async () => void must(await admin.rpc("account_deletion_arm")),
    sameOrgSlotConflicts: async (from, to) => {
      const enabledPortals = async (userId: string) => {
        const props = (must(await admin.from("properties").select("id").eq("assigned_to", userId)) ?? []).map((r: { id: string }) => r.id);
        const counts: Record<string, number> = {};
        for (let i = 0; i < props.length; i += 200) {
          const rows = must(await admin.from("portal_publications").select("portal_key").eq("enabled", true).in("property_id", props.slice(i, i + 200))) ?? [];
          for (const r of rows as { portal_key: string }[]) counts[r.portal_key] = (counts[r.portal_key] ?? 0) + 1;
        }
        return counts;
      };
      const incoming = await enabledPortals(from);
      if (!Object.keys(incoming).length) return [];
      const allocations = (must(await admin.from("portal_slot_allocations").select("portal_key,slots").eq("user_id", to)) ?? []) as { portal_key: string; slots: number | null }[];
      const limited = allocations.filter((a) => a.slots !== null && incoming[a.portal_key]);
      if (!limited.length) return [];
      const used = await enabledPortals(to);
      const { portalDisplayName } = await import("@/lib/portals/registry");
      return limited
        .filter((a) => (used[a.portal_key] ?? 0) + incoming[a.portal_key] > (a.slots as number))
        .map((a) => portalDisplayName(a.portal_key as never));
    },
  };
}

export function supabaseDeletionStorage(admin: Admin): DeletionStorage {
  return {
    list: async (bucket, prefix) => {
      const out: StorageEntry[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as { name: string; id: string | null }[];
        out.push(...rows.map((r) => ({ name: r.name, folder: r.id === null })));
        if (rows.length < 1000) return out;
      }
    },
    remove: async (bucket, paths) => {
      if (!paths.length) return 0;
      const { data, error } = await admin.storage.from(bucket).remove(paths);
      if (error) throw new Error(error.message);
      return (data ?? []).length;
    },
    move: async (bucket, from, to) => {
      const { error } = await admin.storage.from(bucket).move(from, to);
      if (error) throw new Error(error.message);
    },
  };
}

export async function realDeletionDeps(admin: Admin): Promise<DeletionDeps> {
  const { performPortalWithdraw } = await import("@/lib/portals.functions");
  return {
    store: supabaseDeletionStore(admin),
    storage: supabaseDeletionStorage(admin),
    withdraw: (input) => performPortalWithdraw({ ...input, withdrawReason: "account_deleted" }),
    deleteAuthUser: async (id) => {
      const { error } = await admin.auth.admin.deleteUser(id);
      return { error: error?.message ?? null };
    },
  };
}

export async function runAccountDeletionTick(admin: Admin, deps: DeletionDeps, opts: { budgetMs: number; maxSteps: number }) {
  const started = Date.now();
  const results: { jobId: string; status: string }[] = [];
  for (let i = 0; i < opts.maxSteps && Date.now() - started < opts.budgetMs; i += 1) {
    const { data } = await admin.rpc("account_deletion_claim", { _ttl_seconds: 120 });
    const job = ((data ?? []) as DeletionJob[])[0];
    if (!job) break;
    const out = await processDeletionJob(job, deps);
    results.push({ jobId: job.id, status: out.status });
  }
  return results;
}
