import { isMarketingPath } from "./public-http";
import { CONTENT_MODIFIED, contentModified } from "./content-revisions";
import { FEATURE_PAGES } from "./feature-pages";
import { INTEGRATION_PAGES } from "@/lib/portals/integration-pages";
import { BLOG_ARTICLES_2026_11, BLOG_ARTICLES_REVISION } from "./blog-articles-2026-11";

export type ContentRevision = { url: string; revision: string };
export function staticContentRevisions(): ContentRevision[] {
  const paths = [...Object.keys(CONTENT_MODIFIED), ...FEATURE_PAGES.map(p => `/functionalitati/${p.slug}`), ...INTEGRATION_PAGES.map(p => `/integrari/${p.slug}`)];
  return paths.flatMap(path => {
    const revision = contentModified(path);
    return revision ? [{ url: `https://www.habitoo.ro${path}`, revision }] : [];
  }).concat(BLOG_ARTICLES_2026_11.map(a => ({ url: `https://www.habitoo.ro/blog/${a.slug}`, revision: BLOG_ARTICLES_REVISION })));
}
export function changedRevisions(current: ContentRevision[], sent: ContentRevision[]): ContentRevision[] {
  const receipts = new Map(sent.map(item => [item.url, item.revision]));
  const unique = new Map(current.filter(item => {
    const url = new URL(item.url);
    return url.origin === "https://www.habitoo.ro" && isMarketingPath(url.pathname) && receipts.get(item.url) !== item.revision;
  }).map(item => [item.url, item]));
  return [...unique.values()];
}