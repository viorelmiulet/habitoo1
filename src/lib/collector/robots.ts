/**
 * robots.txt — parsare și aplicare, logică pură.
 *
 * Regulile portalului sunt obligatorii: `Disallow` blochează calea, iar
 * `Crawl-delay` stabilește pauza minimă. Nu există ocolire (fără proxy,
 * fără mascare de identitate, fără rezolvare de CAPTCHA).
 */

export type RobotsGroup = {
  agents: string[];
  allow: string[];
  disallow: string[];
  crawlDelayMs: number | null;
};

export type RobotsRules = { groups: RobotsGroup[] };

export const EMPTY_ROBOTS: RobotsRules = { groups: [] };

function normalizeAgent(value: string): string {
  return value.trim().toLowerCase();
}

export function parseRobotsTxt(body: string | null | undefined): RobotsRules {
  if (!body) return EMPTY_ROBOTS;
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let previousWasAgent = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (!current || !previousWasAgent) {
        current = { agents: [], allow: [], disallow: [], crawlDelayMs: null };
        groups.push(current);
      }
      current.agents.push(normalizeAgent(value));
      previousWasAgent = true;
      continue;
    }
    if (!current) continue;
    previousWasAgent = false;

    if (field === "disallow") {
      current.disallow.push(value);
    } else if (field === "allow") {
      current.allow.push(value);
    } else if (field === "crawl-delay") {
      const seconds = Number.parseFloat(value.replace(",", "."));
      if (Number.isFinite(seconds) && seconds > 0) {
        current.crawlDelayMs = Math.ceil(seconds * 1000);
      }
    }
  }
  return { groups };
}

/** Grupul cel mai specific pentru agentul nostru, altfel grupul `*`. */
export function robotsGroupFor(rules: RobotsRules, userAgent: string): RobotsGroup | null {
  const agent = normalizeAgent(userAgent);
  let wildcard: RobotsGroup | null = null;
  let best: { group: RobotsGroup; length: number } | null = null;

  for (const group of rules.groups) {
    for (const candidate of group.agents) {
      if (candidate === "*") {
        wildcard = wildcard ?? group;
        continue;
      }
      if (agent.includes(candidate) && (!best || candidate.length > best.length)) {
        best = { group, length: candidate.length };
      }
    }
  }
  return best?.group ?? wildcard;
}

function patternMatches(pattern: string, path: string): boolean {
  if (pattern === "") return false;
  const anchoredEnd = pattern.endsWith("$");
  const body = anchoredEnd ? pattern.slice(0, -1) : pattern;
  const parts = body.split("*");
  let index = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i] ?? "";
    if (i === 0) {
      if (!path.startsWith(part)) return false;
      index = part.length;
      continue;
    }
    if (part === "") continue;
    const found = path.indexOf(part, index);
    if (found < 0) return false;
    index = found + part.length;
  }
  if (anchoredEnd) return index === path.length;
  return true;
}

/** Calea completă (path + query), ca în documentația robots.txt. */
export function robotsAllows(rules: RobotsRules, userAgent: string, path: string): boolean {
  const group = robotsGroupFor(rules, userAgent);
  if (!group) return true;

  let longestDisallow = -1;
  for (const pattern of group.disallow) {
    if (pattern === "") continue; // „Disallow:” gol = totul permis
    if (patternMatches(pattern, path)) longestDisallow = Math.max(longestDisallow, pattern.length);
  }
  if (longestDisallow < 0) return true;

  let longestAllow = -1;
  for (const pattern of group.allow) {
    if (patternMatches(pattern, path)) longestAllow = Math.max(longestAllow, pattern.length);
  }
  return longestAllow >= longestDisallow;
}

export function robotsCrawlDelayMs(rules: RobotsRules, userAgent: string): number | null {
  return robotsGroupFor(rules, userAgent)?.crawlDelayMs ?? null;
}

/** Calea folosită la verificare: path + query, fără schemă și host. */
export function urlPathForRobots(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url.startsWith("/") ? url : `/${url}`;
  }
}
