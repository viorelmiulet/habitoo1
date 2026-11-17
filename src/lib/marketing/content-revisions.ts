/** Editorial dates: change only when the corresponding page content changes. */
export const CONTENT_MODIFIED: Record<string, string> = {
  "/": "2026-10-10", "/functionalitati": "2026-11-17",
  "/anunturi-proprietari": "2026-11-17", "/analiza-comparativa-de-piata": "2026-11-17",
  "/colaborare-intre-agentii": "2026-11-17", "/comisioane-agenti-imobiliari": "2026-11-17",
  "/import-proprietati": "2026-11-17", "/preturi": "2026-11-17", "/despre": "2026-09-27",
  "/contact": "2026-11-17", "/integrari": "2026-11-07", "/dezvoltatori": "2026-11-17",
  "/extensie-chrome": "2026-11-17", "/intrebari-frecvente": "2026-11-17",
  "/agentii": "2026-11-17", "/termeni": "2026-10-05", "/politica-de-confidentialitate": "2026-11-08",
};

// These pages all receive new editorial summaries and related links in SEO1.
export function contentModified(path: string): string | undefined {
  return CONTENT_MODIFIED[path] ?? (/^\/(functionalitati|integrari)\/[^/]+$/.test(path) ? "2026-11-17" : undefined);
}