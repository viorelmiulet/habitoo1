/**
 * Trecerea Housera staging → producție (H13): datele poartă mediul în care au fost create.
 * O conexiune din alt mediu devine „Reconectare necesară”, iar cursorul de evenimente se resetează.
 * Nimic nu se șterge.
 */
import { houseraConnectionEnv, type HouseraEnv } from "./config";

type Settings = Record<string, unknown>;

/** Setările noi pentru o conexiune din alt mediu; `null` = conexiunea e din mediul activ. */
export function houseraEnvMismatchPatch(settings: Settings | null | undefined, env: HouseraEnv): Settings | null {
  const s = { ...(settings ?? {}) };
  if (houseraConnectionEnv(s) === env) return null;
  if (s["reconnect_required"] && s["housera_env_mismatch"] === env && !("housera_events_cursor" in s)) return null;
  s["reconnect_required"] = true;
  s["housera_env_mismatch"] = env;
  delete s["housera_events_cursor"];
  return s;
}

/** Conexiunea poate fi folosită în mediul activ. */
export function houseraConnectionUsable(settings: Settings | null | undefined, env: HouseraEnv): boolean {
  return houseraConnectionEnv(settings) === env && !(settings ?? {})["reconnect_required"];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/** Marchează conexiunile Housera din celălalt mediu; întoarce câte au fost marcate acum. */
export async function reconcileHouseraEnvironment(admin: Admin, env: HouseraEnv): Promise<number> {
  const { data } = await admin.from("portal_connections").select("id, settings").eq("portal", "housera");
  let marked = 0;
  for (const c of (data ?? []) as Array<{ id: string; settings: Settings | null }>) {
    const next = houseraEnvMismatchPatch(c.settings, env);
    if (!next) continue;
    await admin.from("portal_connections").update({ settings: next }).eq("id", c.id);
    marked++;
  }
  return marked;
}

export type HouseraReadinessInput = {
  env: HouseraEnv;
  clientKeys: boolean;
  webhookSecret: boolean;
  webhookResponds: boolean | null;
  schemaEnv: HouseraEnv | null;
  connections: Array<{ status: string | null; settings: Settings | null; hasKey: boolean }>;
};
export type HouseraReadinessItem = { id: string; label: string; ok: boolean; note?: string };

export const HOUSERA_WEBHOOK_SECRET_NOTE =
  "În producție Housera poate trimite alt secret de semnare: la lansare înlocuiește doar valoarea lui HOUSERA_WEBHOOK_SECRET (același nume).";

/** Lista „Pregătire producție”, calculată fără apeluri externe. */
export function houseraReadiness(i: HouseraReadinessInput): { env: HouseraEnv; items: HouseraReadinessItem[]; reconnectCount: number } {
  const reconnectCount = i.connections.filter((c) => c.hasKey && !houseraConnectionUsable(c.settings, i.env)).length;
  const items: HouseraReadinessItem[] = [
    { id: "client_keys", label: "Cheile integratorului sunt setate", ok: i.clientKeys },
    { id: "webhook_secret", label: "Secretul webhook este setat", ok: i.webhookSecret, note: HOUSERA_WEBHOOK_SECRET_NOTE },
    { id: "webhook_receiver", label: "Receptorul webhook răspunde", ok: i.webhookResponds === true, note: i.webhookResponds === null ? "Neverificat" : undefined },
    { id: "schema", label: `Nomenclatorul este citit din mediul ${i.env === "production" ? "Producție" : "Test"}`, ok: i.schemaEnv === i.env },
    { id: "reconnect", label: reconnectCount ? `${reconnectCount} ${reconnectCount === 1 ? "agenție trebuie" : "agenții trebuie"} să se reconecteze` : "Nicio agenție nu trebuie să se reconecteze", ok: reconnectCount === 0 },
  ];
  return { env: i.env, items, reconnectCount };
}
