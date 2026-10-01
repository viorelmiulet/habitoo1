// Reguli pure pentru dialogul „Șterge utilizatorul” (Superadmin › Utilizatori).
import { z } from "zod";
import { portalDisplayName, type PortalId } from "@/lib/portals/registry";

/** Intrarea pentru `deletePlatformUser`: fără confirmare prin numele contului. */
export const deletePlatformUserInput = z.object({
  userId: z.string().uuid(),
  reassignToUserId: z.string().uuid().nullable(),
});

/** Intrarea pentru `deleteOrganizationPermanently`: fără confirmare prin nume. */
export const deleteOrganizationInput = z.object({
  organizationId: z.string().uuid(),
  mode: z.enum(["reassign", "delete"]).default("delete"),
  reassignToUserId: z.string().uuid().nullable().default(null),
});

export type DeletionChoice = "reassign" | "delete" | null;

type UserLike = {
  id: string;
  full_name: string;
  is_active: boolean;
  organization_id: string | null;
  organization_name: string | null;
  roles: string[];
};

/** Utilizatori activi din toate agențiile, grupați pe agenție, fără cel șters și fără superadmini. */
export function groupDeletionDestinations<T extends UserLike>(users: T[], deletingId: string, excludeOrganizationId?: string) {
  const groups = new Map<string, { organizationId: string; organizationName: string; users: T[] }>();
  for (const u of users) {
    if (excludeOrganizationId && u.organization_id === excludeOrganizationId) continue;
    if (u.id === deletingId || !u.is_active || !u.organization_id || u.roles.includes("superadmin")) continue;
    const g = groups.get(u.organization_id) ?? {
      organizationId: u.organization_id,
      organizationName: u.organization_name ?? "Agenție",
      users: [],
    };
    g.users.push(u);
    groups.set(u.organization_id, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, users: [...g.users].sort((a, b) => a.full_name.localeCompare(b.full_name, "ro")) }))
    .sort((a, b) => a.organizationName.localeCompare(b.organizationName, "ro"));
}

export function hasAssignedData(workload: Record<string, number> | null | undefined) {
  return Object.values(workload ?? {}).some((n) => Number(n) > 0);
}

/** „Șterge definitiv” e activ imediat ce alegerea e completă. */
export function canConfirmDeletion(input: {
  workload: Record<string, number> | null;
  choice: DeletionChoice;
  destinationId: string | null;
  pending?: boolean;
}) {
  if (input.pending || input.workload === null) return false;
  if (!hasAssignedData(input.workload)) return true;
  if (input.choice === "delete") return true;
  return input.choice === "reassign" && Boolean(input.destinationId);
}

/** Modul jobului: fără date → ștergere simplă (nimic de mutat). */
export function deletionJobMode(workload: Record<string, number>, choice: DeletionChoice): "reassign" | "delete" {
  return hasAssignedData(workload) && choice === "reassign" ? "reassign" : "delete";
}

/** De ce nu se poate șterge o agenție (sau null dacă se poate). */
export function organizationDeletionBlock(orgId: string, actorOrgId: string | null | undefined, superadminOrgIds: string[]) {
  if (actorOrgId && actorOrgId === orgId) return "Nu poți șterge agenția din care faci parte.";
  if (superadminOrgIds.includes(orgId)) return "Agenția are un cont de superadmin și nu poate fi ștearsă.";
  return null;
}

type JobError = { propertyId?: string; reference?: string | null; portal?: string; message?: string; authUser?: string };

/** Eroarea jobului ca propoziție clară în română. */
export function formatDeletionJobError(raw: unknown): string {
  const e = (raw && typeof raw === "object" ? raw : { message: String(raw ?? "") }) as JobError;
  const msg = (e.message ?? "").trim() || "eroare necunoscută";
  if (e.portal) {
    const name = portalDisplayName(e.portal as PortalId) || e.portal;
    return `Retragerea de pe ${name} a eșuat pentru ${e.reference ?? "proprietate"}: ${msg}. Ștergerea s-a oprit; nimic nu a fost șters pentru această proprietate.`;
  }
  if (e.authUser) return `Contul de autentificare nu a putut fi șters: ${msg}.`;
  return `Ștergerea s-a oprit: ${msg}.`;
}
