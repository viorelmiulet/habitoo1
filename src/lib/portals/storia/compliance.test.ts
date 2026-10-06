import { describe, expect, it } from "vitest";
import { PROBE_PATH, storiaProbeOutcome } from "../adapters/storia.server";
import { isPermanentRefreshFailure } from "./oauth.server";
import { PortalError } from "../errors";

describe("testul de conexiune Storia", () => {
  it("folosește endpointul documentat /advert/v1/meta", () => {
    expect(PROBE_PATH).toBe("/advert/v1/meta");
  });

  it("consideră valid doar un 2xx", () => {
    expect(storiaProbeOutcome(200).ok).toBe(true);
    expect(storiaProbeOutcome(204).ok).toBe(true);
    expect(storiaProbeOutcome(404).ok).toBe(false);
    expect(storiaProbeOutcome(400).ok).toBe(false);
    expect(storiaProbeOutcome(401).ok).toBe(false);
    expect(storiaProbeOutcome(503).ok).toBe(false);
  });
});

describe("reînnoirea tokenului", () => {
  it("400/401/403 la refresh înseamnă reconectare", () => {
    for (const status of [400, 401, 403]) {
      expect(isPermanentRefreshFailure(new PortalError("AUTH_ERROR", `token_http_${status}`))).toBe(true);
    }
  });

  it("rețeaua sau 5xx nu cer reconectare", () => {
    expect(isPermanentRefreshFailure(new PortalError("PORTAL_ERROR", "token_http_503"))).toBe(false);
    expect(isPermanentRefreshFailure(new PortalError("NETWORK_ERROR"))).toBe(false);
    expect(isPermanentRefreshFailure(new Error("x"))).toBe(false);
  });
});
