/**
 * Taxonomia Storia consumată din sursa reală: `GET /taxonomy/v1/categories/partner/{site}`.
 *
 * Rol:
 *  - descarcă arborele de categorii cu atributele lor (tip, obligatoriu, valori);
 *  - îl păstrează în cache (`portal_taxonomy_cache`), NU se descarcă la publicare;
 *  - compară taxonomia reală cu instantaneul din cod și raportează diferențele,
 *    ca să știm imediat dacă maparea a rămas în urma portalului.
 */
import { OLX_API_BASE, OLX_USER_AGENT, STORIA_SITE_URN } from "./config";
import {
  STORIA_TAXONOMY_SNAPSHOT,
  type StoriaAttributeSpec,
  type StoriaAttributeType,
  type StoriaCategorySpec,
} from "./taxonomy-snapshot";
import { REQUIRED_ATTRIBUTES, STORIA_USED_CATEGORIES } from "./taxonomy";

const TAXONOMY_TTL_MS = 24 * 60 * 60 * 1000; // o dată pe zi

export type StoriaTaxonomy = Record<string, StoriaCategorySpec>;

export type StoriaTaxonomyDiscrepancies = {
  /** Categorii pe care Habitoo le folosește, dar care nu există în arborele real. */
  missingCategories: string[];
  /** Categorii noi pe portal, pe care Habitoo nu le folosește încă. */
  unusedCategories: string[];
  /** Atribute pe care Storia le cere, dar lipsesc din lista noastră de obligatorii. */
  newRequired: { category: string; attribute: string }[];
  /** Atribute pe care le tratam obligatoriu, dar portalul le declară opționale. */
  noLongerRequired: { category: string; attribute: string }[];
  /** Atribute din instantaneul din cod care au dispărut sau și-au schimbat tipul. */
  changedAttributes: {
    category: string;
    attribute: string;
    was: StoriaAttributeType | "absent";
    now: StoriaAttributeType | "absent";
  }[];
};

