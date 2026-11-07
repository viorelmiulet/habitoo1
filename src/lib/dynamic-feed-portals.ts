import { z } from "zod";
import type { PortalDefinition } from "./portals/registry";

export type DynamicFeedPortal = {
  slug: string; display_name: string; key_prefix: string; website: string;
  logo_path: string | null; xml_enabled: boolean; active: boolean; show_public: boolean;
  integration_mode?: "feed" | "api" | "both" | string;
};
export const dynamicFeedPortalSchema = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/, "Identificatorul trebuie să aibă 2–40 de litere mici, cifre sau cratime."),
  display_name: z.string().trim().min(2).max(100),
  website: z.string().url().max(500).refine(v => new URL(v).protocol === "https:", "Folosește o adresă HTTPS."),
  xml_enabled: z.boolean().default(false), show_public: z.boolean().default(false),
  logo_path: z.string().regex(/^[a-z][a-z0-9-]{1,39}\/[a-f0-9-]{36}\.(png|jpg|webp)$/).nullable().default(null),
});
export function dynamicPortalDefinition(row: DynamicFeedPortal): PortalDefinition {
  return { id: row.slug, display_name: row.display_name,
    description: row.integration_mode === "api" ? `${row.display_name} are acces Partner API numai pentru agențiile care aprobă activarea.` : `${row.display_name} preia automat anunțurile selectate, agenții și fotografiile din feedul Habitoo.`,
    logo: row.display_name.slice(0, 2).toUpperCase(), status: row.active ? "available" : "disabled",
    activation: "approval", directions: ["habitoo_to_portal"], authentication: ["none"],
    capabilities: ["feed_pull", "test_connection", "update_listing", "withdraw_listing", "sync"],
    receives_leads: true, withdraws_via_feed: true, configuration_schema: { fields: [] },
    website: row.website, dynamic_feed: true, show_public: row.show_public,
    logo_url: row.logo_path ? `/api/public/feed/${row.slug}/logo` : undefined,
  };
}
/** Deterministic slug-derived search; all 676 combinations are considered, uniqueness is also transactional. */
export function chooseFeedPrefix(slug: string, occupied: Iterable<string>): string {
  const taken = new Set(occupied);
  const letters = slug.replace(/[^a-z]/g, "");
  const preferred = `hb${letters.slice(0, 2).padEnd(2, "x")}_`;
  if (!taken.has(preferred)) return preferred;
  const offset = [...slug].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 676, 0);
  for (let i = 0; i < 676; i++) {
    const n = (offset + i) % 676;
    const prefix = `hb${String.fromCharCode(97 + Math.floor(n / 26), 97 + n % 26)}_`;
    if (!taken.has(prefix)) return prefix;
  }
  throw new Error("Nu mai există prefixe disponibile.");
}