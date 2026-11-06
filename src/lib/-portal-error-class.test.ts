import { describe, expect, it } from "vitest";
import {
  HIDE_LISTING_ERRORS_FILTER,
  PLATFORM_ERROR_CODE_FILTER,
  classifyPortalErrorCode,
  classifyPublicationError,
  countPlatformPublicationErrors,
} from "@/lib/portal-error-class";

describe("classifyPortalErrorCode — coduri găsite în portal_operation_logs", () => {
  it.each([
    ["INVALID_REQUEST", "listing"],
    ["VALIDATION_ERROR", "listing"],
    ["olx_http_400", "listing"],
    ["TIMEOUT", "platform"],
    ["PORTAL_ERROR", "platform"],
    ["CONFIG_ERROR", "platform"],
    ["RATE_LIMIT", "platform"],
    ["NOT_FOUND", "platform"],
    ["AUTH_ERROR", "platform"],
    ["olx_internal:PortalError", "platform"],
    [null, "platform"],
    ["COD_NECUNOSCUT", "platform"],
  ])("%s → %s", (code, expected) => {
    expect(classifyPortalErrorCode(code)).toBe(expected);
  });
});

describe("classifyPublicationError — textul de pe publicare", () => {
  it("anunț nepublicabil și câmpuri lipsă = completare", () => {
    expect(classifyPublicationError("Romimo.ro: Oferta nu este publicabilă: verifică statusul")).toBe("listing");
    expect(classifyPublicationError("La Cheie: publicarea este blocată — completează: Număr dormitoare")).toBe("listing");
    expect(classifyPublicationError("Vumsi a respins datele trimise. attrs: construction_year")).toBe("listing");
  });
  it("erori de server sau necunoscute = platformă", () => {
    expect(classifyPublicationError("Pozele nu au putut fi trimise la Vumsi: Vumsi a întâmpinat o eroare.")).toBe("platform");
    expect(classifyPublicationError(null)).toBe("platform");
  });
});

describe("agregarea de pe dashboard", () => {
  it("o eroare de completare nu intră în număr, una de platformă intră", () => {
    const rows = [
      { last_error: "Imospot.ro: Oferta nu este publicabilă: verifică statusul și publicarea pe site." },
      { last_error: "Portalul nu a răspuns în timp util." },
    ];
    expect(countPlatformPublicationErrors(rows)).toBe(1);
  });
  it("filtrul operațiunilor exclude codurile de completare", () => {
    expect(PLATFORM_ERROR_CODE_FILTER).toBe(
      "error_code.is.null,error_code.not.in.(INVALID_REQUEST,VALIDATION_ERROR,NOT_PUBLISHABLE,MISSING_FIELDS,olx_http_400,olx_http_422)",
    );
    expect(HIDE_LISTING_ERRORS_FILTER.startsWith("success.eq.true,")).toBe(true);
  });
  it("sloturile depășite țin de agenție, nu de platformă", () => {
    expect(classifyPortalErrorCode("SLOTS_EXCEEDED")).toBe("agency");
    expect(classifyPortalErrorCode(null, "Ai atins limita de anunțuri din pachet.")).toBe("agency");
    expect(classifyPublicationError("Nu mai sunt sloturi disponibile")).toBe("agency");
  });
});
