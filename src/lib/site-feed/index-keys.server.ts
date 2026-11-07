import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { INDEX_PORTALS, verifyClickimobFeedToken, type IndexPortal } from "@/lib/portals/clickimob/index-feed";

export type IndexKeyRow = {
  id: string; portal: string; prefix: string; last4: string; key_hash: string;
  source: "managed" | "legacy"; status: "active" | "revoked";
  created_at: string; created_by: string | null; last_used_at: string | null;
};
export const hashIndexKey = (key: string) => createHash("sha256").update(key).digest("hex");
export function sameKeyHash(a: string, b: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
export function generateIndexKey(portal: IndexPortal) {
  const key = INDEX_PORTALS[portal].prefix + randomBytes(32).toString("hex");
  return { key, key_hash: hashIndexKey(key), prefix: INDEX_PORTALS[portal].prefix, last4: key.slice(-4) };
}
export function safeIndexKey(row: IndexKeyRow) {
  return { id: row.id, portal: row.portal, prefix: row.prefix, last4: row.last4, source: row.source,
    status: row.status, created_at: row.created_at, last_used_at: row.last_used_at };
}
async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
export async function readIndexKeys(portal: IndexPortal): Promise<IndexKeyRow[]> {
  const admin = await adminClient();
  const { data, error } = await admin.from("portal_index_keys").select("*").eq("portal", portal);
  if (error) throw new Error("Index key lookup unavailable");
  return data ?? [];
}
/** Register legacy metadata only on use or explicit administration; never store its plaintext. */
export async function legacyIndexKey(portal: IndexPortal, rows: IndexKeyRow[], actor: string | null = null) {
  const key = process.env[INDEX_PORTALS[portal].secret];
  if (!key) return null;
  const hash = hashIndexKey(key);
  const existing = rows.find(row => row.source === "legacy" && sameKeyHash(row.key_hash, hash));
  if (existing) return existing;
  const admin = await adminClient();
  const { data, error } = await admin.from("portal_index_keys").upsert({
    portal, prefix: INDEX_PORTALS[portal].prefix, last4: key.slice(-4), key_hash: hash,
    source: "legacy", created_by: actor,
  }, { onConflict: "portal,key_hash", ignoreDuplicates: true }).select("*").maybeSingle();
  if (error) throw new Error("Index key registration unavailable");
  if (data) return data;
  return (await readIndexKeys(portal)).find(row => sameKeyHash(row.key_hash, hash)) ?? null;
}
async function touchIndexKey(row: IndexKeyRow) {
  if (row.last_used_at && Date.now() - new Date(row.last_used_at).getTime() < 300_000) return;
  const admin = await adminClient();
  const { error } = await admin.rpc("portal_index_key_touch", { _id: row.id });
  if (error) throw new Error("Index key usage unavailable");
}
/** Returns a signing seed only after active, portal-scoped authentication. */
export async function authorizeIndexKey(portal: IndexPortal, candidate: string): Promise<string | null> {
  if (!candidate || candidate.length > 512) return null;
  const rows = await readIndexKeys(portal);
  const hash = hashIndexKey(candidate);
  let row = rows.find(item => sameKeyHash(item.key_hash, hash));
  if (!row) {
    const legacy = process.env[INDEX_PORTALS[portal].secret];
    if (!legacy || !sameKeyHash(hash, hashIndexKey(legacy))) return null;
    row = await legacyIndexKey(portal, rows) ?? undefined;
  }
  if (!row || row.status !== "active") return null;
  await touchIndexKey(row);
  // Hash is server-only and suffices to sign new tokens; legacy keeps its original signature.
  return row.source === "legacy" ? process.env[INDEX_PORTALS[portal].secret] ?? null : row.key_hash;
}
export async function verifyManagedAgencyToken(token: string, portal: IndexPortal): Promise<string | null> {
  const rows = await readIndexKeys(portal);
  for (const row of rows.filter(item => item.source === "managed" && item.status === "active")) {
    const office = verifyClickimobFeedToken(token, row.key_hash, portal);
    if (office) { await touchIndexKey(row); return office; }
  }
  const legacy = process.env[INDEX_PORTALS[portal].secret];
  const office = verifyClickimobFeedToken(token, legacy, portal);
  if (!office) return null;
  const row = await legacyIndexKey(portal, rows);
  if (!row || row.status !== "active") return null;
  await touchIndexKey(row);
  return office;
}