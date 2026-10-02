import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/portals/bulk.functions", () => ({ getPortalBulkJob: vi.fn() }));

import {
  BULK_STARTED_MESSAGE,
  activePortalBulkJobs,
  finishPortalBulkJob,
  resetPortalBulkJobs,
  trackPortalBulkJob,
} from "./PortalBulkProgress";

const qc = () => ({ invalidateQueries: vi.fn(async () => {}) });

beforeEach(() => {
  resetPortalBulkJobs();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

describe("publicare în masă în fundal", () => {
  it("nu mai există panou fix", () => {
    for (const f of ["src/components/app/PortalBulkProgress.tsx", "src/components/app/PropertyPublishView.tsx"]) {
      const s = readFileSync(f, "utf8");
      expect(s).not.toContain("<aside");
      expect(s).not.toContain("Publicare în curs");
    }
  });
  it("toast „rulează în fundal” o singură dată", () => {
    trackPortalBulkJob("a");
    trackPortalBulkJob("a");
    expect(toastMock.success).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledWith(BULK_STARTED_MESSAGE);
  });
  it("starea e globală (supraviețuiește navigării) și un singur toast final + invalidări", () => {
    trackPortalBulkJob("a");
    expect(activePortalBulkJobs()).toEqual(["a"]);
    const client = qc();
    finishPortalBulkJob("a", { done: 3, failed: 0 }, client);
    finishPortalBulkJob("a", { done: 3, failed: 0 }, client);
    expect(toastMock.success).toHaveBeenLastCalledWith("Publicare finalizată: 3 reușite.");
    expect(toastMock.success).toHaveBeenCalledTimes(2);
    expect(client.invalidateQueries.mock.calls.map((c) => ((c as unknown[])[0] as { queryKey: string[] }).queryKey[0])).toEqual([
      "property-portals-matrix", "portal-filter-options", "portal-bulk-overview",
    ]);
    expect(activePortalBulkJobs()).toEqual([]);
  });
  it("eșecuri → toast de eroare cu numerele corecte", () => {
    trackPortalBulkJob("b");
    finishPortalBulkJob("b", { done: 4, failed: 2 }, qc());
    expect(toastMock.error).toHaveBeenCalledWith(
      "Publicare finalizată: 4 reușite, 2 eșuate. Verifică ofertele marcate «Refuzat».",
    );
  });
  it("două joburi simultane, notificări separate", () => {
    trackPortalBulkJob("a");
    trackPortalBulkJob("b");
    expect(activePortalBulkJobs()).toEqual(["a", "b"]);
    finishPortalBulkJob("a", { done: 1, failed: 0 }, qc());
    finishPortalBulkJob("b", { done: 0, failed: 1 }, qc());
    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledWith("Publicare finalizată: 1 reușite.");
  });
  it("watcherul e montat o singură dată în layout", () => {
    const s = readFileSync("src/routes/_authenticated/app.tsx", "utf8");
    expect(s.match(/<PortalBulkWatcher \/>/g)?.length).toBe(1);
  });
});
