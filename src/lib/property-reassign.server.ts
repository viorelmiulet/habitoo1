/**
 * Realocarea anunțurilor între utilizatorii aceleiași agenții.
 *
 * Logica e scrisă peste porturi mici, ca să poată fi testată fără bază de date.
 * Scrierea trece prin sesiunea apelantului: declanșatorii de locuri
 * (`portal_slots_guard_reassign`) și de rol (`guard_property_reassign`) rămân activi.
 */
import { humanizeSlotGuardError } from "@/lib/portals/slots";
import { resolveListingContact } from "@/lib/portals/listing-contact";

export const REASSIGN_ADMIN_ONLY = "Doar managerul agenției poate realoca anunțuri.";
export const REASSIGN_MAX_BATCH = 100;

export type ReassignProperty = {
  id: string;
  organization_id: string;
  assigned_to: string | null;
  reference: string | null;
  deleted_at: string | null;
};

export type ReassignTarget = {
  id: string;
  organization_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  roles: string[];
  hasActiveDeletionJob: boolean;
};

export type ReassignPorts = {
  callerId: string;
  isSuperadmin: () => Promise<boolean>;
  /** Organizațiile în care apelantul are rol agency_admin. */
  adminOrgIds: () => Promise<string[]>;
  loadProperties: (ids: string[]) => Promise<ReassignProperty[]>;
  loadTarget: (userId: string, organizationId: string) => Promise<ReassignTarget | null>;
  updateAssigned: (propertyId: string, userId: string) => Promise<{ error: string | null }>;
  audit: (row: {
    organizationId: string;
    action: string;
    entityId: string | null;
    values: Record<string, unknown>;
  }) => Promise<void>;
  portalName: (key: string) => string;
};

export type ReassignResult = {
  moved: number;
  skipped: number;
  blocked: { id: string; reference: string | null; message: string }[];
  phoneWarning: string | null;
};

export async function requireReassignAdmin(
  ports: Pick<ReassignPorts, "isSuperadmin" | "adminOrgIds">,
  organizationId: string,
): Promise<void> {
  if (await ports.isSuperadmin()) return;
  const orgs = await ports.adminOrgIds();
  if (!orgs.includes(organizationId)) throw new Error(REASSIGN_ADMIN_ONLY);
}

export async function reassignPropertiesCore(
  ports: ReassignPorts,
  input: { propertyIds: string[]; toUserId: string },
): Promise<ReassignResult> {
  const ids = [...new Set(input.propertyIds)];
  if (ids.length === 0) return { moved: 0, skipped: 0, blocked: [], phoneWarning: null };
  if (ids.length > REASSIGN_MAX_BATCH) {
    throw new Error(`Poți realoca cel mult ${REASSIGN_MAX_BATCH} anunțuri odată.`);
  }

  const superadmin = await ports.isSuperadmin();
  const adminOrgs = superadmin ? [] : await ports.adminOrgIds();
  if (!superadmin && adminOrgs.length === 0) throw new Error(REASSIGN_ADMIN_ONLY);

  const props = await ports.loadProperties(ids);
  const live = props.filter((p) => !p.deleted_at);
  if (live.length !== ids.length) {
    throw new Error("Unele anunțuri nu există, au fost șterse sau aparțin altei agenții.");
  }
  const orgIds = [...new Set(live.map((p) => p.organization_id))];
  if (orgIds.length !== 1) throw new Error("Toate anunțurile trebuie să aparțină aceleiași agenții.");
  const organizationId = orgIds[0]!;
  if (!superadmin && !adminOrgs.includes(organizationId)) {
    throw new Error("Unele anunțuri nu există, au fost șterse sau aparțin altei agenții.");
  }

  const target = await ports.loadTarget(input.toUserId, organizationId);
  if (!target || target.organization_id !== organizationId) {
    throw new Error("Destinatarul nu face parte din agenție.");
  }
  if (!target.is_active || target.hasActiveDeletionJob) {
    throw new Error("Destinatarul nu este un utilizator activ.");
  }
  if (!target.roles.some((r) => r === "agent" || r === "agency_admin")) {
    throw new Error("Destinatarul trebuie să fie agent sau manager al agenției.");
  }

  const result: ReassignResult = { moved: 0, skipped: 0, blocked: [], phoneWarning: null };
  const movedRows: { id: string; reference: string | null; from: string | null }[] = [];
  for (const p of live) {
    if (p.assigned_to === target.id) {
      result.skipped += 1;
      continue;
    }
    const { error } = await ports.updateAssigned(p.id, target.id);
    if (error) {
      const message =
        humanizeSlotGuardError(error, ports.portalName) ??
        (error.includes("Doar managerul") ? REASSIGN_ADMIN_ONLY : "Anunțul nu a putut fi mutat.");
      result.blocked.push({ id: p.id, reference: p.reference, message });
      continue;
    }
    result.moved += 1;
    movedRows.push({ id: p.id, reference: p.reference, from: p.assigned_to });
  }

  const contact = resolveListingContact({ assignedTo: target.id, agent: target });
  if (!contact.ok && result.moved > 0) {
    result.phoneWarning = `${contact.message} Anunțurile au fost mutate, dar nu se pot sincroniza pe portaluri până nu este completat telefonul.`;
  }

  if (movedRows.length > 0 || result.blocked.length > 0) {
    await ports.audit({
      organizationId,
      action: "property.reassigned",
      entityId: movedRows.length === 1 ? movedRows[0]!.id : null,
      values: {
        to_user_id: target.id,
        to_user_name: target.full_name ?? target.email,
        moved: movedRows,
        skipped: result.skipped,
        blocked: result.blocked,
      },
    });
  }
  return result;
}
