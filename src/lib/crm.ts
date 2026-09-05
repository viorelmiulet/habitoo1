import { supabase } from "@/integrations/supabase/client";

/** Scrie o intrare în jurnalul de audit. Eșecul nu blochează fluxul UI. */
export async function logAudit(params: {
  organizationId: string | null | undefined;
  actorId: string | null | undefined;
  action: string;
  entity?: string;
  entityId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}) {
  if (!params.organizationId) return;
  try {
    await supabase.from("audit_logs").insert({
      organization_id: params.organizationId,
      actor_id: params.actorId ?? null,
      action: params.action,
      entity: params.entity ?? null,
      entity_id: params.entityId ?? null,
      old_values: (params.oldValues ?? null) as never,
      new_values: (params.newValues ?? null) as never,
    } as never);
  } catch {
    /* audit best-effort */
  }
}

/**
 * Creează o notificare, evitând duplicatele: dacă există deja o notificare
 * necitită de același tip cu același titlu în ultimele `dedupeHours` ore, nu inserează.
 */
export async function notifyOnce(params: {
  organizationId: string | null | undefined;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  dedupeHours?: number;
}) {
  if (!params.organizationId) return;
  const since = new Date(Date.now() - (params.dedupeHours ?? 24) * 3_600_000).toISOString();
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", params.userId)
    .eq("type", params.type)
    .eq("title", params.title)
    .gte("created_at", since)
    .limit(1);
  if (existing && existing.length > 0) return;

  await supabase.from("notifications").insert({
    organization_id: params.organizationId,
    user_id: params.userId,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    link: params.link ?? null,
  } as never);
}

export const propertyTypeOptions = [
  "apartment",
  "studio",
  "house",
  "land",
  "commercial",
  "office",
  "industrial",
] as const;

export const propertyStatusOptions = [
  "draft",
  "active",
  "reserved",
  "negotiation",
  "sold",
  "rented",
  "expired",
  "archived",
] as const;

export const requestStatusOptions = ["new", "active", "working", "paused", "solved", "lost"] as const;

export const requestStatusLabels: Record<string, string> = {
  new: "Nouă",
  active: "Activă",
  working: "În lucru",
  paused: "Pauză",
  solved: "Rezolvată",
  lost: "Pierdută",
};

export const requestStatusTone: Record<string, "neutral" | "success" | "warning" | "info" | "danger"> = {
  new: "info",
  active: "success",
  working: "warning",
  paused: "neutral",
  solved: "info",
  lost: "danger",
};

export const activityStatusLabels: Record<string, string> = {
  planned: "Planificată",
  done: "Finalizată",
  cancelled: "Anulată",
};

export const activityStatusTone: Record<string, "neutral" | "success" | "warning" | "info" | "danger"> = {
  planned: "warning",
  done: "success",
  cancelled: "neutral",
};

export const leadLostReasons = [
  "Preț prea mare",
  "A cumpărat prin altă agenție",
  "A renunțat",
  "Nu răspunde",
  "Nu are finanțare",
  "Altul",
];

/** Descarcă un CSV din rânduri simple. */
export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]!);
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
