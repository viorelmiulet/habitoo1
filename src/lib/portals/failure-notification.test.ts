import { describe, expect, it, vi } from "vitest";
import { notifyPortalFailure } from "./failure-notification.server";

describe("portal failure notification boundary", () => {
  it("delegates the agency, property and failure to the existing transactional alert", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    const admin = { rpc } as unknown as Parameters<typeof notifyPortalFailure>[0];
    await notifyPortalFailure(admin, { organizationId: "org1", propertyId: "p1", portalKey: "storia", portalName: "Storia", error: "HTTP 401", code: "AUTH_ERROR", httpStatus: 401 });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("record_portal_alert", {
      _org: "org1", _property: "p1", _portal: "storia", _operation: "publish", _success: false,
      _message: "HTTP 401", _code: "AUTH_ERROR", _http: 401, _name: "Storia",
    });
  });

  it("preserves explicit operation and nullable diagnostics", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    const admin = { rpc } as unknown as Parameters<typeof notifyPortalFailure>[0];
    await notifyPortalFailure(admin, { organizationId: "org2", propertyId: "p2", portalKey: "storia", portalName: "Storia", error: "failure", operation: "update" });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("record_portal_alert", { _org: "org2", _property: "p2", _portal: "storia", _name: "Storia", _operation: "update", _success: false, _message: "failure" });
  });

  it("does not silently discard a failed alert", async () => {
    const error = new Error("alert failed");
    const admin = { rpc: vi.fn(async () => ({ error })) } as unknown as Parameters<typeof notifyPortalFailure>[0];
    await expect(notifyPortalFailure(admin, { organizationId: "org1", propertyId: "p1", portalKey: "storia", portalName: "Storia", error: "failure" })).rejects.toBe(error);
  });
});