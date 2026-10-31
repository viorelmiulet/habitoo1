/**
 * Descărcarea documentației feedului (doar SuperAdmin). Cheia indexului apare
 * numai în PDF: nu se loghează, nu intră în audit și nu e returnată altfel.
 */
import { INDEX_PORTALS } from "@/lib/portals/clickimob/index-feed";
import { FEED_DOC_NAMES, feedDocMarkdown, feedIndexUrl, isFeedDocPortal } from "@/lib/portals/feed-docs";
import { buildFeedDocPdf } from "@/lib/portals/feed-docs-pdf.server";

export type FeedDocDeps = {
  isSuperadmin: () => Promise<boolean>;
  readKey: (secretName: string) => string | undefined;
  audit: (row: { action: string; entity: string; entity_id: string; organization_id: string | null; new_values: Record<string, string> }) => Promise<void>;
  now?: () => Date;
};

export type FeedDocResult =
  | { ok: true; filename: string; pdfBase64: string }
  | { ok: false; status: 400 | 403 | 503; message: string };

export async function buildFeedDocDownload(
  input: { portal: string; organizationId: string | null },
  deps: FeedDocDeps,
): Promise<FeedDocResult> {
  if (!(await deps.isSuperadmin())) return { ok: false, status: 403, message: "Acces refuzat: doar Superadmin." };
  if (!isFeedDocPortal(input.portal)) return { ok: false, status: 400, message: "Portal fără documentație de feed." };
  const portal = input.portal;
  const key = deps.readKey(INDEX_PORTALS[portal].secret);
  if (!key) return { ok: false, status: 503, message: "Cheia indexului nu este configurată." };
  const generatedAt = (deps.now ?? (() => new Date()))();
  const bytes = await buildFeedDocPdf({
    portalName: FEED_DOC_NAMES[portal],
    indexUrl: feedIndexUrl(portal, key),
    generatedAt,
    markdown: feedDocMarkdown(portal),
  });
  await deps.audit({
    action: "portal.feed_doc.download",
    entity: "portal",
    entity_id: portal,
    organization_id: input.organizationId,
    new_values: { portal, generated_at: generatedAt.toISOString() },
  });
  return {
    ok: true,
    filename: `habitoo-feed-${portal}-${generatedAt.toISOString().slice(0, 10)}.pdf`,
    pdfBase64: Buffer.from(bytes).toString("base64"),
  };
}
