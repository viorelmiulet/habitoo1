/**
 * Stratul de cereri al interogării live (server-only).
 *
 * Politicos și identificat: User-Agent descriptiv cu adresă de contact,
 * robots.txt citit și respectat, o singură cerere în zbor per domeniu, timp
 * maxim de așteptare scurt. Fără autentificare, fără proxy, fără mascarea
 * identității, fără reîncercări în lanț. Se citește doar text: niciun byte de
 * imagine nu este descărcat.
 */
import { runSerialPerDomain } from "@/lib/collector/fetch.server";
import {
  parseRobotsTxt,
  robotsAllows,
  urlPathForRobots,
  EMPTY_ROBOTS,
  type RobotsRules,
} from "@/lib/collector/robots";

export const MARKET_QUERY_USER_AGENT =
  "HabitooACP/1.0 (+https://habitoo.ro/acp; contact@habitoo.ro)";

const MAX_BODY_BYTES = 2_000_000;
const ROBOTS_TTL_MS = 60 * 60 * 1000;

const robotsCache = new Map<string, { rules: RobotsRules; expiresAt: number }>();

export type MarketQueryFetchResult = {
  url: string;
  status: number;
  body: string | null;
  error: string | null;
};

function requestHeaders(): Record<string, string> {
  return {
    "User-Agent": MARKET_QUERY_USER_AGENT,
    Accept: "application/json,text/html;q=0.9,application/xml;q=0.8",
    "Accept-Language": "ro,en;q=0.8",
  };
}

async function loadRobots(target: URL, timeoutMs: number): Promise<RobotsRules> {
  const cached = robotsCache.get(target.host);
  if (cached && cached.expiresAt > Date.now()) return cached.rules;
  const robotsUrl = `${target.protocol}//${target.host}/robots.txt`;
  const result = await rawFetch(robotsUrl, timeoutMs);
  const rules = result.status === 200 ? parseRobotsTxt(result.body) : EMPTY_ROBOTS;
  robotsCache.set(target.host, { rules, expiresAt: Date.now() + ROBOTS_TTL_MS });
  return rules;
}

async function rawFetch(url: string, timeoutMs: number): Promise<MarketQueryFetchResult> {
  return runSerialPerDomain(url, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: requestHeaders(),
        signal: controller.signal,
      });
      const contentType = response.headers.get("content-type") ?? "";
      const readable =
        response.body !== null && (contentType === "" || /text\/|xml|json/i.test(contentType));
      let body: string | null = null;
      if (readable) {
        const raw = await response.text();
        body = raw.length > MAX_BODY_BYTES ? raw.slice(0, MAX_BODY_BYTES) : raw;
      }
      return { url, status: response.status, body, error: null };
    } catch (error) {
      return {
        url,
        status: 0,
        body: null,
        error: error instanceof Error ? error.message : "Cererea a eșuat.",
      };
    } finally {
      clearTimeout(timer);
    }
  });
}

/** O cerere politicoasă: robots.txt întâi, apoi pagina cerută. */
export async function marketQueryFetch(
  url: string,
  options: { timeoutMs?: number } = {},
): Promise<MarketQueryFetchResult> {
  const timeoutMs = options.timeoutMs ?? 4000;
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return { url, status: 0, body: null, error: "Adresă invalidă." };
  }
  const rules = await loadRobots(target, timeoutMs);
  if (!robotsAllows(rules, MARKET_QUERY_USER_AGENT, urlPathForRobots(url))) {
    return { url, status: 0, body: null, error: "robots.txt interzice această cale." };
  }
  return rawFetch(url, timeoutMs);
}

/** Doar pentru teste: uită regulile memorate. */
export function clearMarketQueryRobotsCache(): void {
  robotsCache.clear();
}
