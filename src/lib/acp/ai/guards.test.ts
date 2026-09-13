/**
 * Verificări statice ale fluxului AI: izolarea pe organizații, contextul
 * reconstruit exclusiv pe server, rate limiting, fallback fără provider și
 * faptul că modelul nu poate rescrie cifrele motorului.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const fn = readFileSync("src/lib/acp/ai.functions.ts", "utf8");
const provider = readFileSync("src/lib/acp/ai/provider.server.ts", "utf8");
const rateLimitSql = readFileSync("drizzle/migrations/0033_generic_rate_limit.sql", "utf8");
const prompt = readFileSync("src/lib/acp/ai/prompt.ts", "utf8");

describe("fluxul AI ACP – securitate și multi-tenancy", () => {
  it("acceptă de la client numai analysisId", () => {
    expect(fn).toContain('z.object({ analysisId: z.string().uuid() })');
    expect(fn).not.toContain("context: z.");
    expect(fn).not.toMatch(/inputValidator[\s\S]{0,400}comparables:/);
  });

  it("filtrează analiza după organizația utilizatorului", () => {
    expect(fn).toContain('.eq("organization_id", organizationId)');
    expect(fn).toContain("Analiza nu a fost găsită în agenția ta.");
  });

  it("cere autentificare cu agenție activă", () => {
    expect(fn).toContain("requireActiveOrgAuth");
  });

  it("aplică rate limit pe utilizator și pe agenție", () => {
    expect(fn).toContain("acp_ai:user:");
    expect(fn).toContain("acp_ai:org:");
    expect(fn).toContain('admin.rpc("rate_limit_hit"');
    expect(fn).toContain('status: "rate_limited"');
    expect(rateLimitSql).toContain("CREATE OR REPLACE FUNCTION public.rate_limit_hit");
    expect(rateLimitSql).toContain("SECURITY DEFINER");
    expect(rateLimitSql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(rateLimitSql).not.toContain("TO authenticated;");
  });

  it("funcționează fără provider configurat, fără crash", () => {
    expect(fn).toContain('status: "unavailable"');
    expect(fn).toContain("Analiza AI indisponibilă — configurează providerul.");
  });

  it("salvează doar rezultatul validat și nu atinge cifrele motorului", () => {
    expect(fn).toContain("const parsed = parseAcpAiInsight(raw)");
    const updateBlock = fn.slice(fn.indexOf('.from("acp_analyses")\n      .update('));
    for (const numericColumn of [
      "estimated_value",
      "estimated_min",
      "estimated_max",
      "recommended_listing_price",
      "median_price_per_sqm",
      "confidence_score",
      "comparables_count",
    ]) {
      expect(updateBlock.slice(0, 900)).not.toContain(numericColumn);
    }
    expect(fn).toContain("ai_summary: parsed.insight.executive_summary");
    expect(fn).toContain("ai_model: provider.model");
    expect(fn).toContain("ai_generated_at: generatedAt");
  });

  it("auditează generarea fără chei sau PII", () => {
    expect(fn).toContain("ACP_AUDIT_ACTIONS.aiGenerated");
    expect(fn).toContain("success: false");
    expect(fn).toContain("success: true");
    expect(fn).not.toContain("apiKey");
  });

  it("apelează providerul doar server-side, prin secret de mediu", () => {
    expect(provider).toContain('process.env["LOVABLE_API_KEY"]');
    expect(provider).not.toContain("VITE_");
    expect(provider).not.toContain("EXPO_PUBLIC");
    expect(provider).not.toMatch(/import\.meta\.env/);
  });

  it("convertește erorile providerului în mesaje sigure", () => {
    expect(provider).toContain("export function safeAiErrorMessage");
    expect(provider).toMatch(/status === 401 \|\| error\.status === 403/);
  });

  it("interzice explicit în prompt inventarea de comparabile sau cifre", () => {
    expect(prompt).toContain("Nu inventa comparabile");
    expect(prompt).toContain("Nu modifica, recalcula sau rotunji altfel cifrele primite");
    expect(prompt).toContain("Nu pretinde că ai accesat internetul");
  });
});
