import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const REAL_ESTATE_FEED_URL = "https://www.economica.net/imobiliare/feed";
export const REAL_ESTATE_FEED_SOURCE = "Economica.net";
export type RealEstateNewsItem = { title: string; link: string; date: string | null };

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .trim();

/** Parsează itemii RSS (titlu, link https, dată ISO). Fără DOMParser, ca să ruleze pe Worker. */
export function parseRssItems(xml: string, limit = 3): RealEstateNewsItem[] {
  const out: RealEstateNewsItem[] = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/g)) {
    const pick = (tag: string) => m[0].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1];
    const title = decode(pick("title") ?? "");
    const link = decode(pick("link") ?? "");
    if (!title || !/^https:\/\//.test(link)) continue;
    const d = pick("pubDate") ? new Date(decode(pick("pubDate")!)) : null;
    out.push({ title, link, date: d && !isNaN(d.getTime()) ? d.toISOString() : null });
    if (out.length >= limit) break;
  }
  return out;
}

/** Ultimele știri imobiliare din fluxul public; la eroare, listă goală. */
export const getRealEstateNews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<RealEstateNewsItem[]> => {
    try {
      const res = await fetch(REAL_ESTATE_FEED_URL, {
        headers: { "User-Agent": "Mozilla/5.0 (HabitooCRM)", Accept: "application/rss+xml, application/xml" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      return parseRssItems(await res.text());
    } catch {
      return [];
    }
  });
