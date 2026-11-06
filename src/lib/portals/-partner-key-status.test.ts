import { describe, expect, it } from "vitest";
import { currentPartnerKeyError } from "./partner-key-status";
import { HOMEDIRECT_KEY_MISSING_MESSAGE } from "./homedirect/config";

describe("currentPartnerKeyError", () => {
  it("ignoră mesajul vechi de cheie lipsă după ce cheia HomeDirect există", () => {
    expect(currentPartnerKeyError("homedirect", HOMEDIRECT_KEY_MISSING_MESSAGE, { HOMEDIRECT_CRM_API_KEY: "k" })).toBeNull();
  });
  it("păstrează mesajul când cheia lipsește încă", () => {
    expect(currentPartnerKeyError("homedirect", HOMEDIRECT_KEY_MISSING_MESSAGE, {})).toBe(HOMEDIRECT_KEY_MISSING_MESSAGE);
  });
  it("păstrează alte erori", () => {
    expect(currentPartnerKeyError("homedirect", "Alt mesaj", { HOMEDIRECT_CRM_API_KEY: "k" })).toBe("Alt mesaj");
  });
});
