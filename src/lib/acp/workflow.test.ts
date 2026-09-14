/**
 * Etapa 6 ACP: fluxul de lucru din pagina proprietății.
 * Testele pure acoperă statusurile și comparația de preț; verificările statice
 * acoperă izolarea pe organizație, confirmarea explicită, auditul și rate limit.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  acpPriceComparison,
  acpPriceDeltaLabel,
  acpWorkflowStatus,
  ACP_WORKFLOW_STATUS_LABELS,
} from "./workflow";

const fn = readFileSync("src/lib/acp/workflow.functions.ts", "utf8");
const card = readFileSync("src/components/app/PropertyAcpCard.tsx", "utf8");
const page = readFileSync("src/routes/_authenticated/app.properties.$id.tsx", "utf8");

describe("statusul ACP în workflow", () => {
  it("proprietate fără ACP", () => {
    expect(acpWorkflowStatus(null)).toBe("none");
    expect(ACP_WORKFLOW_STATUS_LABELS.none).toBe("Fără analiză");
  });

  it("proprietate cu ACP finalizat", () => {
    expect(
      acpWorkflowStatus({ status: "completed", comparablesUsed: 3, estimatedValue: 100000 }),
    ).toBe("completed");
  });

  it("analiza în pregătire și în curs", () => {
    expect(acpWorkflowStatus({ status: "draft" })).toBe("preparing");
    expect(acpWorkflowStatus({ status: "running" })).toBe("running");
  });

  it("date insuficiente când nu există comparabile folosite sau estimare", () => {
    expect(
      acpWorkflowStatus({ status: "completed", comparablesUsed: 0, estimatedValue: 100000 }),
    ).toBe("insufficient_data");
    expect(
      acpWorkflowStatus({ status: "completed", comparablesUsed: 4, estimatedValue: null }),
    ).toBe("insufficient_data");
  });

  it("eroare când analiza are mesaj de eroare", () => {
    expect(acpWorkflowStatus({ status: "draft", errorMessage: "eșec" })).toBe("error");
  });
});

describe("comparația preț proprietate vs. recomandare ACP", () => {
  it("calculează diferența valorică și procentuală", () => {
    const c = acpPriceComparison({ currentPrice: 100000, recommendedPrice: 110000 });
    expect(c.differenceAmount).toBe(10000);
    expect(c.differencePercent).toBe(10);
    expect(c.direction).toBe("higher");
    expect(c.canApply).toBe(true);
    expect(acpPriceDeltaLabel(c)).toBe("+10000 EUR (+10%)");
  });

  it("nu afișează CTA de aplicare fără preț recomandat", () => {
    const c = acpPriceComparison({ currentPrice: 100000, recommendedPrice: null });
    expect(c.canApply).toBe(false);
    expect(c.differencePercent).toBeNull();
    expect(acpPriceDeltaLabel(c)).toBeNull();
  });

  it("valori zero/null nu produc NaN sau Infinity", () => {
    const zero = acpPriceComparison({ currentPrice: 0, recommendedPrice: 50000 });
    expect(zero.differenceAmount).toBeNull();
    expect(zero.differencePercent).toBeNull();
    expect(zero.canApply).toBe(true);
    const invalid = acpPriceComparison({ currentPrice: "abc", recommendedPrice: "xyz" });
    expect(invalid.recommendedPrice).toBeNull();
    expect(Number.isFinite(invalid.differenceAmount ?? 0)).toBe(true);
  });

  it("preț egal nu se mai aplică", () => {
    const c = acpPriceComparison({ currentPrice: 90000, recommendedPrice: 90000 });
    expect(c.direction).toBe("equal");
    expect(c.canApply).toBe(false);
  });
});

describe("securitate și multi-tenancy în workflow-ul ACP", () => {
  it("acceptă doar ID-uri validate cu Zod", () => {
    expect(fn).toContain('z.object({ propertyId: z.string().uuid() })');
    expect(fn).toContain('analysisId: z.string().uuid(), confirm: z.literal(true)');
  });

  it("filtrează proprietatea și analiza după organizația utilizatorului", () => {
    expect(fn).toContain("requireActiveOrgAuth");
    expect(fn).toContain('.eq("organization_id", actor.organizationId)');
    expect(fn).toContain("Proprietatea nu a fost găsită în agenția ta.");
    expect(fn).toContain("Analiza nu a fost găsită în agenția ta.");
  });

  it("cere confirmare explicită pentru aplicarea prețului", () => {
    expect(fn).toContain("z.literal(true)");
    expect(card).toContain("ConfirmDialog");
    expect(card).toContain("confirm: true");
    expect(card).toContain("Aplici prețul recomandat ACP?");
  });

  it("aplică prețul doar dintr-o analiză finalizată, cu preț recomandat", () => {
    expect(fn).toContain("Analiza nu are un preț recomandat care poate fi aplicat.");
    expect(fn).toMatch(/status !== "completed"/);
  });

  it("scrie audit pentru aplicarea recomandării", () => {
    expect(fn).toContain('priceApplied: "acp.price.applied"');
    expect(fn).toContain('entity: "property"');
    expect(fn).toContain("oldValues: { price: property.price ?? null }");
  });

  it("aplică rate limit pe utilizator și pe agenție", () => {
    expect(fn).toContain("acp_price:user:");
    expect(fn).toContain("acp_price:org:");
    expect(fn).toContain('admin.rpc("rate_limit_hit"');
  });

  it("nu recalculează la deschiderea paginii", () => {
    expect(fn).not.toContain("runAcpAnalysis");
    expect(card).not.toContain("rerunAcpAnalysis");
  });
});

describe("integrarea în pagina proprietății", () => {
  it("expune fila și CTA-ul ACP", () => {
    expect(page).toContain('["acp", "ACP"]');
    expect(page).toContain("PropertyAcpCard");
    expect(page).toContain("Analiză comparativă de piață (ACP)");
  });

  it("refolosește versionarea, raportul, AI-ul și Market Intelligence existente", () => {
    expect(card).toContain("recalculateAcpAsNewVersion");
    expect(card).toContain("generateAcpReport");
    expect(card).toContain("acpReportUrl");
    expect(card).toContain("MarketIntelligenceCard");
    expect(card).toContain("Interpretare AI");
  });

  it("blochează butoanele în timpul operațiunilor, evitând analize duplicate", () => {
    expect(card).toContain("disabled={busy}");
    expect(card).toMatch(/const busy =[\s\S]{0,200}isPending/);
  });

  it("marchează AI-ul ca strat explicativ, nu autoritativ", () => {
    expect(card).toContain(
      "Valorile ACP sunt calculate determinist și rămân autoritative.",
    );
  });

  it("mesajul de date insuficiente nu inventează cifre", () => {
    expect(card).toContain("Nu există suficiente comparabile pentru o estimare.");
  });
});
