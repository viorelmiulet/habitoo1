/**
 * Stratul subțire de cereri al colectorului (server-only).
 *
 * O singură cerere în zbor per domeniu, pauza dintre cereri respectată,
 * cereri condiționate, fără reîncercări în lanț. Se cere doar HTML/text:
 * niciun byte de imagine nu este descărcat vreodată.
 */
import { collectorRequestHeaders } from "./politeness";

export type CollectorFetchResult = {
  url: string;
  status: number;
  body: string | null;
  etag: string | null;
  lastModified: string | null;
  retryAfterMs: number | null;
  error?: string | null;
};

export type CollectorFetchOptions = {
  etag?: string | null;
  lastModified?: string | null;
  timeoutMs?: number;
};

const MAX_BODY_BYTES = 3_000_000;

/** Cozi per domeniu: o cerere pe rând, cu pauza cerută de sursă. */
const domainQueues = new Map<string, Promise<unknown>>();

function domainOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function runSerialPerDomain<T>(url: string, task: () => Promise<T>): Promise<T> {
  const host = domainOf(url);
  const previous = domainQueues.get(host) ?? Promise.resolve();
  const next = previous.then(task, task);
  domainQueues.set(
    host,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

export function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number.parseInt(header.trim(), 10);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

export async function collectorFetch(
  url: string,
  options: CollectorFetchOptions = {},
): Promise<CollectorFetchResult> {
  return runSerialPerDomain(url, async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: collectorRequestHeaders(options),
        signal: controller.signal,
      });
      const contentType = response.headers.get("content-type") ?? "";
      // Nu citim niciodată conținut binar (imagini, arhive, PDF).
      const readable =
        response.status !== 304 &&
        response.body !== null &&
        (contentType === "" || /text\/|xml|json/i.test(contentType));
      let body: string | null = null;
      if (readable) {
        const text = await response.text();
        body = text.length > MAX_BODY_BYTES ? text.slice(0, MAX_BODY_BYTES) : text;
      }
      return {
        url,
        status: response.status,
        body,
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
      };
    } catch (error) {
      return {
        url,
        status: 0,
        body: null,
        etag: null,
        lastModified: null,
        retryAfterMs: null,
        error: error instanceof Error ? error.message : "Cererea a eșuat.",
      };
    } finally {
      clearTimeout(timeout);
    }
  });
}