type RawNode = {
  code?: unknown;
  label?: unknown;
  children?: unknown;
  attributes?: unknown;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function attributeType(value: unknown): StoriaAttributeType {
  return value === "select" || value === "multiple" ? value : "input";
}

/** Transformă răspunsul brut în forma folosită de mapper (doar categorii-frunză). */
export function normalizeStoriaTaxonomy(payload: unknown): StoriaTaxonomy {
  const root = (payload as { data?: unknown } | null)?.data;
  const out: StoriaTaxonomy = {};

  const walk = (nodes: unknown): void => {
    if (!Array.isArray(nodes)) return;
    for (const raw of nodes as RawNode[]) {
      const code = asString(raw?.code);
      const children = raw?.children;
      if (Array.isArray(children) && children.length > 0) {
        walk(children);
        continue;
      }
      if (!code) continue;

      const merged = new Map<string, StoriaAttributeSpec & { values: string[] }>();
      const attributes = Array.isArray(raw?.attributes) ? raw.attributes : [];
      for (const rawAttribute of attributes as RawNode[] & { mandatory?: unknown }[]) {
        const attributeCode = asString((rawAttribute as RawNode)?.code);
        if (!attributeCode) continue;
        const existing =
          merged.get(attributeCode) ??
          {
            code: attributeCode,
            type: attributeType((rawAttribute as { type?: unknown }).type),
            mandatory: false,
            values: [] as string[],
          };
        if ((rawAttribute as { mandatory?: unknown }).mandatory === true) existing.mandatory = true;
        const values = (rawAttribute as { values?: unknown }).values;
        if (Array.isArray(values)) {
          for (const value of values as RawNode[]) {
            const valueCode = asString(value?.code);
            if (valueCode && !existing.values.includes(valueCode)) existing.values.push(valueCode);
          }
        }
        merged.set(attributeCode, existing);
      }

      out[code] = {
        label: asString(raw?.label) ?? code,
        attributes: [...merged.values()].map((a) => ({ ...a, values: [...a.values].sort() })),
      };
    }
  };

  walk(root);
  return out;
}

/** Compară taxonomia reală cu instantaneul și lista de obligatorii din cod. */
export function diffStoriaTaxonomy(live: StoriaTaxonomy): StoriaTaxonomyDiscrepancies {
  const diff: StoriaTaxonomyDiscrepancies = {
    missingCategories: [],
    unusedCategories: [],
    newRequired: [],
    noLongerRequired: [],
    changedAttributes: [],
  };

  for (const category of STORIA_USED_CATEGORIES) {
    if (!live[category]) diff.missingCategories.push(category);
  }
  for (const category of Object.keys(live)) {
    if (!STORIA_USED_CATEGORIES.includes(category)) diff.unusedCategories.push(category);
  }

  for (const [category, liveSpec] of Object.entries(live)) {
    const known = REQUIRED_ATTRIBUTES[category] ?? [];
    const liveRequired = liveSpec.attributes.filter((a) => a.mandatory).map((a) => a.code);
    for (const attribute of liveRequired) {
      if (!known.includes(attribute)) diff.newRequired.push({ category, attribute });
    }
    for (const attribute of known) {
      if (!liveRequired.includes(attribute)) diff.noLongerRequired.push({ category, attribute });
    }

    const snapshot = STORIA_TAXONOMY_SNAPSHOT[category];
    if (!snapshot) continue;
    for (const attribute of snapshot.attributes) {
      const now = liveSpec.attributes.find((a) => a.code === attribute.code);
      if (!now) {
        diff.changedAttributes.push({
          category,
          attribute: attribute.code,
          was: attribute.type,
          now: "absent",
        });
      } else if (now.type !== attribute.type) {
        diff.changedAttributes.push({
          category,
          attribute: attribute.code,
          was: attribute.type,
          now: now.type,
        });
      }
    }
  }

  return diff;
}

/**
 * Descarcă taxonomia de la OLX. Cererea de taxonomie se autentifică cu cheia de
 * aplicație (`X-API-KEY`); dacă portalul cere și Bearer, îl adăugăm când avem
 * tokenul unei agenții conectate.
 */
export async function fetchStoriaTaxonomy(accessToken?: string | null): Promise<StoriaTaxonomy> {
  const apiKey = (process.env["OLX_API_KEY"] ?? "").trim();
  if (!apiKey) throw new Error("Cheia de aplicație OLX lipsește din configurare.");

  const url = `${OLX_API_BASE}/taxonomy/v1/categories/partner/${encodeURIComponent(STORIA_SITE_URN)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-API-KEY": apiKey,
        "User-Agent": OLX_USER_AGENT,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(
        `Taxonomia Storia nu a putut fi descărcată (HTTP ${response.status}). ${raw.slice(0, 200)}`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Răspunsul de taxonomie Storia nu este JSON valid.");
    }
    const normalized = normalizeStoriaTaxonomy(parsed);
    if (Object.keys(normalized).length === 0) {
      throw new Error("Taxonomia Storia a venit goală; nu am actualizat cache-ul.");
    }
    return normalized;
  } finally {
    clearTimeout(timeout);
  }
}

export type StoriaTaxonomyCache = {
  fetchedAt: string;
  categoryCount: number;
  discrepancies: StoriaTaxonomyDiscrepancies;
  stale: boolean;
};

function cacheView(row: {
  fetched_at: string;
  categories: unknown;
  discrepancies: unknown;
}): StoriaTaxonomyCache {
  const categories = (row.categories ?? {}) as StoriaTaxonomy;
  const fetchedAt = row.fetched_at;
  return {
    fetchedAt,
    categoryCount: Object.keys(categories).length,
    discrepancies: (row.discrepancies ?? {}) as StoriaTaxonomyDiscrepancies,
    stale: Date.now() - new Date(fetchedAt).getTime() > TAXONOMY_TTL_MS,
  };
}

/** Starea cache-ului, pentru afișare în Superadmin. */
export async function readStoriaTaxonomyCache(): Promise<StoriaTaxonomyCache | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("portal_taxonomy_cache")
    .select("fetched_at, categories, discrepancies")
    .eq("portal", "storia")
    .eq("site_urn", STORIA_SITE_URN)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? cacheView(data) : null;
}

/** Descarcă și rescrie cache-ul. Se apelează manual sau la expirarea TTL-ului. */
export async function refreshStoriaTaxonomyCache(input: {
  organizationId?: string | null;
  actorId?: string | null;
  accessToken?: string | null;
}): Promise<StoriaTaxonomyCache> {
  const live = await fetchStoriaTaxonomy(input.accessToken ?? null);
  const discrepancies = diffStoriaTaxonomy(live);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const fetchedAt = new Date().toISOString();
  const { error } = await supabaseAdmin.from("portal_taxonomy_cache").upsert(
    {
      portal: "storia",
      site_urn: STORIA_SITE_URN,
      fetched_at: fetchedAt,
      fetched_by: input.actorId ?? null,
      organization_id: input.organizationId ?? null,
      categories: live as unknown as never,
      discrepancies: discrepancies as unknown as never,
    },
    { onConflict: "portal,site_urn" },
  );
  if (error) throw new Error(error.message);
  return {
    fetchedAt,
    categoryCount: Object.keys(live).length,
    discrepancies,
    stale: false,
  };
}
