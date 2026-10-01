// Reguli pure pentru dialogul „Șterge utilizatorul” (Superadmin › Utilizatori).
import { z } from "zod";

/** Intrarea pentru `deletePlatformUser`: fără confirmare prin numele contului. */
export const deletePlatformUserInput = z.object({
  userId: z.string().uuid(),
  reassignToUserId: z.string().uuid().nullable(),
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
export function groupDeletionDestinations<T extends UserLike>(users: T[], deletingId: string) {
  const groups = new Map<string, { organizationId: string; organizationName: string; users: T[] }>();
  for (const u of users) {
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
