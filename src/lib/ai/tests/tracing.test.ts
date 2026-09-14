/**
 * Tracing: traseul complet este urmăribil, iar secretele nu ajung niciodată
 * în evenimente.
 */
import { describe, expect, it } from "vitest";
import { AiTracer, scrubTraceDetails } from "../tracing/trace";
import { toTraceRows } from "../tracing/trace.server";
import { scrapingStatus, runScraping, SCRAPING_NOT_CONFIGURED } from "../scraping/types";

const base = { organizationId: "org-a", userId: "user-a" };

describe("tracing", () => {
  it("reconstituie traseul utilizator → agent → tool → răspuns", async () => {
    const tracer = new AiTracer("trace-1", base);
    tracer.record("agent", "habitooCoordinator");
    await tracer.span("tool", "search_properties", async () => "ok");
    tracer.record("model", "gemini:flash", { latencyMs: 12 });
    tracer.record("agent", "habitooCoordinator.done");
    expect(tracer.summary().path).toEqual([
      "agent:habitooCoordinator",
      "tool:search_properties",
      "model:gemini:flash",
      "agent:habitooCoordinator.done",
    ]);
    expect(tracer.summary().failed).toBe(0);
  });

  it("înregistrează eșecul unui pas fără a-l ascunde", async () => {
    const tracer = new AiTracer("trace-2", base);
    await expect(
      tracer.span("tool", "get_property", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow();
    expect(tracer.summary().failed).toBe(1);
    expect(tracer.list()[0]?.kind).toBe("error");
  });

  it("nu păstrează câmpuri care ar putea conține secrete", () => {
    const scrubbed = scrubTraceDetails({
      apiKey: "AIza-secret",
      authorization: "Bearer x",
      tool: "get_property",
    });
    expect(scrubbed).toEqual({ tool: "get_property" });
  });

  it("rândurile scrise în baza de date păstrează agenția și trace-ul", () => {
    const tracer = new AiTracer("trace-3", { ...base, runId: "run-1" });
    tracer.record("workflow", "habitooDiagnosticWorkflow.start");
    const [row] = toTraceRows(tracer.list());
    expect(row).toMatchObject({
      organization_id: "org-a",
      trace_id: "trace-3",
      run_id: "run-1",
      kind: "workflow",
    });
  });
});

describe("scraping (doar arhitectură)", () => {
  it("nu există provider configurat în Stage 11", () => {
    expect(scrapingStatus().configured).toBe(false);
  });

  it("orice cerere de scraping este refuzată controlat", async () => {
    const result = await runScraping({ url: "https://example.com", purpose: "market_listing" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(SCRAPING_NOT_CONFIGURED);
  });
});
