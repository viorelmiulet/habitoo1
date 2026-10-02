import { z } from "zod";

export const collaborationCommissionSchema = z.number().min(0).max(100).nullable();

export function parseOptionalCollaborationCommission(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return collaborationCommissionSchema.parse(Number(trimmed));
}

export function resolveCollaborationCommission(
  explicit: number | null | undefined,
  agencyDefault: number | null | undefined,
): number | null {
  if (explicit !== null && explicit !== undefined) return explicit;
  if (agencyDefault !== null && agencyDefault !== undefined) return agencyDefault;
  return null;
}
