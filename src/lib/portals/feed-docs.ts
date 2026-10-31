/**
 * Documentația tehnică a portalurilor de tip feed (pull), descărcabilă din SuperAdmin.
 * Textul vine din docs/*.md; portalurile fără document propriu adaptează documentul comun.
 * Fără chei: URL-ul cu cheia se adaugă doar în PDF, pe server.
 */
import baseDoc from "../../../docs/feed-portaluri-habitoo.md?raw";
import imobiliareplusDoc from "../../../docs/feed-imobiliareplus.md?raw";
import { INDEX_PORTALS, type IndexPortal } from "@/lib/portals/clickimob/index-feed";

export const FEED_DOC_PORTALS = ["imobiliareplus", "imobli", "locuit", "clickimob"] as const satisfies readonly IndexPortal[];
export type FeedDocPortal = (typeof FEED_DOC_PORTALS)[number];

export const FEED_DOC_NAMES: Record<FeedDocPortal, string> = {
  imobiliareplus: "Imobiliare+",
  imobli: "Imobli.ro",
  locuit: "Locuit.ro",
  clickimob: "ClickImob",
};

export function isFeedDocPortal(id: string): id is FeedDocPortal {
  return (FEED_DOC_PORTALS as readonly string[]).includes(id);
}

export function feedIndexUrl(portal: FeedDocPortal, key: string, origin = "https://crm.habitoo.ro"): string {
  return `${origin}/api/public/feed/${portal}/index/${encodeURIComponent(key)}.json`;
}

export function feedDocMarkdown(portal: FeedDocPortal): string {
  if (portal === "imobiliareplus") return imobiliareplusDoc;
  let s = baseDoc
    .replace("## 5. Schema completă a ofertei — inclusiv formatul IMMOFLUX", "## 5. Schema completă a ofertei")
    .replace(/coduri numerice IMMOFLUX și/g, "coduri numerice și");
  if (portal !== "imobli") {
    const name = FEED_DOC_NAMES[portal];
    s = s
      .replace(/habitoo-imobli-index\/1\.0/g, INDEX_PORTALS[portal].version)
      .replace(/Imobli\.ro/g, name)
      .replace(/Imobli/g, name)
      .replace(/imobli/g, portal);
  }
  return s;
}
